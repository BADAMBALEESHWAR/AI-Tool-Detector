# AI Tool Monitoring System Launcher for PowerShell
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  AI Tool Monitoring & Academic Integrity Platform" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$root = $PSScriptRoot

# 1. Start Backend
Write-Host "[1/3] Starting Backend Server (Port 3001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; npm run dev"

Start-Sleep -Seconds 3

# 2. Start Admin Dashboard
Write-Host "[2/3] Starting Admin Dashboard (Port 5174)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\admin-dashboard'; npm run dev"

# 3. Start Student Dashboard
Write-Host "[3/3] Starting Student Dashboard (Port 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\student-dashboard'; npm run dev"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Services Launched Successfully!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Backend API:       http://localhost:3001" -ForegroundColor White
Write-Host "  Admin Dashboard:   http://localhost:5174" -ForegroundColor White
Write-Host "  Student Dashboard: http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "Optional Desktop App:" -ForegroundColor Cyan
Write-Host "  cd desktop-app; npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "Optional Browser Extension:" -ForegroundColor Cyan
Write-Host "  chrome://extensions -> Enable Developer Mode -> Load unpacked -> select 'extension' folder" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Green
