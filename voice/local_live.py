"""
Local full-duplex voice sidecar for Enterprise AI Control Tower.

Architecture:
  DORMANT mode  → WakeWordDetector (tiny Whisper on 1.5s chunks)
                    → phrase match "hey tower" → ACTIVE mode
  ACTIVE mode   → VAD → audio_queue → faster-whisper → text_queue
                    → LLM (Groq/Ollama/backend) streaming → sentence_queue
                    → Piper TTS / Groq TTS → playback_queue → speaker
                    → silence timeout → DORMANT mode

State machine:
  DORMANT  ──[wake word]──▶  ACTIVE  ──[silence N sec]──▶  DORMANT
  ACTIVE   ──[user speaks]──▶ SPEAKING ──[response done]──▶ ACTIVE
"""

from __future__ import annotations

import argparse
import json
import os
import queue
import signal
import subprocess
import threading
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Dict, Iterator, List, Optional

import numpy as np
import requests
import sounddevice as sd

# Set HuggingFace token so faster-whisper can download models from HF Hub
_hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN", "")
if _hf_token:
    os.environ["HF_TOKEN"] = _hf_token
    os.environ["HUGGINGFACE_TOKEN"] = _hf_token
    print(f"[HF] HuggingFace token configured ({_hf_token[:8]}...)")

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None  # type: ignore[assignment]

try:
    from groq import Groq as GroqClient
    _GROQ_AVAILABLE = True
except ImportError:
    GroqClient = None  # type: ignore[assignment]
    _GROQ_AVAILABLE = False


# ─────────────────────────── enums / state ───────────────────────────

class VoiceState(Enum):
    DORMANT = auto()    # Waiting for wake word
    ACTIVE = auto()     # Listening for commands
    SPEAKING = auto()   # Playing back response


# ─────────────────────────── config ──────────────────────────────────

@dataclass
class VoiceConfig:
    backend_url: str = "http://localhost:3000"
    backend_context_mode: str = "context"   # context | decide
    plant_id: str = "PLANT_A"

    # LLM source: backend | ollama | groq
    llm_source: str = "backend"
    ollama_url: str = "http://localhost:11434/api/generate"
    ollama_model: str = "llama3"
    backend_stream_url: str = ""

    # Groq
    groq_api_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", ""))
    groq_model: str = field(default_factory=lambda: os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"))

    # TTS (Piper binary)
    piper_path: str = "./piper/piper"
    voice_model: str = "./piper/en_US-ryan-medium.onnx"

    # Audio hardware
    mic_sample_rate: int = 16000
    output_sample_rate: int = 22050
    channels: int = 1
    block_size: int = 1600          # 100 ms at 16 kHz

    # VAD
    vad_threshold: float = 0.5
    energy_threshold: float = 0.02
    min_speech_sec: float = 0.35
    silence_timeout_sec: float = 0.55

    # STT models
    stt_model: str = "base.en"              # main transcription
    wake_stt_model: str = "tiny.en"         # lightweight wake-word model
    stt_device: str = "cpu"
    stt_compute_type: str = "int8"
    stt_beam_size: int = 1

    # Wake word
    wake_phrase: str = field(default_factory=lambda: os.getenv("WAKE_WORD", "hey tower").lower())
    wake_chunk_sec: float = 1.5             # audio window fed to wake STT
    wake_timeout_sec: float = float(os.getenv("WAKE_WORD_TIMEOUT_SEC", "30"))
    # wake_timeout_sec: seconds of silence in ACTIVE mode before returning to DORMANT

    # Timeouts
    backend_timeout_sec: float = 8.0
    ollama_timeout_sec: float = 60.0
    piper_timeout_sec: float = 20.0

    max_context_chars: int = 5000


# ─────────────────────────── VAD ─────────────────────────────────────

class VADGate:
    """Silero VAD with automatic energy-based fallback."""

    def __init__(self, threshold: float, energy_threshold: float, sample_rate: int) -> None:
        self.threshold = threshold
        self.energy_threshold = energy_threshold
        self.sample_rate = sample_rate
        self._torch = None
        self._model = None
        self._silero_enabled = False

        try:
            import torch
            model, _ = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                trust_repo=True,
            )
            model.eval()
            self._torch = torch
            self._model = model
            self._silero_enabled = True
            print("[VAD] Silero VAD enabled")
        except Exception as exc:
            print(f"[VAD] Silero unavailable, using energy fallback ({exc})")

    def detect(self, mono_audio: np.ndarray) -> tuple[bool, float, str]:
        samples = mono_audio.astype(np.float32, copy=False)
        if self._silero_enabled and self._torch is not None and self._model is not None:
            try:
                tensor = self._torch.from_numpy(samples)
                with self._torch.no_grad():
                    score = float(self._model(tensor, self.sample_rate).item())
                return score >= self.threshold, score, "silero"
            except Exception:
                pass
        energy = float(np.linalg.norm(samples) / max(samples.size, 1))
        return energy >= self.energy_threshold, energy, "energy"


