# AION Enterprise AI Control Tower

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY  :3000                        │
│              (Express / Node.js)                             │
└──────┬──────────┬────────────┬──────────────────────────────┘
       │          │            │
   /ingest     /twin      /decisions
       │          │            │
┌──────▼──┐ ┌────▼────┐  ┌────▼──────┐
│Ingestion│ │Digital  │  │Decision   │
│Service  │ │Twin     │  │Engine     │
└────┬────┘ │Engine   │  └─────┬─────┘
     │      └────┬────┘        │
     │           │             │
     └────► Event Bus ◄────────┘
           (Redis PubSub / Kafka)
                 │
    ┌────────────┼─────────────────┐
    │            │                 │
┌───▼──────┐ ┌──▼───────┐  ┌──────▼────┐
│Monitoring│ │Prediction│  │Decision   │
│Agent     │►│Agent     │► │Agent      │►Optimization Agent
└────────��─┘ └──────────┘  └───────────┘
    │              │
    │         ┌────▼─────────���─────────┐
    │         │  Python AI Services    │
    │         │  :8001 Anomaly (IF)    │
    │         │  :8002 Forecast (ARIMA)│
    │         │  :8003 Maintenance(RF) │
    │         └────────────────────────┘
    │
┌───▼─────────┐
│  MongoDB    │
│  + Redis    │
└─────────────┘
```

## Folder Structure

```
control-tower/
├── gateway/
│   ├── server.js                   # Express API Gateway (entry point)
│   ├── middleware/errorHandler.js
│   └── routes/
│       ├── ingestion.routes.js     # POST /api/ingest/ot|it|maintenance
│       ├── ai.routes.js            # POST /api/ai/anomaly|forecast|maintenance
│       ├── twin.routes.js          # GET/POST /api/twin/:plantId
│       └── decisions.routes.js     # GET/POST /api/decisions + /api/alerts
├── services/
│   ├── ingestion/
│   │   └── ingestion.service.js    # OT/IT/Maintenance ingestion + health scoring
│   ├── ai-services/
│   │   ├── anomaly_service/        # Python: Isolation Forest anomaly detection
│   │   │   ├── main.py             # FastAPI app (:8001)
│   │   │   └── detector.py         # IsolationForest + Z-score fallback
│   │   ├── forecasting_service/    # Python: ARIMA/Linear Regression forecasting
│   │   │   ├── main.py             # FastAPI app (:8002)
│   │   │   └── forecaster.py       # ARIMA → Regression → EWMA
│   │   ├── maintenance_service/    # Python: Random Forest failure prediction
│   │   │   ├── main.py             # FastAPI app (:8003)
│   │   │   └── predictor.py        # RF classifier + GBM regressor
│   │   └── fallback/               # JS fallbacks (Python services down)
│   │       ├── anomaly.fallback.js
│   │       ├── forecasting.fallback.js
│   │       └── maintenance.fallback.js
│   ├── digital-twin/
│   │   └── twin.engine.js          # Real-time plant/equipment state + simulation
│   ├── agents/
│   │   ├── base.agent.js           # Abstract base class
│   │   ├── monitoring.agent.js     # Anomaly detection + alert raising
│   │   ├── prediction.agent.js     # Forecasting + maintenance prediction
│   │   ├── decision.agent.js       # Rule-based prescriptive decisions
│   │   ├── optimization.agent.js   # Fleet-aware decision optimization
│   │   └── agent.coordinator.js    # Pipeline wiring + lifecycle management
│   └── decision-engine/
│       └── decision.engine.js      # Manual trigger + fleet analysis
├── models/                         # MongoDB schemas
│   ├── OTData.model.js
│   ├── ITData.model.js
│   ├── MaintenanceLog.model.js
│   ├── Alert.model.js
│   ├── Decision.model.js
│   └── DigitalTwin.model.js
├── config/
│   ├── db.config.js
│   └── services.config.js
├── utils/
│   ├── logger.js
│   ├── redis.client.js
│   ├── eventBus.js
│   └── dataGenerators.js
├── scripts/
│   ├── demo.js                     # Full end-to-end demo
│   ├── generate_ot_data.js         # Continuous OT simulator
│   ├── generate_it_data.js         # Continuous IT simulator
│   └── load_sample_data.js         # Load provided JSON files
├── .env
├── docker-compose.yml
└── package.json
```

## Quick Start (Without Docker)

### Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB (optional — system works without it)
- Redis (optional — in-memory fallback available)

### 1. Install Node.js dependencies
```bash
cd control-tower
npm install
```

### 2. Start Python AI services (3 terminals)

```bash
# Terminal 1 — Anomaly Service
cd services/ai-services/anomaly_service
pip install -r requirements.txt
python main.py
# Running at http://localhost:8001
```

```bash
# Terminal 2 — Forecasting Service
cd services/ai-services/forecasting_service
pip install -r requirements.txt
python main.py
# Running at http://localhost:8002
```

```bash
# Terminal 3 — Maintenance Service
cd services/ai-services/maintenance_service
pip install -r requirements.txt
python main.py
# Running at http://localhost:8003
```

### 3. Start the Gateway
```bash
# Terminal 4
cd control-tower
npm start
# Running at http://localhost:3000
```

### 4. Run the Demo
```bash
# Terminal 5
node scripts/demo.js
```

### 5. Load your sample data
```bash
node scripts/load_sample_data.js
```

### 6. Stream continuous OT data
```bash
node scripts/generate_ot_data.js --plant PLANT_A --interval 2000 --anomaly-rate 0.1
```

---

## Quick Start (Docker)

```bash
# Infrastructure + Python services + Gateway
docker-compose up -d

