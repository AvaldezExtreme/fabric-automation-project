@echo off
title Network Config Tool - Starting Both Services
cd /d "C:\Users\clvaldez\OneDrive - Extreme Networks, Inc\Documents\FabricAutomationProject\Claude\network-config-tool"

echo.
echo ========================================
echo Network Configuration Automation Tool
echo ========================================
echo.
echo Starting Backend (http://localhost:3001)...
start cmd /k npm start

timeout /t 3 /nobreak

echo Starting Frontend (http://localhost:3000)...
start cmd /k "cd frontend && npm run dev"

timeout /t 3 /nobreak

echo.
echo ========================================
echo Both services started!
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
echo ========================================
echo.
echo Press any key to open frontend in browser...
pause

start http://localhost:3000

exit