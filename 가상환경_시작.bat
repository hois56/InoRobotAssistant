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

if not defined INOROBOT_VIRTUAL_BUS_TOKEN (
    for /f "delims=" %%T in ('node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"') do set "INOROBOT_VIRTUAL_BUS_TOKEN=%%T"
)
if not defined INOROBOT_VIRTUAL_BUS_TOKEN (
    echo.
    echo Failed to create the Virtual Bus pairing token.
    echo.
    pause
    exit /b 1
)

echo.
echo Starting the InoRobot virtual environment...
echo Opening: http://127.0.0.1:8765/2_3DSimulation/
echo Virtual Bus pairing is enabled for this session.
echo Stop the server by closing this window or pressing Ctrl+C.
echo.

start "" "http://127.0.0.1:8765/2_3DSimulation/"
node tools\serve-local.cjs 8765

if errorlevel 1 pause
exit /b
