import React, { useState, useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import { ChatProvider } from "./store/chatStore";
import "./App.css";

export default function App() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTimeout(() => setLoaded(true), 1200); }, []);

  return (
    <ChatProvider>
      <div className={`app-root ${loaded ? "loaded" : ""}`}>
        {!loaded ? <SplashScreen /> : <Dashboard />}
      </div>
    </ChatProvider>
  );
}

function SplashScreen() {
  return (
    <div className="splash">
      <div className="splash-inner">
        <div className="splash-logo">
          <span className="logo-aria">ARIA</span>
          <span className="logo-sub">Advanced Real-time Industrial AI</span>
        </div>
        <div className="splash-bars">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="splash-bar" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <p className="splash-status">Initialising 7 AI Models…</p>
      </div>
    </div>
  );
}