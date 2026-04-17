# FinPilot AI

FinPilot AI is a multi-agent finance intelligence starter project built with:

- FastAPI backend
- LangGraph orchestration
- 1 supervisor agent + 4 specialist agents
- Shared JSON seed data layer
- Deterministic finance tools for calculations and approvals
- Optional OpenAI or Groq integration
- Angular frontend shell

## Agent architecture

- **Supervisor / Orchestrator Agent**
- **Financial Close Agent**
- **POC Accounting Agent**
- **Revenue Recognition Agent**
- **Capital Allocation Agent**

## How the data is used

This project does **not** "pretrain" agents in the ML sense. Instead, it:
1. loads the shared JSON data file,
2. builds grounded retrieval/search over the structured sections,
3. feeds relevant records to the agents,
4. records decisions in an audit log.

## Quick start

## Sidecar integration in Enterprise-AI-Control-Tower

When used as a sidecar with the main Control Tower app:

- Main Control Tower frontend/backend stay on `4200` and `8000`
- FinPilot frontend/backend run on `4300` and `8010`

This keeps both stacks isolated while exposing FinPilot through the `/finpilot` launcher tile.

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8010
```

Default sidecar backend URL: `http://localhost:8010/api`

### Frontend

```bash
cd frontend
npm install
npm start
```

Default sidecar frontend URL: `http://localhost:4300`

The frontend reads `window.__env.FINPILOT_API_URL` when present; otherwise it uses `http://localhost:8010/api`.

## LLM provider settings

### Mock
```env
LLM_PROVIDER=mock
```

### OpenAI
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.1-mini
```

### Groq
```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-20b
GROQ_BASE_URL=https://api.groq.com/openai/v1
```
