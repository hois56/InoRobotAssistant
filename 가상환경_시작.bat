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

echo.
echo Starting the InoRobot virtual environment...
echo Opening: http://127.0.0.1:8765/2_3DSimulation/
echo Stop the server by closing this window or pressing Ctrl+C.
echo.

start "" "http://127.0.0.1:8765/2_3DSimulation/"
node tools\serve-local.cjs 8765

if errorlevel 1 pause
exit /b