# With Kafka
docker-compose --profile kafka up -d

# Logs
docker-compose logs -f gateway
```

---

## API Reference

### Health & Dashboard
```
GET  /health                    System health check
GET  /api/dashboard             Summary: plants, alerts, decisions
GET  /api/ai/health             AI services status
```

### Data Ingestion
```
POST /api/ingest/ot             Ingest single OT sensor reading
POST /api/ingest/ot/batch       Ingest array of OT records
POST /api/ingest/it             Ingest single IT/order record
POST /api/ingest/it/batch       Ingest array of IT records
POST /api/ingest/maintenance    Ingest maintenance log
POST /api/ingest/simulate       Burst simulation (body: {ot_count, it_count, plant_id})
```

### AI Services (direct)
```
POST /api/ai/anomaly            Anomaly check on single OT record
POST /api/ai/forecast           Forecast time series (body: {values, horizon, metric})
POST /api/ai/maintenance        Predict maintenance for single reading
```

### Digital Twin
```
GET  /api/twin                          All plants
GET  /api/twin/:plantId                 Single plant state
GET  /api/twin/:plantId/equipment/:id   Equipment state
POST /api/twin/:plantId/simulate        What-if simulation
POST /api/twin/:plantId/reset           Reset to nominal
```

### Decisions & Alerts
```
GET  /api/decisions                       List decisions (filter: plant_id, status, priority)
GET  /api/decisions/:id                   Single decision
PATCH /api/decisions/:id/status           Update status
POST /api/decisions/trigger               Manual decision trigger
GET  /api/decisions/alerts/all            All alerts (filter: plant_id, severity, status)
PATCH /api/decisions/alerts/:id/resolve   Resolve alert
```

---

## Example API Usage

### Ingest OT Sensor Data
```bash
curl -X POST http://localhost:3000/api/ingest/ot \
  -H "Content-Type: application/json" \
  -d '{
    "plant_id": "PLANT_A",
    "equipment_id": "PUMP_01",
    "temperature": 158.4,
    "pressure": 225.0,
    "vibration": 0.28,
    "bearing_temp": 182.5,
    "oil_level_pct": 9.8,
    "rpm": 520,
    "noise_db": 98.5
  }'
```

### Direct Anomaly Check
```bash
curl -X POST http://localhost:3000/api/ai/anomaly \
  -H "Content-Type: application/json" \
  -d '{"equipment_id":"PUMP_01","plant_id":"PLANT_A","temperature":158.4,"vibration":0.28,"bearing_temp":182.5}'
```

### Forecast Temperature
```bash
curl -X POST http://localhost:3000/api/ai/forecast \
  -H "Content-Type: application/json" \
  -d '{"values":[75,82,88,95,105,118,135,152], "horizon":6, "metric":"temperature"}'
```

### Trigger Decision Engine
```bash
curl -X POST http://localhost:3000/api/decisions/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "plant_id": "PLANT_A",
    "equipment_id": "PUMP_01",
    "issue": "Critical sensor violations detected"
  }'
```

### What-If Simulation
```bash
curl -X POST http://localhost:3000/api/twin/PLANT_A/simulate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"equipment_failure","equipment_id":"PUMP_01"}'
```

---

## Sample Decision Output

```json
{
  "decision_id": "d9e2f3a1-...",
  "plant_id": "PLANT_A",
  "equipment_id": "PUMP_01",
  "priority": "CRITICAL",
  "issue": "PUMP_01 failure imminent within 6h",
  "prediction": "Equipment failure in ~6 hours (87% probability)",
  "action": "IMMEDIATE: Initiate controlled shutdown of PUMP_01. Deploy maintenance crew. Activate backup equipment. Recommended window: Immediate — within 1 hour.",
  "root_cause": "Multiple sensors exceeding limits: vibration, bearing_temp, oil_level_pct",
  "confidence": 0.92,
  "maintenance_window": "Immediate — within 1 hour",
  "estimated_impact": "Prevents unplanned downtime. Estimated cost avoidance: ₹2-8 lakhs",
  "cost_benefit": {
    "estimated_cost_avoidance_INR": 1600000,
    "maintenance_cost_estimate_INR": 240000,
    "roi_statement": "Estimated ₹16 lakh cost avoidance vs ~₹2 lakh maintenance cost"
  },
  "agent_chain": [
    {"agent": "MonitoringAgent",   "output": "Anomaly: CRITICAL"},
    {"agent": "PredictionAgent",   "output": "Equipment at high risk — failure in ~6h"},
    {"agent": "DecisionAgent",     "output": "IMMEDIATE: Initiate controlled shutdown..."},
    {"agent": "OptimizationAgent", "output": "...NOTE: 2 high-priority orders active — consider partial-load..."}
  ],
  "status": "PENDING"
}
```

---

## Agent Pipeline

```
OT Sensor Reading
       │
       ▼
MonitoringAgent (Anomaly Detection)
  └─► IsolationForest / Z-score check
  └─► Raises ALERT if anomaly
       │
       ▼  (ANOMALY event)
PredictionAgent (Forecasting + Maintenance)
  └─► ARIMA/LinearReg forecast of critical metrics
  └─► RandomForest failure probability
  └─► Estimates time-to-failure
       │
       ▼  (PREDICTION event)
DecisionAgent (Rule-Based Prescriptive Decision)
  └─► Matches against 7 decision rules
  └─► Generates: issue, prediction, action
       │
       ▼  (DECISION event)
OptimizationAgent (Fleet-Aware Optimization)
  └─► Checks production pressure (IT data)
  └─► Avoids scheduling conflicts (fleet view)
  └─► Calculates cost/benefit
  └─► Persists final decision to MongoDB
```