# ─────────────────────────── Wake word ───────────────────────────────

class WakeWordDetector:
    """
    STT-based wake word detector.
    Runs a tiny Whisper model on rolling 1.5-second chunks and checks
    whether the transcription contains the configured wake phrase.
    No cloud service required — 100% local.
    """

    def __init__(self, cfg: VoiceConfig) -> None:
        self.cfg = cfg
        self._model: Optional[Any] = None
        self._ready = False
        self._chunk_samples = int(cfg.wake_chunk_sec * cfg.mic_sample_rate)
        self._buffer: list[np.ndarray] = []
        self._buffer_len = 0

    def load(self) -> bool:
        if WhisperModel is None:
            print("[WAKE] faster-whisper unavailable — wake word disabled")
            return False
        try:
            self._model = WhisperModel(
                self.cfg.wake_stt_model,
                device=self.cfg.stt_device,
                compute_type=self.cfg.stt_compute_type,
            )
            self._ready = True
            print(f"[WAKE] Wake word model '{self.cfg.wake_stt_model}' loaded. Phrase: '{self.cfg.wake_phrase}'")
            return True
        except Exception as exc:
            print(f"[WAKE] Could not load wake model: {exc}")
            return False

    def feed(self, mono: np.ndarray) -> bool:
        """Feed audio chunk. Returns True when wake phrase is detected."""
        if not self._ready or self._model is None:
            return False
        self._buffer.append(mono)
        self._buffer_len += mono.size
        if self._buffer_len >= self._chunk_samples:
            segment = np.concatenate(self._buffer).astype(np.float32, copy=False)
            self._buffer = []
            self._buffer_len = 0
            return self._transcribe_and_check(segment)
        return False

    def reset(self) -> None:
        self._buffer = []
        self._buffer_len = 0

    def _transcribe_and_check(self, audio: np.ndarray) -> bool:
        try:
            segs, _ = self._model.transcribe(
                audio,
                language="en",
                beam_size=1,
                vad_filter=True,
            )
            text = " ".join(s.text.strip() for s in segs).lower()
            if text:
                # Check for wake phrase or common mis-transcriptions
                aliases = [self.cfg.wake_phrase, "hey tower", "hey tauer", "a tower", "ey tower"]
                if any(a in text for a in aliases):
                    print(f"[WAKE] Wake word detected! transcript='{text}'")
                    return True
        except Exception as exc:
            print(f"[WAKE] Transcription error: {exc}")
        return False


# ─────────────────────────── Main stack ──────────────────────────────

