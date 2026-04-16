# ARIA Backend — run from inside the backend/ folder
Write-Host "=== ARIA Backend (FastAPI) ===" -ForegroundColor Green
Write-Host ""

# Check Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: Python not found. Install Python 3.10+ from https://python.org" -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

# Create .env
if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example" -ForegroundColor Yellow
    Write-Host "Add your GROQ_API_KEY to backend\.env for AI chat" -ForegroundColor Cyan
    Write-Host "Get a free key: https://console.groq.com" -ForegroundColor Cyan
    Write-Host ""
  }
}

# Create venv
if (-not (Test-Path "venv")) {
  Write-Host "Creating virtual environment..." -ForegroundColor Yellow
  python -m venv venv
}

# Activate
& "venv\Scripts\Activate.ps1"

Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt -q

Write-Host ""
Write-Host "Starting FastAPI on http://localhost:8000" -ForegroundColor Green
Write-Host "API docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
uvicorn main:app --reload --port 8000
