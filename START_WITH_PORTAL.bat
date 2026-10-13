@echo off
title Commander City — Shuttle Pass + Online Payment Portal
color 0B
cd /d "%~dp0"

echo.
echo  ╔═══════════════════════════════════════════════════════════════╗
echo  ║       COMMANDER CITY SHUTTLE PASS SYSTEM                      ║
echo  ║       Online Payment Portal with AI OCR Scanner               ║
echo  ╚═══════════════════════════════════════════════════════════════╝
echo.
echo  [1] Starting local server on http://localhost:3001 ...
echo  [2] Opening Desktop Dashboard (Management)
echo  [3] Opening Online Payment Portal (Residents)
echo.

:: Open Management Dashboard
start "" "http://localhost:3001"

:: Open Online Payment Portal (after 2-second delay for server startup)
timeout /t 2 /nobreak >nul
start "" "http://localhost:3001/portal"

echo  ✓ Both windows launching...
echo  ───────────────────────────────────────────────────────────────
echo  Dashboard URL  : http://localhost:3001
echo  Payment Portal : http://localhost:3001/portal
echo  Conductor Tool : http://localhost:3001/portal (Conductor tab)
echo  Admin Desk     : http://localhost:3001/portal (Admin tab)
echo  ───────────────────────────────────────────────────────────────
echo  Press CTRL+C to stop the server.
echo.

:: Start Node.js server (bundled node.exe takes priority)
if exist node.exe (
    node.exe server.js
) else (
    node server.js
)

pause
