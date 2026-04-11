# ARIA — Advanced Real-time Industrial AI
### RFP-Ready Plant Monitoring Dashboard

Multi-model AI system powered by real OT/IT/Maintenance data.
React + FastAPI | 7 concurrent AI models | GROQ LLM assistant

---

## Architecture

```
plant-ai/
├── backend/
│   ├── data/
│   │   ├── ot_data.json            ← 500 OT sensor records
│   │   ├── it_data.json            ← 500 IT/business records
│   │   └── maintenance_logs.json   ← 500 maintenance logs
│   ├── models/
│   │   └── ai_models.py            ← 7 AI models
│   ├── services/
│   │   └── chat_service.py         ← GROQ LLM integration
│   ├── main.py                     ← FastAPI app
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── pages/Dashboard.js      ← Main dashboard
    │   ├── App.js / App.css
    │   ├── api.js
    │   └── index.js
    └── package.json
```

---

## 7 AI Models

| # | Model | Data Source | Algorithm |
|---|-------|-------------|-----------|
| 1 | **Forecasting** | OT sensors | Gradient Boosting (rolling window) |
| 2 | **Demand Prediction** | IT data | Gradient Boosting Regressor |
| 3 | **Energy Consumption** | OT sensors | Random Forest Regressor |
| 4 | **Anomaly Detection** | OT sensors | Isolation Forest + Z-score |
| 5 | **Plant Behavior** | OT sensors | Random Forest Classifier |
| 6 | **Predictive Maintenance** | OT + Logs | RF Regressor (RUL) + RF Classifier (Risk) |
| 7 | **Equipment Failure** | OT + Logs | RF Classifier + GB Regressor (probability) |

---

## Setup

### Backend

```bash
cd backend
pip install -r requirements.txt

# Set your GROQ API key
export GROQ_API_KEY="your_key_here"          # Linux/Mac
$env:GROQ_API_KEY="your_key_here"            # Windows PowerShell

# Start server
uvicorn main:app --reload --port 8000
```

Backend runs at: http://localhost:8000
API docs at: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm start
```

Frontend runs at: http://localhost:3000

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/snapshot` | Latest sensor + order values |
| GET | `/api/report` | Full 7-model analysis report |
| GET | `/api/report/{module}` | Single model report |
| GET | `/api/data/anomalies` | Detected anomaly records |
| GET | `/api/data/maintenance` | RUL predictions |
| GET | `/api/data/failure` | Failure predictions |
| POST | `/api/chat` | ARIA LLM assistant |
| POST | `/api/transcribe` | Voice → text |

---

## Dashboard Tabs

- **Overview** — KPI strip, sensor forecast, plant behavior, demand, maintenance RUL
- **Energy** — Power consumption, carbon, cost, efficiency by equipment
- **Anomalies** — Live anomaly feed + rate by equipment
- **Maintenance** — RUL predictions, risk levels, urgent attention list
- **Failure** — Fleet health, failure probability, equipment risk ranking
- **Chat** — ARIA assistant with voice input + suggested prompts
