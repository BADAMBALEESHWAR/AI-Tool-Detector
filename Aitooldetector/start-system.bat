@echo off
TITLE AI Tool Monitoring System Launcher
echo ========================================================
echo   AI Tool Monitoring & Academic Integrity Platform
echo ========================================================
echo.
echo Starting all system services in separate windows...
echo.

:: 1. Backend API
echo [1/3] Starting Backend Server (Port 3001)...
start "AI Monitor - Backend API" cmd /k "cd /d %~dp0backend && npm run dev"

:: Wait 3 seconds for backend to initialize
timeout /t 3 /nobreak >nul

:: 2. Admin Dashboard
echo [2/3] Starting Admin Dashboard (Port 5174)...
start "AI Monitor - Admin Dashboard" cmd /k "cd /d %~dp0admin-dashboard && npm run dev"

:: 3. Student Dashboard
echo [3/3] Starting Student Dashboard (Port 5173)...
start "AI Monitor - Student Dashboard" cmd /k "cd /d %~dp0student-dashboard && npm run dev"

echo.
echo ========================================================
echo   Services Launched Successfully!
echo ========================================================
echo   - Backend API:       http://localhost:3001
echo   - Admin Dashboard:   http://localhost:5174
echo   - Student Dashboard: http://localhost:5173
echo.
echo To launch the Desktop App (Electron), run:
echo   cd desktop-app ^&^& npm run dev
echo.
echo To load the Browser Extension:
echo   1. Go to chrome://extensions/ in Chrome/Edge
echo   2. Enable Developer Mode
echo   3. Click "Load unpacked" and select the "extension" folder.
echo ========================================================
pause