class LocalLiveVoiceStack:
    def __init__(self, config: VoiceConfig) -> None:
        self.cfg = config

        # Pipeline queues
        self.audio_queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=16)
        self.text_queue: queue.Queue[str] = queue.Queue(maxsize=16)
        self.sentence_queue: queue.Queue[str] = queue.Queue(maxsize=32)
        self.playback_queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=64)

        # State machine
        self.state = VoiceState.DORMANT
        self._state_lock = threading.Lock()
        self._last_active_ts = 0.0     # last time user spoke or we woke

        # Threading
        self.stop_event = threading.Event()
        self.interrupt_event = threading.Event()
        self._workers: List[threading.Thread] = []
        self._stt_model: Optional[Any] = None

        # VAD / speech segmentation (only used in ACTIVE state)
        self._speech_active = False
        self._speech_buffer: list[np.ndarray] = []
        self._last_speech_ts = 0.0
        self._playback_lock = threading.Lock()
        self._current_audio: Optional[np.ndarray] = None
        self._current_audio_idx = 0

        # Sub-systems
        self.vad = VADGate(
            threshold=self.cfg.vad_threshold,
            energy_threshold=self.cfg.energy_threshold,
            sample_rate=self.cfg.mic_sample_rate,
        )
        self.wake = WakeWordDetector(self.cfg)

        # Groq client
        self._groq: Optional[Any] = None
        if _GROQ_AVAILABLE and self.cfg.groq_api_key:
            try:
                self._groq = GroqClient(api_key=self.cfg.groq_api_key)
                print(f"[GROQ] Groq client ready (model={self.cfg.groq_model})")
            except Exception as exc:
                print(f"[GROQ] Init error: {exc}")

    # ── public entry point ────────────────────────────────────────────

    def run(self) -> None:
        self._install_signal_handlers()
        self.wake.load()
        self._start_workers()

        with sd.OutputStream(
            samplerate=self.cfg.output_sample_rate,
            channels=self.cfg.channels,
            dtype="float32",
            callback=self._speaker_callback,
            blocksize=1024,
        ), sd.InputStream(
            samplerate=self.cfg.mic_sample_rate,
            channels=self.cfg.channels,
            dtype="float32",
            callback=self._mic_callback,
            blocksize=self.cfg.block_size,
        ):
            self._announce_state(VoiceState.DORMANT)
            print(f"[LIVE] Voice stack running. Say '{self.cfg.wake_phrase}' to activate. Ctrl+C to stop.")
            self._run_timeout_watchdog()     # blocks until stop_event

        self._drain_on_shutdown()
        print("[LIVE] Stopped")

    # ── state helpers ─────────────────────────────────────────────────

    @property
    def is_dormant(self) -> bool:
        with self._state_lock:
            return self.state == VoiceState.DORMANT

    @property
    def is_active(self) -> bool:
        with self._state_lock:
            return self.state == VoiceState.ACTIVE

    def _set_state(self, new_state: VoiceState) -> None:
        with self._state_lock:
            if self.state == new_state:
                return
            old = self.state
            self.state = new_state
        print(f"[STATE] {old.name} → {new_state.name}")
        self._announce_state(new_state)

    def _announce_state(self, state: VoiceState) -> None:
        """Play a subtle tone to signal state transitions."""
        sr = self.cfg.output_sample_rate
        if state == VoiceState.ACTIVE:
            tone = self._sine_tone(880, 0.08, sr) * 0.25   # high ping
        elif state == VoiceState.DORMANT:
            tone = self._sine_tone(440, 0.12, sr) * 0.2    # low gong
        else:
            return
        try:
            self.playback_queue.put_nowait(tone)
        except queue.Full:
            pass

    @staticmethod
    def _sine_tone(freq: float, duration: float, sr: int) -> np.ndarray:
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        wave = np.sin(2 * np.pi * freq * t).astype(np.float32)
        # Fade in / out
        fade = int(sr * 0.01)
        wave[:fade] *= np.linspace(0, 1, fade)
        wave[-fade:] *= np.linspace(1, 0, fade)
        return wave

    # ── timeout watchdog (blocks main thread) ────────────────────────

    def _run_timeout_watchdog(self) -> None:
        while not self.stop_event.is_set():
            time.sleep(0.5)
            if self.is_active:
                elapsed = time.monotonic() - self._last_active_ts
                if elapsed > self.cfg.wake_timeout_sec:
                    print(f"[WAKE] No activity for {elapsed:.0f}s, returning to DORMANT")
                    self._clear_queue(self.audio_queue)
                    self._clear_queue(self.text_queue)
                    self._clear_queue(self.sentence_queue)
                    self._clear_queue(self.playback_queue)
                    self._set_state(VoiceState.DORMANT)

    # ── audio callbacks ───────────────────────────────────────────────

    def _mic_callback(self, indata: np.ndarray, frames: int, _ti: Any, status: Any) -> None:
        if status:
            print(f"[MIC] {status}")
        if self.stop_event.is_set() or frames == 0:
            return

        mono = indata[:, 0].copy() if indata.ndim > 1 else indata.copy()

        if self.is_dormant:
            if self.wake.feed(mono):
                self._last_active_ts = time.monotonic()
                self.wake.reset()
                self._set_state(VoiceState.ACTIVE)
            return

        # ── ACTIVE state: normal VAD + speech capture ─────────────────
        is_speech, score, source = self.vad.detect(mono)
        now = time.monotonic()

        if is_speech:
            if not self._speech_active:
                self._speech_active = True
                self.interrupt_event.set()
                self._clear_queue(self.sentence_queue)
                self._clear_queue(self.playback_queue)
                with self._playback_lock:
                    self._current_audio = None
                    self._current_audio_idx = 0
                self._speech_buffer = []
                self._last_active_ts = now
                print(f"[VAD] speech_start source={source} score={score:.3f}")
            self._last_speech_ts = now
            self._last_active_ts = now
            self._speech_buffer.append(mono.astype(np.float32, copy=False))
            return

        if self._speech_active and (now - self._last_speech_ts) >= self.cfg.silence_timeout_sec:
            self._speech_active = False
            segment = np.concatenate(self._speech_buffer) if self._speech_buffer else np.array([], dtype=np.float32)
            self._speech_buffer = []

            min_samples = int(self.cfg.min_speech_sec * self.cfg.mic_sample_rate)
            if segment.size >= min_samples:
                try:
                    self.audio_queue.put_nowait(segment)
                except queue.Full:
                    print("[QUEUE] audio_queue full, dropping utterance")

            self.interrupt_event.clear()
            print("[VAD] speech_end")

    def _speaker_callback(self, outdata: np.ndarray, frames: int, _ti: Any, status: Any) -> None:
        if status:
            print(f"[SPK] {status}")

        if self.interrupt_event.is_set() or self.stop_event.is_set():
            outdata.fill(0)
            self._clear_queue(self.playback_queue)
            with self._playback_lock:
                self._current_audio = None
                self._current_audio_idx = 0
            return

        mix = np.zeros(frames, dtype=np.float32)
        idx = 0
        with self._playback_lock:
            while idx < frames:
                if self._current_audio is None or self._current_audio_idx >= self._current_audio.size:
                    try:
                        self._current_audio = self.playback_queue.get_nowait()
                        self._current_audio_idx = 0
                    except queue.Empty:
                        break
                remaining = self._current_audio.size - self._current_audio_idx
                to_copy = min(frames - idx, remaining)
                mix[idx:idx + to_copy] = self._current_audio[
                    self._current_audio_idx:self._current_audio_idx + to_copy
                ]
                self._current_audio_idx += to_copy
                idx += to_copy

        if outdata.ndim == 2:
            outdata[:, 0] = mix
            for ch in range(1, outdata.shape[1]):
                outdata[:, ch] = mix
        else:
            outdata[:] = mix

    # ── workers ───────────────────────────────────────────────────────

    def _start_workers(self) -> None:
        self._workers = [
            threading.Thread(target=self._transcriber_worker, daemon=True, name="stt"),
            threading.Thread(target=self._llm_worker,         daemon=True, name="llm"),
            threading.Thread(target=self._tts_worker,         daemon=True, name="tts"),
        ]
        for w in self._workers:
            w.start()

    def _transcriber_worker(self) -> None:
        if WhisperModel is None:
            print("[STT] faster-whisper not installed. See voice/requirements.voice.txt")
            self.stop_event.set()
            return

        print(f"[STT] Loading model '{self.cfg.stt_model}'...")
        self._stt_model = WhisperModel(
            self.cfg.stt_model,
            device=self.cfg.stt_device,
            compute_type=self.cfg.stt_compute_type,
        )
        print("[STT] Ready")

        while not self.stop_event.is_set():
            utterance = self._queue_get(self.audio_queue, timeout=0.2)
            if utterance is None:
                continue
            try:
                segments, _ = self._stt_model.transcribe(
                    utterance,
                    language="en",
                    beam_size=self.cfg.stt_beam_size,
                    vad_filter=False,
                )
            except Exception as exc:
                print(f"[STT] Transcription failed: {exc}")
                continue

            parts = [s.text.strip() for s in segments if s.text.strip()]
            if not parts:
                continue
            user_text = " ".join(parts).strip()
            if not user_text:
                continue
            print(f"\nUSER: {user_text}")
            try:
                self.text_queue.put_nowait(user_text)
            except queue.Full:
                print("[QUEUE] text_queue full, dropping transcript")

    def _llm_worker(self) -> None:
        print(f"[LLM] Worker ready (source={self.cfg.llm_source})")

        while not self.stop_event.is_set():
            user_text = self._queue_get(self.text_queue, timeout=0.2)
            if user_text is None:
                continue

            self._last_active_ts = time.monotonic()

            # Choose LLM source with priority / fallback
            iterator: Optional[Iterator[str]] = None
            if self.cfg.llm_source == "backend":
                iterator = self._stream_backend_tokens(user_text)
            elif self.cfg.llm_source == "groq" and self._groq is not None:
                iterator = self._stream_groq_tokens(user_text)
            else:
                # Ollama path (also used as fallback)
                context_blob = self._fetch_backend_context()
                prompt = self._compose_prompt(user_text, context_blob)
                iterator = self._stream_ollama_tokens(prompt)

            if iterator is None:
                continue

            sentence_buf = ""
            for token in iterator:
                if self.stop_event.is_set() or self.interrupt_event.is_set():
                    break
                sentence_buf += token
                if self._is_sentence_boundary(token):
                    sentence = sentence_buf.strip()
                    if sentence:
                        print(f"AI: {sentence}")
                        self._enqueue_sentence(sentence)
                    sentence_buf = ""

            if sentence_buf.strip() and not self.interrupt_event.is_set():
                print(f"AI: {sentence_buf.strip()}")
                self._enqueue_sentence(sentence_buf.strip())

            self._last_active_ts = time.monotonic()

    def _tts_worker(self) -> None:
        print("[TTS] Worker ready")
        while not self.stop_event.is_set():
            sentence = self._queue_get(self.sentence_queue, timeout=0.2)
            if sentence is None:
                continue
            if self.interrupt_event.is_set():
                continue
            audio = self._synthesize_with_piper(sentence)
            if audio is None or audio.size == 0:
                continue
            try:
                self.playback_queue.put_nowait(audio)
            except queue.Full:
                print("[QUEUE] playback_queue full, dropping audio chunk")

    # ── LLM streaming ─────────────────────────────────────────────────

    def _stream_groq_tokens(self, user_text: str) -> Iterator[str]:
        """Stream tokens from Groq API (cloud, low-latency)."""
        if self._groq is None:
            return
        context_blob = self._fetch_backend_context()
        context_json = json.dumps(context_blob, ensure_ascii=True)
        if len(context_json) > self.cfg.max_context_chars:
            context_json = context_json[:self.cfg.max_context_chars] + "..."

        system_msg = (
            "You are the Enterprise AI Control Tower voice copilot for industrial plant operations. "
            "You speak concisely and naturally — short sentences that sound good when read aloud. "
            "Always prioritise safety. Base your answers on the plant context JSON provided."
        )
        user_msg = f"Plant context:\n{context_json}\n\nOperator says: {user_text}"

        try:
            stream = self._groq.chat.completions.create(
                model=self.cfg.groq_model,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                stream=True,
                max_tokens=300,
                temperature=0.4,
            )
            for chunk in stream:
                if self.stop_event.is_set() or self.interrupt_event.is_set():
                    break
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as exc:
            print(f"[GROQ] Stream error: {exc}")
            # Fallback to Ollama if Groq fails
            context_blob = self._fetch_backend_context()
            prompt = self._compose_prompt(user_text, context_blob)
            yield from self._stream_ollama_tokens(prompt)

    def _stream_ollama_tokens(self, prompt: str) -> Iterator[str]:
        payload = {
            "model": self.cfg.ollama_model,
            "prompt": prompt,
            "stream": True,
        }
        try:
            response = requests.post(
                self.cfg.ollama_url,
                json=payload,
                stream=True,
                timeout=self.cfg.ollama_timeout_sec,
            )
            response.raise_for_status()
        except Exception as exc:
            print(f"[LLM] Ollama request failed: {exc}")
            return

        try:
            for raw_line in response.iter_lines(decode_unicode=False):
                if self.stop_event.is_set() or self.interrupt_event.is_set():
                    break
                if not raw_line:
                    continue
                try:
                    chunk = json.loads(raw_line.decode("utf-8"))
                except Exception:
                    continue
                token = chunk.get("response", "")
                if token:
                    yield token
                if chunk.get("done"):
                    break
        finally:
            response.close()

    def _stream_backend_tokens(self, user_text: str) -> Iterator[str]:
        stream_url = self.cfg.backend_stream_url.strip() or \
            f"{self.cfg.backend_url.rstrip('/')}/supervisor/stream"
        payload = {
            "message": user_text,
            "plant_id": self.cfg.plant_id,
            "context_mode": self.cfg.backend_context_mode,
            "model": self.cfg.ollama_model,
            "ollama_url": self.cfg.ollama_url,
        }
        try:
            response = requests.post(
                stream_url,
                json=payload,
                stream=True,
                timeout=self.cfg.ollama_timeout_sec,
            )
            response.raise_for_status()
        except Exception as exc:
            print(f"[LLM] Backend stream request failed: {exc}")
            return

        try:
            for raw_line in response.iter_lines(decode_unicode=True):
                if self.stop_event.is_set() or self.interrupt_event.is_set():
                    break
                if not raw_line or not raw_line.startswith("data:"):
                    continue
                payload_line = raw_line[5:].strip()
                if not payload_line:
                    continue
                try:
                    chunk = json.loads(payload_line)
                except Exception:
                    continue
                if chunk.get("error"):
                    print(f"[LLM] Backend stream error: {chunk.get('error')}")
                    break
                token = chunk.get("token", "")
                if token:
                    yield token
                if chunk.get("done"):
                    break
        finally:
            response.close()

    # ── context / prompt helpers ──────────────────────────────────────

    def _fetch_backend_context(self) -> Dict[str, Any]:
        endpoint = "/context" if self.cfg.backend_context_mode == "context" else "/decide"
        url = f"{self.cfg.backend_url.rstrip('/')}{endpoint}"
        try:
            response = requests.post(
                url,
                json={"plant_id": self.cfg.plant_id},
                timeout=self.cfg.backend_timeout_sec,
            )
            response.raise_for_status()
            data = response.json()
            if self.cfg.backend_context_mode == "decide":
                return {
                    "decision": data.get("decision", {}),
                    "analysis": data.get("detailed_analysis", {}),
                    "agent_decisions": data.get("agent_decisions", {}),
                }
            return data.get("context", {})
        except Exception as exc:
            print(f"[CTX] Backend fetch failed: {exc}")
            return {"error": "backend_context_unavailable"}

    def _compose_prompt(self, user_text: str, context_blob: Dict[str, Any]) -> str:
        context_json = json.dumps(context_blob, ensure_ascii=True)
        if len(context_json) > self.cfg.max_context_chars:
            context_json = context_json[:self.cfg.max_context_chars] + "..."
        return (
            "You are a real-time industrial voice copilot for plant operations. "
            "Reply concisely in spoken style. Prioritize safety.\n\n"
            f"Plant context:\n{context_json}\n\n"
            f"Operator: {user_text}\nAssistant:"
        )

    # ── TTS (Piper) ───────────────────────────────────────────────────

    def _synthesize_with_piper(self, text: str) -> Optional[np.ndarray]:
        command = [self.cfg.piper_path, "--model", self.cfg.voice_model, "--output_raw"]
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except Exception as exc:
            print(f"[TTS] Piper launch failed: {exc}")
            self.stop_event.set()
            return None

        try:
            output, stderr = process.communicate(
                input=(text.strip() + "\n").encode("utf-8"),
                timeout=self.cfg.piper_timeout_sec,
            )
        except subprocess.TimeoutExpired:
            process.kill()
            print("[TTS] Piper timed out")
            return None

        if process.returncode != 0:
            err_text = stderr.decode("utf-8", errors="ignore").strip()
            print(f"[TTS] Piper error {process.returncode}: {err_text}")
            return None

        if not output:
            return None

        audio_i16 = np.frombuffer(output, dtype=np.int16)
        if audio_i16.size == 0:
            return None
        return audio_i16.astype(np.float32) / 32768.0

    # ── helpers ───────────────────────────────────────────────────────

    def _enqueue_sentence(self, sentence: str) -> None:
        try:
            self.sentence_queue.put_nowait(sentence)
        except queue.Full:
            print("[QUEUE] sentence_queue full, dropping sentence")

    @staticmethod
    def _is_sentence_boundary(token: str) -> bool:
        return any(mark in token for mark in (".", "?", "!", "\n"))

    @staticmethod
    def _queue_get(q: "queue.Queue[Any]", timeout: float) -> Optional[Any]:
        try:
            return q.get(timeout=timeout)
        except queue.Empty:
            return None

    @staticmethod
    def _clear_queue(q: "queue.Queue[Any]") -> None:
        while True:
            try:
                q.get_nowait()
            except queue.Empty:
                return

    def _drain_on_shutdown(self) -> None:
        for q in (self.audio_queue, self.text_queue, self.sentence_queue, self.playback_queue):
            self._clear_queue(q)

    def _install_signal_handlers(self) -> None:
        def _handle(signum: int, _frame: Any) -> None:
            print(f"[SIGNAL] Caught {signum}, shutting down…")
            self.stop_event.set()
            self.interrupt_event.set()

        signal.signal(signal.SIGINT, _handle)
        signal.signal(signal.SIGTERM, _handle)


