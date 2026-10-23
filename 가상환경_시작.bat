@echo off
setlocal
chcp 65001 > nul
title InoRobot Assistant - Virtual Controller

cd /d "%~dp0"

where node > nul 2> nul
if errorlevel 1 (
    echo.
    echo Node.js is required to start the InoRobot virtual environment.
    echo Install Node.js, then run this file again.
    echo.
    pause
    exit /b 1
)

rem Relaunch without a console window. The servers stop when every page is closed.
if /i not "%~1"=="hidden" (
    start "" conhost.exe --headless cmd.exe /c ""%~f0" hidden"
    exit /b
)

if not defined INOROBOT_VIRTUAL_BUS_TOKEN (
    for /f "delims=" %%T in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set "INOROBOT_VIRTUAL_BUS_TOKEN=%%T"
)
if not defined INOROBOT_VIRTUAL_BUS_TOKEN (
    powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show('Failed to create the Virtual Bus pairing token.', 'InoRobot Assistant')"
    exit /b 1
)

set "INOROBOT_EXIT_WHEN_PAGES_CLOSED=1"
set "COLLAB_PID="
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Start-Process -FilePath node -ArgumentList 'tools\collaboration-server.cjs','8787' -WindowStyle Hidden -PassThru).Id"') do set "COLLAB_PID=%%P"
start "" "http://127.0.0.1:8765/2_3DSimulation/"
node tools\serve-local.cjs 8765
set "SERVER_EXIT=%ERRORLEVEL%"

if defined COLLAB_PID taskkill /pid %COLLAB_PID% /f > nul 2> nul
if not "%SERVER_EXIT%"=="0" (
    powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show('The local server stopped with an error. Port 8765 may already be in use.', 'InoRobot Assistant')"
)
exit /b
