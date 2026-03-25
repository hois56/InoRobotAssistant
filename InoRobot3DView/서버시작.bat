@echo off
chcp 65001 > nul
title InoRobot 3D Viewer Server
echo.
echo  InoRobot 3D Viewer 서버를 시작합니다...
echo  브라우저가 자동으로 열립니다.
echo  종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.
python server.py
pause
