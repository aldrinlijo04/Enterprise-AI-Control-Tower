#!/bin/bash
# Start ARIA backend
cd "$(dirname "$0")/backend"
echo "Installing dependencies..."
pip install -r requirements.txt -q
echo ""
echo "Starting ARIA FastAPI backend on http://localhost:8000"
echo "API docs: http://localhost:8000/docs"
echo ""
uvicorn main:app --reload --port 8000
