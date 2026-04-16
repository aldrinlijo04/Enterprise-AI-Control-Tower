#!/bin/bash
echo "=== ARIA Backend (FastAPI) ==="
echo ""

# Check Python
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
  echo "ERROR: Python not found. Install Python 3.10+ first."
  exit 1
fi

PYTHON=python3
command -v python3 &> /dev/null || PYTHON=python

# Create .env if missing
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "No .env found — copying from .env.example..."
    cp .env.example .env
    echo ""
    echo "  ⚠️  Edit .env and add your GROQ_API_KEY for AI chat."
    echo "  Get a free key at: https://console.groq.com"
    echo ""
  fi
fi

# Create venv if missing
if [ ! -d "venv" ]; then
  echo "Creating Python virtual environment..."
  $PYTHON -m venv venv
fi

# Activate
source venv/bin/activate 2>/dev/null || . venv/Scripts/activate 2>/dev/null

echo "Installing / checking dependencies..."
pip install -r requirements.txt -q

echo ""
echo "✅ Starting FastAPI on http://localhost:8000"
echo "📖 API docs:  http://localhost:8000/docs"
echo ""
uvicorn main:app --reload --port 8000
