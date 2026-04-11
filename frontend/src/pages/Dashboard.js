import React, { useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import { usePlantData }  from "../hooks/usePlantData";
import { MetricCard }    from "../components/MetricCard";
import { ChatPanel }     from "../components/ChatPanel";
import { LoadingScreen, ErrorScreen } from "../components/StatusScreens";

// ── ICONS ─────────────────────────────────────────────────────
function Ico({ d, size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const IC = {
  plant:   "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
  alert:   "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  trend:   "M3 3v18h18M7 16l4-4 4 4 4-4",
  demand:  "M9 19V6l7 13V6",
  energy:  "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  anomaly: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  maint:   "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  fail:    "M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242M12 12v9m-4-4l4 4 4-4",
  behavior:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  check:   "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  info:    "M12 22a10 10 0 100-20 10 10 0 000 20zM12 8h.01M12 12v4",
  download:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  gear:    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
};

// ── RISK ──────────────────────────────────────────────────────
const RISK = {
  CRITICAL:         { cls: "badge-critical",         color: "#dc2626", bg: "#fef2f2" },
  HIGH:             { cls: "badge-high",              color: "#ea580c", bg: "#fff7ed" },
  HIGH_RISK:        { cls: "badge-high_risk",         color: "#ea580c", bg: "#fff7ed" },
  MEDIUM:           { cls: "badge-medium",            color: "#d97706", bg: "#fffbeb" },
  LOW:              { cls: "badge-low",               color: "#16a34a", bg: "#f0fdf4" },
  IMMINENT:         { cls: "badge-imminent",          color: "#dc2626", bg: "#fef2f2" },
  MODERATE:         { cls: "badge-moderate",          color: "#d97706", bg: "#fffbeb" },
  HEALTHY:          { cls: "badge-healthy",           color: "#16a34a", bg: "#f0fdf4" },
  NORMAL:           { cls: "badge-normal",            color: "#16a34a", bg: "#f0fdf4" },
  SURGE:            { cls: "badge-surge",             color: "#ea580c", bg: "#fff7ed" },
  CASCADE_FAULT:    { cls: "badge-cascade_fault",     color: "#dc2626", bg: "#fef2f2" },
  OVERCAPACITY:     { cls: "badge-overcapacity",      color: "#d97706", bg: "#fffbeb" },
  UNDERPERFORMANCE: { cls: "badge-underperformance",  color: "#94a3b8", bg: "#f8fafc" },
};

function Badge({ label }) {
  const cfg = RISK[label] || { cls: "badge-medium", color: "#d97706" };
  return <span className={`badge ${cfg.cls}`}>{label?.replace(/_/g, " ")}</span>;
}

// ── CHART TOOLTIP ─────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tt-row">
          <span className="tt-name">
            <span className="tt-dot" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tt-val">
            {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── PANEL ─────────────────────────────────────────────────────
function Panel({ title, icon, accent = "#2563eb", accentLight = "#eff6ff", badge, badgeColor, children, noPad, extra }) {
  return (
    <div className="panel" style={{ "--accent": accent, "--accent-l": accentLight }}>
      <div className="panel-header">
        <div className="panel-icon"><Ico d={IC[icon] || IC.check} size={13} /></div>
        <span className="panel-title">{title}</span>
        {extra}
        {badge !== undefined && (
          <span className="panel-badge" style={badgeColor ? { background: badgeColor + "15", color: badgeColor, borderColor: badgeColor + "35" } : {}}>
            {badge}
          </span>
        )}
      </div>
      <div className={noPad ? "" : "panel-body"}>{children}</div>
    </div>
  );
}

// ── INSIGHT BOX ───────────────────────────────────────────────
function Insight({ type = "info", children }) {
  return <div className={`insight-box ${type !== "info" ? type : ""}`}>{children}</div>;
}

// ── CSV EXPORT ────────────────────────────────────────────────
function exportCSV(data, filename) {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const csv = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
}

// ── TABS ──────────────────────────────────────────────────────
const TABS = [
  { id: "overview",    label: "Overview"    },
  { id: "forecast",    label: "Forecast"    },
  { id: "energy",      label: "Energy"      },
  { id: "anomalies",   label: "Anomalies"   },
  { id: "maintenance", label: "Maintenance" },
  { id: "failure",     label: "Failure"     },
  { id: "chat",        label: "ARIA Chat"   },
];

// ── CHART STYLES ──────────────────────────────────────────────
const AX   = { fill: "#94a3b8", fontSize: 11, fontFamily: "Inter, sans-serif" };
const GRID = { stroke: "#f1f5f9", strokeDasharray: "3 3" };
const TT   = { content: <ChartTip /> };

// ═════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { snap, report, anomalies, maintenance, failures,
          loading, error, lastRefresh, refresh } = usePlantData();

  const [tab,         setTab]         = useState("overview");
  const [riskFilter,  setRiskFilter]  = useState("ALL");
  const [plantFilter, setPlantFilter] = useState("ALL");
  const [forecastSignal, setForecastSignal] = useState("temperature");

  if (loading) return <LoadingScreen />;
  if (error)   return <ErrorScreen message={error} onRetry={refresh} />;

  const f  = report.forecasting;
  const d  = report.demand;
  const e  = report.energy;
  const a  = report.anomaly;
  const pb = report.plant_behavior;
  const m  = report.maintenance;
  const fl = report.failure;
  const imm = fl.imminent_failures || 0;

  // ── chart data ─────────────────────────────────────────────
  const forecastData = (f.forecast_10_steps?.temperature || []).map((_, i) => ({
    step: `T+${i + 1}`,
    temperature: (f.forecast_10_steps?.temperature || [])[i],
    pressure:    (f.forecast_10_steps?.pressure    || [])[i],
    vibration:   (f.forecast_10_steps?.vibration   || [])[i],
    power_kw:    (f.forecast_10_steps?.power_kw    || [])[i],
    flow_rate:   (f.forecast_10_steps?.flow_rate   || [])[i],
  }));

  const energyData = Object.entries(e.by_equipment || {}).map(([eq, v]) => ({
    name: eq, "Avg kW": v.avg_kw, "Peak kW": v.peak_kw, "Eff %": Math.round(v.efficiency_pct),
  }));

  const demandData = Object.entries(d.by_product || {}).map(([prod, v]) => ({
    name: prod, Forecast: v.avg_forecast, Actual: v.avg_actual,
  }));

  const behaviorPie = Object.entries(pb.behavior_distribution || {}).map(([k, v]) => ({
    name: k.replace(/_/g, " "), value: parseFloat(v), color: RISK[k]?.color || "#94a3b8",
  }));

  const maintData = Object.entries(m.by_equipment || {}).map(([eq, v]) => ({
    name: eq, "Min RUL": v.min_rul_hrs, "Avg RUL": v.avg_rul_hrs, risk: v.dominant_risk,
  }));

  const healthPie = Object.entries(fl.fleet_health || {}).map(([k, v]) => ({
    name: k, value: parseFloat(v), color: RISK[k]?.color || "#94a3b8",
  }));

  // ── filters ────────────────────────────────────────────────
  const plants           = ["ALL", ...new Set(anomalies.map(r => r.plant_id))];
  const filteredAnomalies = anomalies.filter(r => plantFilter === "ALL" || r.plant_id === plantFilter);
  const filteredMaint     = maintenance.filter(r => riskFilter === "ALL" || r.risk_level === riskFilter);
  const filteredFail      = failures.filter(r => riskFilter === "ALL" || r.failure_label === riskFilter);

  // ── signal config ───────────────────────────────────────────
  const SIGNALS = {
    temperature: { label: "Temperature", unit: "°C",  color: "#dc2626", gradId: "gT" },
    pressure:    { label: "Pressure",    unit: " bar", color: "#2563eb", gradId: "gP" },
    vibration:   { label: "Vibration",   unit: " g",   color: "#7c3aed", gradId: "gV" },
    power_kw:    { label: "Power",       unit: " kW",  color: "#d97706", gradId: "gK" },
    flow_rate:   { label: "Flow Rate",   unit: " LPM", color: "#0891b2", gradId: "gF" },
  };
  const sig = SIGNALS[forecastSignal];

  // ── insight messages ────────────────────────────────────────
  const maintInsight = m.avg_rul_hours < 150
    ? { type: "danger", msg: `Average RUL is critically low at ${m.avg_rul_hours} hrs. ${m.risk_distribution?.CRITICAL || 0} units require immediate maintenance.` }
    : m.avg_rul_hours < 300
    ? { type: "warn",   msg: `${m.risk_distribution?.HIGH || 0} units are at HIGH risk. Schedule maintenance within the next 7 days.` }
    : { type: "good",   msg: `Fleet maintenance is in good condition. Average RUL: ${m.avg_rul_hours} hrs across all equipment.` };

  const energyInsight = e.avg_waste_kw > 20
    ? { type: "warn",   msg: `Average energy waste of ${e.avg_waste_kw} kW detected above baseline. Estimated monthly saving opportunity: ₹${Math.round(e.avg_waste_kw * 7.5 * 720).toLocaleString()}.` }
    : { type: "good",   msg: `Energy consumption is within baseline. Total: ${e.total_energy_kwh} kWh | Carbon: ${e.carbon_emission_kg} kg CO₂ | Cost: ₹${e.energy_cost_INR}.` };

  return (
    <div className="dashboard">

      {/* HEADER */}
      <header className="dash-header">
        <div className="header-left">
          <span className="header-logo">ARIA</span>
          <div className="header-divider" />
          <span className="header-plant">
            <Ico d={IC.plant} size={12} /> {snap.plant_id} · {snap.equipment_id}
          </span>
        </div>

        <nav className="dash-nav">
          {TABS.map(t => (
            <button key={t.id} className={`nav-btn ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>

        <div className="header-meta">
          <button className="icon-btn" onClick={refresh} title="Refresh"><Ico d={IC.refresh} size={13} /></button>
          <span className="live-pill"><span className="live-dot" />LIVE</span>
          {lastRefresh && <span className="header-time">{lastRefresh.toLocaleTimeString()}</span>}
        </div>
      </header>

      {/* ALERT BANNER */}
      {imm > 0 && (
        <div className="alert-banner">
          <Ico d={IC.alert} size={14} color="#dc2626" />
          <strong>{imm} unit(s)</strong>&nbsp;at IMMINENT failure risk —
          avg probability {(fl.avg_failure_probability * 100).toFixed(1)}%
          <span className="banner-equip">{Object.keys(fl.critical_equipment || {}).slice(0, 4).join("  ·  ")}</span>
        </div>
      )}

      <main className="dash-main">

        {/* ══════════ OVERVIEW ══════════ */}
        {tab === "overview" && (
          <div className="tab-content">

            {/* Stats bar */}
            <div className="stats-bar">
              {[
                { label: "Temperature",  value: `${snap.temperature.toFixed(1)}°C`,   sub: "Current",           warn: snap.temperature > 110 },
                { label: "Pressure",     value: `${snap.pressure.toFixed(1)} bar`,     sub: "Current",           warn: snap.pressure > 170 },
                { label: "Power Draw",   value: `${snap.power_kw.toFixed(0)} kW`,      sub: "Active",            warn: false },
                { label: "Anomaly Rate", value: `${a.anomaly_rate_pct}%`,              sub: `${a.total_anomalies} events`, warn: a.anomaly_rate_pct > 15 },
                { label: "Avg RUL",      value: `${m.avg_rul_hours} hrs`,              sub: "Remaining life",    warn: m.avg_rul_hours < 150 },
                { label: "Fleet Health", value: `${fl.fleet_health?.HEALTHY}%`,        sub: "Units healthy",     warn: false },
                { label: "Demand MAE",   value: `${d.mean_absolute_error_pct}%`,       sub: "Forecast error",    warn: false },
              ].map(({ label, value, sub, warn }) => (
                <div key={label} className="stats-cell">
                  <span className="stats-label">{label}</span>
                  <span className="stats-value" style={warn ? { color: "#dc2626" } : {}}>{value}</span>
                  <span className="stats-sub">{sub}</span>
                </div>
              ))}
            </div>

            <div className="grid-2-1">
              {/* Sensor forecast mini */}
              <Panel title="Sensor Forecast — 10-Step Ahead" icon="trend" accent="#2563eb" accentLight="#eff6ff">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={forecastData} margin={{ top: 4, right: 12, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="gT2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#dc2626" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gP2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#2563eb" stopOpacity={0.12} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="step" tick={AX} />
                    <YAxis tick={AX} />
                    <Tooltip {...TT} />
                    <Area type="monotone" dataKey="temperature" name="Temp °C"      stroke="#dc2626" fill="url(#gT2)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="pressure"    name="Pressure bar" stroke="#2563eb" fill="url(#gP2)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="trend-row">
                  {Object.entries(f.trend || {}).map(([k, v]) => (
                    <span key={k} className={`trend-chip ${v}`}>{k}: {v}</span>
                  ))}
                </div>
              </Panel>

              {/* Plant behavior pie */}
              <Panel title="Plant Behavior" icon="behavior" accent="#7c3aed" accentLight="#f5f3ff" badge={`${pb.critical_events} critical`}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={behaviorPie} dataKey="value" cx="50%" cy="50%"
                        innerRadius={42} outerRadius={68} paddingAngle={3}>
                        {behaviorPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v}%`]} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,.08)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="legend-row" style={{ justifyContent: "center" }}>
                    {behaviorPie.map(b => (
                      <span key={b.name} className="legend-item">
                        <span className="legend-dot" style={{ background: b.color }} />{b.name} {b.value}%
                      </span>
                    ))}
                  </div>
                </div>
              </Panel>
            </div>

            <div className="grid-2">
              {/* Demand bar */}
              <Panel title="Demand vs Actual by Product" icon="demand" accent="#0891b2" accentLight="#ecfeff">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={demandData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="name" tick={AX} />
                    <YAxis tick={AX} />
                    <Tooltip {...TT} />
                    <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Forecast" fill="#0891b2" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Actual"   fill="#a5f3fc" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              {/* Maintenance RUL */}
              <Panel title="Equipment RUL — Min vs Avg" icon="maint" accent="#16a34a" accentLight="#f0fdf4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={maintData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 10 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis type="number" tick={AX} />
                    <YAxis dataKey="name" type="category" tick={AX} width={60} />
                    <Tooltip {...TT} />
                    <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Min RUL" radius={[0, 3, 3, 0]}>
                      {maintData.map((entry, i) => <Cell key={i} fill={RISK[entry.risk]?.color || "#16a34a"} />)}
                    </Bar>
                    <Bar dataKey="Avg RUL" fill="#bbf7d0" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            {/* Last log */}
            <div className="log-banner">
              <Ico d={IC.alert} size={14} color={snap.log_severity === "HIGH" ? "#dc2626" : "#d97706"} />
              <span className="log-eq">{snap.equipment_id}</span>
              <span className="log-text">{snap.last_log}</span>
              <Badge label={snap.log_severity} />
            </div>
          </div>
        )}

        {/* ══════════ FORECAST ══════════ */}
        {tab === "forecast" && (
          <div className="tab-content">
            <div className="kpi-strip">
              {Object.entries(SIGNALS).map(([key, s]) => (
                <MetricCard key={key} label={s.label}
                  value={(f.forecast_10_steps?.[key]?.[0] || 0).toFixed(2)} unit={s.unit}
                  accent={s.color} sub={`Trend: ${f.trend?.[key] || "—"}`} />
              ))}
            </div>

            {/* Signal selector */}
            <div className="filter-bar">
              <span className="filter-label">Signal</span>
              {Object.entries(SIGNALS).map(([key, s]) => (
                <button key={key} className={`filter-btn ${forecastSignal === key ? "active" : ""}`}
                  style={forecastSignal === key ? { background: s.color, borderColor: s.color } : {}}
                  onClick={() => setForecastSignal(key)}>{s.label}</button>
              ))}
            </div>

            <Panel title={`${sig.label} — 10-Step Forecast with Confidence Band`} icon="trend"
              accent={sig.color} accentLight={sig.color + "12"}
              extra={
                <button className="panel-action" onClick={() => exportCSV(forecastData, "forecast.csv")}>
                  <Ico d={IC.download} size={12} /> Export
                </button>
              }>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={forecastData} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id={sig.gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={sig.color} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={sig.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="step" tick={AX} />
                  <YAxis tick={AX} />
                  <Tooltip {...TT} />
                  <Area type="monotone" dataKey={forecastSignal} name={`${sig.label} ${sig.unit}`}
                    stroke={sig.color} fill={`url(#${sig.gradId})`} strokeWidth={2.5} dot={{ fill: sig.color, r: 4 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="All Signals — Forecast Comparison" icon="trend" accent="#2563eb" accentLight="#eff6ff">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={forecastData} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="step" tick={AX} />
                  <YAxis tick={AX} />
                  <Tooltip {...TT} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {Object.entries(SIGNALS).map(([key, s]) => (
                    <Line key={key} type="monotone" dataKey={key} name={`${s.label} ${s.unit}`}
                      stroke={s.color} strokeWidth={1.8} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <div className="grid-2">
              {Object.entries(f.trend || {}).map(([signal, trend]) => (
                <Insight key={signal} type={trend === "rising" ? (["temperature","vibration"].includes(signal) ? "danger" : "warn") : trend === "falling" ? (["flow_rate","power_kw"].includes(signal) ? "warn" : "good") : "good"}>
                  <strong>{SIGNALS[signal]?.label || signal}</strong> is trending <strong>{trend}</strong>.
                  {trend === "rising" && ["temperature","vibration"].includes(signal) && " Monitor closely — exceeding safe thresholds."}
                  {trend === "falling" && signal === "flow_rate" && " Possible flow restriction or valve issue."}
                  {trend === "stable" && " Operating within expected range."}
                </Insight>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ ENERGY ══════════ */}
        {tab === "energy" && (
          <div className="tab-content">
            <div className="kpi-strip">
              <MetricCard label="Total Energy"    value={e.total_energy_kwh}      unit=" kWh" accent="#7c3aed" />
              <MetricCard label="Carbon Emission" value={e.carbon_emission_kg}    unit=" kg"  accent="#dc2626" sub="CO₂ equivalent" />
              <MetricCard label="Energy Cost"     value={`₹${e.energy_cost_INR}`}              accent="#d97706" />
              <MetricCard label="Avg Power Draw"  value={e.avg_predicted_kw}      unit=" kW"  accent="#2563eb" />
              <MetricCard label="Avg Waste"       value={e.avg_waste_kw}          unit=" kW"  accent="#ea580c" sub="Above baseline" />
            </div>

            <Insight type={energyInsight.type}>{energyInsight.msg}</Insight>

            <Panel title="Power Consumption by Equipment" icon="energy" accent="#7c3aed" accentLight="#f5f3ff"
              extra={<button className="panel-action" onClick={() => exportCSV(energyData, "energy.csv")}><Ico d={IC.download} size={12} /> Export</button>}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={energyData} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="name" tick={AX} />
                  <YAxis tick={AX} />
                  <Tooltip {...TT} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Avg kW"  fill="#7c3aed" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Peak kW" fill="#ddd6fe" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Eff %"   fill="#16a34a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <div className="equip-grid">
              {Object.entries(e.by_equipment || {}).map(([eq, v]) => {
                const c = v.efficiency_pct >= 90 ? "#16a34a" : v.efficiency_pct >= 75 ? "#d97706" : "#dc2626";
                return (
                  <div key={eq} className="equip-card" style={{ "--accent": c }}>
                    <span className="equip-name">{eq}</span>
                    <div className="equip-row"><span className="equip-lbl">Avg kW</span><span className="equip-val">{v.avg_kw}</span></div>
                    <div className="equip-row"><span className="equip-lbl">Peak kW</span><span className="equip-val">{v.peak_kw}</span></div>
                    <div className="equip-row"><span className="equip-lbl">Efficiency</span><span style={{ fontWeight: 700, color: c, fontFamily: "JetBrains Mono", fontSize: 12 }}>{v.efficiency_pct}%</span></div>
                    <div className="equip-bar"><div className="equip-fill" style={{ width: `${Math.min(v.efficiency_pct, 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════ ANOMALIES ══════════ */}
        {tab === "anomalies" && (
          <div className="tab-content">
            <div className="kpi-strip">
              <MetricCard label="Total Anomalies" value={a.total_anomalies}    accent="#dc2626" />
              <MetricCard label="Anomaly Rate"    value={a.anomaly_rate_pct} unit="%" accent="#ea580c" sub="Of all readings" />
              {Object.entries(a.by_equipment || {}).sort((x, y) => y[1].anomaly_rate_pct - x[1].anomaly_rate_pct).slice(0, 3).map(([eq, v]) => (
                <MetricCard key={eq} label={eq} value={v.anomaly_rate_pct} unit="%"
                  accent={v.anomaly_rate_pct > 20 ? "#dc2626" : "#d97706"} sub={`${v.anomaly_count} events`} />
              ))}
            </div>

            {/* Plant filter */}
            <div className="filter-bar">
              <span className="filter-label">Plant</span>
              {plants.map(p => (
                <button key={p} className={`filter-btn ${plantFilter === p ? "active" : ""}`}
                  onClick={() => setPlantFilter(p)}>{p}</button>
              ))}
              <button className="panel-action" style={{ marginLeft: "auto" }}
                onClick={() => exportCSV(filteredAnomalies, "anomalies.csv")}>
                <Ico d={IC.download} size={12} /> Export
              </button>
            </div>

            <div className="grid-2">
              <Panel title={`Anomaly Events — ${filteredAnomalies.length} records`} icon="anomaly" accent="#dc2626" accentLight="#fef2f2" noPad>
                <div className="data-table">
                  <div className="table-head" style={{ gridTemplateColumns: "80px 80px 72px 70px 78px 78px 86px" }}>
                    <span>Time</span><span>Equipment</span><span>Plant</span><span>Temp</span><span>Pressure</span><span>Vibration</span><span>Score</span>
                  </div>
                  {filteredAnomalies.map((row, i) => (
                    <div key={i} className="table-row" style={{ gridTemplateColumns: "80px 80px 72px 70px 78px 78px 86px" }}>
                      <span className="td-mono td-muted">{new Date(row.timestamp).toLocaleTimeString()}</span>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{row.equipment_id}</span>
                      <span className="td-muted">{row.plant_id}</span>
                      <span className={row.temperature > 120 ? "val-warn" : ""}>{row.temperature}</span>
                      <span className={row.pressure > 180 ? "val-warn" : ""}>{row.pressure}</span>
                      <span className={row.vibration > 0.06 ? "val-warn" : ""}>{row.vibration}</span>
                      <span className="val-red">{row.anomaly_score?.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Anomaly Rate by Equipment" icon="anomaly" accent="#ea580c" accentLight="#fff7ed">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.entries(a.by_equipment || {}).sort((x, y) => y[1].anomaly_rate_pct - x[1].anomaly_rate_pct).map(([eq, v]) => {
                    const c = v.anomaly_rate_pct > 20 ? "#dc2626" : v.anomaly_rate_pct > 10 ? "#ea580c" : "#16a34a";
                    return (
                      <div key={eq}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontFamily: "JetBrains Mono", fontSize: 12 }}>{eq}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: "JetBrains Mono" }}>{v.anomaly_rate_pct}%</span>
                        </div>
                        <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(v.anomaly_rate_pct * 4, 100)}%`, background: c, borderRadius: 4, transition: "width 1s" }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{v.anomaly_count} events · avg score {v.avg_score?.toFixed(4)}</div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>

            <Insight type={a.anomaly_rate_pct > 15 ? "danger" : a.anomaly_rate_pct > 8 ? "warn" : "good"}>
              <strong>{a.total_anomalies} anomalies</strong> detected across {Object.keys(a.by_equipment || {}).length} equipment types
              ({a.anomaly_rate_pct}% rate).
              {a.anomaly_rate_pct > 15 && " Rate is critically high — immediate investigation required."}
              {a.anomaly_rate_pct > 8 && a.anomaly_rate_pct <= 15 && " Rate is elevated — monitor closely."}
              {a.anomaly_rate_pct <= 8 && " Rate is within acceptable range."}
            </Insight>
          </div>
        )}

        {/* ══════════ MAINTENANCE ══════════ */}
        {tab === "maintenance" && (
          <div className="tab-content">
            <div className="kpi-strip">
              <MetricCard label="Avg RUL"  value={m.avg_rul_hours} unit=" hrs" accent="#16a34a" sub="Remaining useful life" />
              <MetricCard label="Critical" value={m.risk_distribution?.CRITICAL || 0} accent="#dc2626" sub="Immediate action" />
              <MetricCard label="High"     value={m.risk_distribution?.HIGH || 0}     accent="#ea580c" sub="Within 7 days" />
              <MetricCard label="Medium"   value={m.risk_distribution?.MEDIUM || 0}   accent="#d97706" sub="Within 30 days" />
              <MetricCard label="Low"      value={m.risk_distribution?.LOW || 0}      accent="#16a34a" sub="Healthy" />
            </div>

            <Insight type={maintInsight.type}>{maintInsight.msg}</Insight>

            {m.equipment_needing_attention?.length > 0 && (
              <Panel title="Immediate Attention Required" icon="alert" accent="#dc2626" accentLight="#fef2f2" badge="URGENT" badgeColor="#dc2626">
                <div className="attention-list">
                  {m.equipment_needing_attention.map((eq, i) => (
                    <div key={i} className="attention-row">
                      <Ico d={IC.alert} size={14} color="#dc2626" />
                      <span className="attention-eq">{eq.equipment_id}</span>
                      <div className="attention-bar">
                        <div className="attention-fill" style={{ width: `${Math.max(5, 100 - (eq.min_rul / 600) * 100)}%` }} />
                      </div>
                      <span className="val-red" style={{ fontFamily: "JetBrains Mono", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>
                        {eq.min_rul} hrs RUL
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Risk filter */}
            <div className="filter-bar">
              <span className="filter-label">Risk Filter</span>
              {["ALL","CRITICAL","HIGH","MEDIUM","LOW"].map(r => (
                <button key={r} className={`filter-btn ${riskFilter === r ? "active" : ""}`}
                  style={riskFilter === r && r !== "ALL" ? { background: RISK[r]?.color, borderColor: RISK[r]?.color, color: "#fff" } : {}}
                  onClick={() => setRiskFilter(r)}>{r}</button>
              ))}
              <button className="panel-action" style={{ marginLeft: "auto" }}
                onClick={() => exportCSV(filteredMaint, "maintenance.csv")}>
                <Ico d={IC.download} size={12} /> Export
              </button>
            </div>

            <Panel title={`Maintenance Feed — ${filteredMaint.length} records`} icon="maint" accent="#16a34a" accentLight="#f0fdf4" noPad>
              <div className="data-table">
                <div className="table-head" style={{ gridTemplateColumns: "85px 90px 80px 105px 110px" }}>
                  <span>Time</span><span>Equipment</span><span>Plant</span><span>RUL (hrs)</span><span>Risk Level</span>
                </div>
                {filteredMaint.map((row, i) => (
                  <div key={i} className="table-row" style={{ gridTemplateColumns: "85px 90px 80px 105px 110px" }}>
                    <span className="td-mono td-muted">{new Date(row.timestamp).toLocaleTimeString()}</span>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{row.equipment_id}</span>
                    <span className="td-muted">{row.plant_id}</span>
                    <span className={row.rul_hours < 100 ? "val-red" : row.rul_hours < 250 ? "val-warn" : "val-ok"}>{row.rul_hours}</span>
                    <span><Badge label={row.risk_level} /></span>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="equip-grid">
              {Object.entries(m.by_equipment || {}).map(([eq, v]) => (
                <div key={eq} className="equip-card" style={{ "--accent": RISK[v.dominant_risk]?.color || "#16a34a" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span className="equip-name">{eq}</span>
                    <Badge label={v.dominant_risk} />
                  </div>
                  <div className="equip-row"><span className="equip-lbl">Min RUL</span><span className={v.min_rul_hrs < 100 ? "val-red" : "equip-val"}>{v.min_rul_hrs} hrs</span></div>
                  <div className="equip-row"><span className="equip-lbl">Avg RUL</span><span className="equip-val">{v.avg_rul_hrs} hrs</span></div>
                  <div className="equip-bar"><div className="equip-fill" style={{ width: `${Math.min((v.avg_rul_hrs / 600) * 100, 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ FAILURE ══════════ */}
        {tab === "failure" && (
          <div className="tab-content">
            <div className="kpi-strip">
              <MetricCard label="Imminent"      value={fl.imminent_failures}                                          accent="#dc2626" sub="< 24 hrs" />
              <MetricCard label="Avg Fail Prob" value={(fl.avg_failure_probability * 100).toFixed(1)} unit="%" accent="#ea580c" />
              <MetricCard label="Fleet Healthy" value={fl.fleet_health?.HEALTHY}        unit="%" accent="#16a34a" />
              <MetricCard label="High Risk"     value={fl.fleet_health?.HIGH_RISK}       unit="%" accent="#ea580c" />
              <MetricCard label="Severity Logs" value={fl.maintenance_logs_high_severity}           accent="#d97706" sub="HIGH severity" />
            </div>

            <Insight type={imm > 0 ? "danger" : fl.fleet_health?.HIGH_RISK > 10 ? "warn" : "good"}>
              <strong>Fleet Health:</strong> {fl.fleet_health?.HEALTHY}% healthy, {fl.fleet_health?.HIGH_RISK}% high risk, {fl.fleet_health?.IMMINENT}% imminent.
              {imm > 0 && <> <strong>{imm} unit(s)</strong> require immediate shutdown inspection.</>}
              {imm === 0 && fl.fleet_health?.HIGH_RISK > 10 && " Elevated high-risk count — schedule inspections proactively."}
              {imm === 0 && fl.fleet_health?.HIGH_RISK <= 10 && " Fleet is in good operational condition."}
            </Insight>

            <div className="grid-2">
              <Panel title="Fleet Health Distribution" icon="fail" accent="#dc2626" accentLight="#fef2f2">
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <ResponsiveContainer width={170} height={170}>
                    <PieChart>
                      <Pie data={healthPie} dataKey="value" cx="50%" cy="50%"
                        innerRadius={45} outerRadius={72} paddingAngle={3}>
                        {healthPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v}%`]}
                        contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,.08)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {healthPie.map(h => (
                      <div key={h.name} className="stat-row">
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: h.color, display: "inline-block", flexShrink: 0 }} />
                          <span className="stat-label">{h.name}</span>
                        </div>
                        <span className="stat-value" style={{ color: h.color }}>{h.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel title="Critical Equipment — Failure Probability" icon="fail" accent="#ea580c" accentLight="#fff7ed">
                <div className="critical-list">
                  {Object.entries(fl.critical_equipment || {}).map(([eq, prob]) => (
                    <div key={eq} className="critical-row">
                      <span className="critical-eq">{eq}</span>
                      <div className="prob-bar">
                        <div className="prob-fill" style={{ width: `${Math.min(prob * 100, 100)}%`, background: prob > 0.75 ? "#dc2626" : "#ea580c" }} />
                      </div>
                      <span className="prob-val" style={{ color: prob > 0.75 ? "#dc2626" : "#ea580c" }}>{(prob * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            {/* Risk filter */}
            <div className="filter-bar">
              <span className="filter-label">Status Filter</span>
              {["ALL","IMMINENT","HIGH_RISK","MODERATE","HEALTHY"].map(r => (
                <button key={r} className={`filter-btn ${riskFilter === r ? "active" : ""}`}
                  style={riskFilter === r && r !== "ALL" ? { background: RISK[r]?.color, borderColor: RISK[r]?.color, color: "#fff" } : {}}
                  onClick={() => setRiskFilter(r)}>{r.replace(/_/g, " ")}</button>
              ))}
              <button className="panel-action" style={{ marginLeft: "auto" }}
                onClick={() => exportCSV(filteredFail, "failure_predictions.csv")}>
                <Ico d={IC.download} size={12} /> Export
              </button>
            </div>

            <Panel title={`Failure Predictions — ${filteredFail.length} records`} icon="fail" accent="#dc2626" accentLight="#fef2f2" noPad>
              <div className="data-table">
                <div className="table-head" style={{ gridTemplateColumns: "85px 90px 75px 115px 105px 120px" }}>
                  <span>Time</span><span>Equipment</span><span>Plant</span><span>Status</span><span>Probability</span><span>Horizon</span>
                </div>
                {filteredFail.map((row, i) => (
                  <div key={i} className="table-row" style={{ gridTemplateColumns: "85px 90px 75px 115px 105px 120px" }}>
                    <span className="td-mono td-muted">{new Date(row.timestamp).toLocaleTimeString()}</span>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{row.equipment_id}</span>
                    <span className="td-muted">{row.plant_id}</span>
                    <span><Badge label={row.failure_label} /></span>
                    <span className={row.failure_prob > 0.6 ? "val-red" : row.failure_prob > 0.35 ? "val-warn" : "val-ok"}>
                      {(row.failure_prob * 100).toFixed(1)}%
                    </span>
                    <span className="td-muted" style={{ fontSize: 12 }}>{row.failure_horizon}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {/* ══════════ CHAT ══════════ */}
        {tab === "chat" && (
          <div className="tab-content chat-tab"><ChatPanel /></div>
        )}

      </main>
    </div>
  );
}