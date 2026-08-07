@echo off
title Scanner Dashboard - Docker
cd /d "%~dp0"

echo  ================================================================
echo           SCANNER DASHBOARD - DOCKER COMPOSE
echo  ================================================================
echo.

echo  Starting all 5 containers...
docker compose up -d

echo.
echo  Waiting for services to be ready...
timeout /t 8 /nobreak >nul

echo.
echo  ================================================================
echo  ALL CONTAINER STARTED
echo  ================================================================
echo.
echo  Frontend:  http://localhost:3001
echo  Backend:   http://localhost:8000
echo  API docs:  http://localhost:8000/docs
echo.
echo  Login:     test@scanner.io / testpass123
echo.
echo  Commands:
echo    Stop:     docker compose down
echo    Logs:     docker compose logs -f backend
echo    Rebuild:  docker compose build ^&^& docker compose up -d
echo.
pause