# ─────────────────────────── CLI ─────────────────────────────────────

def parse_args() -> VoiceConfig:
    parser = argparse.ArgumentParser(description="Enterprise AI Control Tower — local voice sidecar")
    parser.add_argument("--backend-url",          default=os.getenv("VOICE_BACKEND_URL", "http://localhost:3000"))
    parser.add_argument("--backend-context-mode", choices=["context", "decide"],
                        default=os.getenv("VOICE_BACKEND_CONTEXT_MODE", "decide"))
    parser.add_argument("--plant-id",             default=os.getenv("VOICE_PLANT_ID", "PLANT_A"))

    parser.add_argument("--llm-source",           choices=["groq", "ollama", "backend"],
                        default=os.getenv("VOICE_LLM_SOURCE", "backend"))
    parser.add_argument("--groq-api-key",         default=os.getenv("GROQ_API_KEY", ""))
    parser.add_argument("--groq-model",           default=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"))

    parser.add_argument("--ollama-url",           default=os.getenv("VOICE_OLLAMA_URL", "http://localhost:11434/api/generate"))
    parser.add_argument("--ollama-model",         default=os.getenv("VOICE_OLLAMA_MODEL", "llama3"))
    parser.add_argument("--backend-stream-url",   default=os.getenv("VOICE_BACKEND_STREAM_URL", ""))

    parser.add_argument("--piper-path",           default=os.getenv("VOICE_PIPER_PATH", "./piper/piper"))
    parser.add_argument("--voice-model",          default=os.getenv("VOICE_MODEL_PATH", "./piper/en_US-ryan-medium.onnx"))

    parser.add_argument("--stt-model",            default=os.getenv("VOICE_STT_MODEL", "base.en"))
    parser.add_argument("--wake-stt-model",       default=os.getenv("VOICE_WAKE_STT_MODEL", "tiny.en"))
    parser.add_argument("--stt-device",           default=os.getenv("VOICE_STT_DEVICE", "cpu"))
    parser.add_argument("--stt-compute-type",     default=os.getenv("VOICE_STT_COMPUTE_TYPE", "int8"))

    parser.add_argument("--wake-phrase",          default=os.getenv("WAKE_WORD", "hey tower"))
    parser.add_argument("--wake-timeout",         type=float,
                        default=float(os.getenv("WAKE_WORD_TIMEOUT_SEC", "30")))

    parser.add_argument("--vad-threshold",        type=float, default=float(os.getenv("VOICE_VAD_THRESHOLD", "0.5")))
    parser.add_argument("--energy-threshold",     type=float, default=float(os.getenv("VOICE_ENERGY_THRESHOLD", "0.02")))

    args = parser.parse_args()
    return VoiceConfig(
        backend_url=args.backend_url,
        backend_context_mode=args.backend_context_mode,
        plant_id=args.plant_id,
        llm_source=args.llm_source,
        groq_api_key=args.groq_api_key,
        groq_model=args.groq_model,
        ollama_url=args.ollama_url,
        ollama_model=args.ollama_model,
        backend_stream_url=args.backend_stream_url,
        piper_path=args.piper_path,
        voice_model=args.voice_model,
        stt_model=args.stt_model,
        wake_stt_model=args.wake_stt_model,
        stt_device=args.stt_device,
        stt_compute_type=args.stt_compute_type,
        wake_phrase=args.wake_phrase.lower(),
        wake_timeout_sec=args.wake_timeout,
        vad_threshold=args.vad_threshold,
        energy_threshold=args.energy_threshold,
    )


def main() -> None:
    config = parse_args()
    stack = LocalLiveVoiceStack(config)
    stack.run()


if __name__ == "__main__":
    main()
