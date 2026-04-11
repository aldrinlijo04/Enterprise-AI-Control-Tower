# Start ARIA Backend (Windows PowerShell)
Set-Location "$PSScriptRoot\backend"
Write-Host "Installing dependencies..." -ForegroundColor Cyan
pip install -r requirements.txt
Write-Host ""
Write-Host "Set your GROQ key: `$env:GROQ_API_KEY='your_key_here'" -ForegroundColor Yellow
Write-Host "Starting ARIA backend on http://localhost:8000" -ForegroundColor Green
uvicorn main:app --reload --port 8000
