@echo off
rem MaestroClaw worker — keeps exactly one worker running against the project in .env.
rem Double-click, or add a shortcut to shell:startup. Closing the window stops the worker.
rem 2026-10-22: three stale workers were once polling at the same time; this script kills
rem any existing worker first, builds dist if missing, and restarts the worker if it exits.

setlocal
cd /d "%~dp0"

echo [start-worker] stopping any running MaestroClaw worker...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'dist[\\/]index\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

if not exist dist\index.js (
  echo [start-worker] dist missing, building...
  call npm run build || (echo [start-worker] build failed & pause & exit /b 1)
)

:loop
echo [start-worker] starting worker %date% %time%
node dist\index.js
echo [start-worker] worker exited with %errorlevel%; restarting in 5s (Ctrl+C to stop)
timeout /t 5 /nobreak >nul
goto loop
