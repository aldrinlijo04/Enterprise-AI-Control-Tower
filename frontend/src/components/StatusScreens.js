import React from "react";

export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Connecting to ARIA backend…</p>
      <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
        Make sure FastAPI is running on port 8000
      </span>
    </div>
  );
}

export function ErrorScreen({ message, onRetry }) {
  return (
    <div className="loading-screen">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
        stroke="#ff3b5c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
      </svg>
      <p style={{ color: "var(--red)", marginTop: 8 }}>Backend Unreachable</p>
      <p style={{ color: "var(--text2)", fontSize: 12, maxWidth: 360, textAlign: "center" }}>
        {message}
      </p>
      <button className="retry-btn" onClick={onRetry}>Retry Connection</button>
    </div>
  );
}
