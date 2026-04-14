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

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm start
```

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
