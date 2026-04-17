# Local Full-Duplex Voice Stack

This module adds a zero-latency style local voice sidecar for the Enterprise AI Control Tower.

## Architecture

Mic Input -> VAD -> audio_queue -> STT -> text_queue -> LLM token stream -> sentence_queue -> TTS -> playback_queue -> Speaker

## Components

1. Input Signal Processor
- Captures PCM audio at 16 kHz mono.
- Uses Silero VAD when available.
- Falls back to energy VAD if Silero cannot be loaded.
- Emits speech_start and speech_end transitions.

2. ASR Service
- Uses faster-whisper with beam_size=1.
- Processes speech segments and sends transcripts to text_queue.

3. LLM Service
- Uses Ollama streaming API (/api/generate, stream=true).
- Consumes token-by-token output and emits sentence fragments to TTS.
- Pulls live plant context from existing backend endpoints (/context or /decide).
- Optional backend mode streams tokens from /supervisor/stream (SSE).

4. TTS Service
- Uses Piper binary and ONNX voice model.
- Synthesizes sentence fragments and pushes raw audio to playback queue.
- Supports barge-in: playback is cut immediately when user starts speaking.

## Prerequisites

1. Backend app running on port 3000.
2. Ollama running with recommended model:
  - ollama pull qwen2.5:14b
  - ollama pull llama3.1:8b
3. Piper binary and voice model placed under ./piper, for example:
   - ./piper/piper
   - ./piper/en_US-ryan-medium.onnx
4. Audio I/O support installed (PortAudio).

On macOS:
- brew install portaudio

## Install voice dependencies

pip install -r voice/requirements.voice.txt

## Run (Direct Ollama Mode)

python voice/local_live.py \
  --backend-url http://localhost:3000 \
  --backend-context-mode context \
  --plant-id PLANT_A \
  --ollama-url http://localhost:11434/api/generate \
  --ollama-model qwen2.5:14b \
  --piper-path ./piper/piper \
  --voice-model ./piper/en_US-ryan-medium.onnx

## Run (Backend Stream Mode)

This uses the backend stream endpoint and keeps Ollama calls server-side:

python voice/local_live.py \
  --backend-url http://localhost:3000 \
  --llm-source backend \
  --backend-context-mode context \
  --plant-id PLANT_A \
  --ollama-model qwen2.5:14b \
  --piper-path ./piper/piper \
  --voice-model ./piper/en_US-ryan-medium.onnx

## Useful options

- Use full decision context instead of raw context:
  - --backend-context-mode decide
- Switch LLM source:
  - --llm-source ollama
  - --llm-source backend
- Override backend stream URL:
  - --backend-stream-url http://localhost:3000/supervisor/stream
- Tune VAD:
  - --vad-threshold 0.5
  - --energy-threshold 0.02
- Change STT profile:
  - --stt-model base.en
  - --stt-device cpu
  - --stt-compute-type int8

## Notes

- This sidecar does not require any backend code changes to function.
- If backend stream mode is enabled, backend must expose /supervisor/stream.
- For lower latency, keep context mode at context.
- For richer reasoning context, use decision mode.
