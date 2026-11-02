# Launches the ThreatGraph API and UI in two PowerShell windows.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path "$root\backend\.venv\Scripts\python.exe")) {
    Write-Host "Backend venv missing - run setup first (see README.md)." -ForegroundColor Red; exit 1
}
if (-not (Test-Path "$root\frontend\node_modules")) {
    Write-Host "frontend\node_modules missing - run 'npm install' inside frontend first." -ForegroundColor Red; exit 1
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\.venv\Scripts\python -m uvicorn app.main:app --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Write-Host "API: http://localhost:8000/docs"
Write-Host "UI:  http://localhost:3000 (or the port shown in the UI window if 3000 is busy)"
