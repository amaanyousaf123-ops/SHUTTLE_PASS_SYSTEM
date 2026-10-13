@echo off
title Sync Members to Vercel Portal
color 0A

echo.
echo ==========================================
echo   COMMANDER CITY - SYNC TO VERCEL PORTAL
echo ==========================================
echo.
echo  This will upload your latest member list
echo  to GitHub so the online portal can find
echo  residents when they search their name.
echo.
echo  Press any key to sync...
pause >nul

cd /d "%~dp0"

echo.
echo [1/3] Staging updated member list...
git add data/members.json

echo [2/3] Committing changes...
git commit -m "sync: update members list for online portal [%date% %time%]"

echo [3/3] Pushing to GitHub (Vercel auto-updates)...
git push

echo.
echo ==========================================
echo   DONE! Portal updated in ~30 seconds.
echo ==========================================
echo.
echo  Users can now search their name on
echo  the online payment portal.
echo.
pause
