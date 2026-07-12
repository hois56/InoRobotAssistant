@echo off
chcp 65001 > nul
title InoRobot 3D Viewer Server

echo.
echo  Starting InoRobot 3D Viewer server...
echo  Open this address in your browser: http://localhost:5173
echo  To stop the server, close this window or press Ctrl+C.
echo.

where node > nul 2> nul
if %errorlevel%==0 (
    node server.js
    pause
    exit /b
)

where py > nul 2> nul
if %errorlevel%==0 (
    py server.py
    pause
    exit /b
)

where python > nul 2> nul
if %errorlevel%==0 (
    python server.py
    pause
    exit /b
)

echo  Node.js or Python is required to run this viewer.
echo  Please install Node.js, then run this file again.
pause
