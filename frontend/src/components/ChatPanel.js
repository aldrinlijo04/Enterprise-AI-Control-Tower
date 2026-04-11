import React, { useRef, useEffect, useState } from "react";
import { useChat } from "../hooks/useChat";

const PROMPTS = [
  "What is the overall plant status right now?",
  "Which equipment needs urgent attention?",
  "Summarise energy waste and give recommendations",
  "What anomalies were detected and why?",
  "Predict failure risk across all equipment",
  "What does the demand forecast say?",
  "Explain the maintenance priority list",
  "Which plant has the most critical alerts?",
];

const MicIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4m-4 0h8" />
  </svg>
);

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
  </svg>
);

const ClearIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);

export function ChatPanel() {
  const { messages, loading, send, sendVoice, clear } = useChat();
  const [input, setInput]       = useState("");
  const [recording, setRec]     = useState(false);
  const chatEndRef               = useRef(null);
  const mediaRef                 = useRef(null);
  const chunksRef                = useRef([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = () => { send(input); setInput(""); };

  const toggleRecord = async () => {
    if (recording) {
      mediaRef.current?.stop();
      setRec(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/wav" });
        const reader = new FileReader();
        reader.onload = async () => {
          const b64 = reader.result.split(",")[1];
          await sendVoice(b64);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      setRec(true);
      setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 9000);
    } catch {
      alert("Microphone access denied.");
    }
  };

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <span className="chat-title">
          <span className="aria-dot" />
          ARIA Assistant
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="chat-subtitle">7 models active • 500 records</span>
          <button className="icon-btn" onClick={clear} title="Clear conversation">
            <ClearIcon />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.role === "assistant" && <span className="bubble-tag">ARIA</span>}
            {m.role === "user" && <span className="bubble-tag user-tag">YOU</span>}
            <p>{m.content}</p>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble assistant">
            <span className="bubble-tag">ARIA</span>
            <div className="typing-dots"><span /><span /><span /></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Prompt chips */}
      <div className="prompts-section">
        <span className="prompts-label">Suggested</span>
        <div className="prompt-chips">
          {PROMPTS.map((p, i) => (
            <button key={i} className="chip" onClick={() => { send(p); }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Input row */}
      <div className="chat-input-row">
        <button
          className={`mic-btn ${recording ? "recording" : ""}`}
          onClick={toggleRecord}
          title={recording ? "Stop (auto-stops after 9s)" : "Voice input"}
        >
          <MicIcon />
          {recording && <span className="rec-timer" />}
        </button>
        <input
          className="chat-input"
          placeholder="Ask about equipment, anomalies, energy, forecasts…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <button className="send-btn" onClick={handleSend} disabled={!input.trim()}>
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
