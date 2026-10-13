@echo off
title Commander City Shuttle Pass System
color 0B
cd /d "%~dp0"

echo.
echo  ═══════════════════════════════════════════════════════
echo   COMMANDER CITY SHUTTLE PASS SYSTEM v2.0
echo   Starting server + Online Payment Portal...
echo  ═══════════════════════════════════════════════════════
echo.

:: Open Management Dashboard
start "" "http://localhost:3001"

:: Wait 2 seconds then open Payment Portal in second browser tab
timeout /t 2 /nobreak >nul
start "" "http://localhost:3001/portal"

echo  Dashboard  : http://localhost:3001
echo  Pay Portal : http://localhost:3001/portal
echo.

:: Start Node.js server
if exist node.exe (
    node.exe server.js
) else (
    node server.js
)

pause
