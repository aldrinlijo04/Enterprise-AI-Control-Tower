import React, { createContext, useContext, useState } from "react";

const ChatContext = createContext(null);

const INITIAL = [{
  role: "assistant",
  content: "ARIA online. I'm monitoring 7 AI models across your plant fleet — " +
           "forecasting, demand, energy, anomaly detection, plant behavior, " +
           "predictive maintenance, and failure prediction. Ask me anything."
}];

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState(INITIAL);
  const [loading,  setLoading]  = useState(false);

  return (
    <ChatContext.Provider value={{ messages, setMessages, loading, setLoading }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatStore() {
  return useContext(ChatContext);
}