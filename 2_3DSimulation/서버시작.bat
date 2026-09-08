@echo off
chcp 65001 > nul
title InoRobot 3D Simulation Collaboration Servers

echo.
echo  Starting InoRobot 3D Simulation servers...
echo  This computer must be reachable by the second PC on the same network.
echo.

where node > nul 2> nul
if %errorlevel% neq 0 (
    echo  Node.js is required to run the simulation and collaboration servers.
    pause
    exit /b
)

set "INOROBOT_SERVER_HOST=0.0.0.0"
set "INOROBOT_COLLAB_HOST=0.0.0.0"
set "INOROBOT_COLLAB_ALLOWED_ORIGINS=*"
set "INOROBOT_PROJECT_ROOT=%~dp0.."

start "InoRobot Static Server" cmd /k "cd /d ""%INOROBOT_PROJECT_ROOT%"" && node tools\serve-local.cjs 8765"
start "InoRobot Collaboration Server" cmd /k "cd /d ""%INOROBOT_PROJECT_ROOT%"" && node tools\collaboration-server.cjs 8787"

echo  Static server:        http://localhost:8765/2_3DSimulation/
echo  Collaboration server: ws://<this-PC-IP>:8787/collaboration
echo  Share the static server address using this PC's local IP.
echo  Close the two server windows to stop them.
