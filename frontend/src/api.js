import axios from "axios";

const BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

const api = axios.create({ baseURL: BASE });

export const fetchSnapshot = () => api.get("/api/snapshot").then(r => r.data);
export const fetchReport   = () => api.get("/api/report").then(r => r.data);
export const fetchModule   = (mod) => api.get(`/api/report/${mod}`).then(r => r.data);
export const fetchAnomalies = () => api.get("/api/data/anomalies").then(r => r.data);
export const fetchMaintenance = () => api.get("/api/data/maintenance").then(r => r.data);
export const fetchFailure   = () => api.get("/api/data/failure").then(r => r.data);

export const sendChat = (message, history) =>
  api.post("/api/chat", { message, history }).then(r => r.data.reply);

export const transcribeAudio = (audioB64) =>
  api.post("/api/transcribe", { audio_b64: audioB64 }).then(r => r.data.text);
