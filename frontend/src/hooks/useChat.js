import { useCallback } from "react";
import { sendChat, transcribeAudio } from "../api";
import { useChatStore } from "../store/chatStore";

export function useChat() {
  const { messages, setMessages, loading, setLoading } = useChatStore();

  const send = useCallback(async (text) => {
    if (!text?.trim()) return;
    const userMsg = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);
    try {
      const reply = await sendChat(text, updated);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Connection error. Please verify the backend is running on port 8000."
      }]);
    }
    setLoading(false);
  }, [messages, setMessages, setLoading]);

  const sendVoice = useCallback(async (audioB64) => {
    try {
      const text = await transcribeAudio(audioB64);
      if (text) await send(text);
      else await send("(voice transcription returned empty — please type your question)");
    } catch {
      await send("(voice transcription failed — please type your question)");
    }
  }, [send]);

  const clear = useCallback(() => {
    setMessages([{
      role: "assistant",
      content: "Chat cleared. ARIA is still monitoring all 7 models. Ask me anything."
    }]);
  }, [setMessages]);

  return { messages, loading, send, sendVoice, clear };
}