# Start ARIA Frontend (Windows PowerShell)
Set-Location "$PSScriptRoot\frontend"
Write-Host "Installing npm packages..." -ForegroundColor Cyan
npm install
Write-Host "Starting ARIA React dashboard on http://localhost:3000" -ForegroundColor Green
npm start
