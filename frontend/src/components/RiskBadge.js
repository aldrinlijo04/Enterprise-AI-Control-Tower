import React from "react";

export const RISK_COLOR = {
  CRITICAL:       "#ff3b5c",
  HIGH:           "#ff8c42",
  HIGH_RISK:      "#ff8c42",
  MEDIUM:         "#ffd166",
  LOW:            "#06d6a0",
  IMMINENT:       "#ff3b5c",
  MODERATE:       "#ffd166",
  HEALTHY:        "#06d6a0",
  NORMAL:         "#06d6a0",
  SURGE:          "#ff8c42",
  OVERCAPACITY:   "#ffd166",
  UNDERPERFORMANCE: "#a0aec0",
  CASCADE_FAULT:  "#ff3b5c",
};

export function RiskBadge({ label }) {
  const bg = RISK_COLOR[label] || "#a0aec0";
  return (
    <span className="badge" style={{ background: bg, color: "#070c18" }}>
      {label}
    </span>
  );
}

export function SeverityDot({ level }) {
  const color = RISK_COLOR[level] || "#a0aec0";
  return (
    <span
      style={{
        display: "inline-block", width: 8, height: 8,
        borderRadius: "50%", background: color,
        boxShadow: `0 0 6px ${color}`,
        flexShrink: 0,
      }}
    />
  );
}
