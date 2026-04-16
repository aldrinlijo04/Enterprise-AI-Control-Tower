# ARIA Angular Frontend — Windows PowerShell
Write-Host "=== ARIA Angular Frontend ===" -ForegroundColor Green
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: Node.js not found. Install Node 18+ from https://nodejs.org" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command ng -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Angular CLI globally..." -ForegroundColor Yellow
  npm install -g @angular/cli
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..." -ForegroundColor Yellow
  npm install
}

Write-Host ""
Write-Host "Starting Angular dev server at http://localhost:4200" -ForegroundColor Cyan
Write-Host "Make sure FastAPI backend is running at http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
ng serve --open
