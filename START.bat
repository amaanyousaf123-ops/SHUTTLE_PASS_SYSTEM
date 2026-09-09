@echo off
title Commander City Shuttle Pass System
cd /d "%~dp0"
echo Starting Shuttle Pass System...

:: Open browser immediately to localhost:3000
start "" "http://localhost:3000"

:: Start Node.js server
if exist node.exe (
    node.exe server.js
) else (
    node server.js
)
pause
