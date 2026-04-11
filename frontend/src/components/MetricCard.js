import React from "react";

export function MetricCard({ label, value, unit = "", accent = "#06d6a0", sub, onClick }) {
  return (
    <div
      className="metric-card"
      style={{ "--accent": accent }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}
