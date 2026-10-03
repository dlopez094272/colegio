@echo off
echo ============================================
echo   GESTION ESCOLAR - Iniciando Sistema
echo ============================================

echo [1/2] Iniciando Backend (Node.js puerto 3100)...
start "Colegio Backend" cmd /k "cd /d %~dp0backend && npm run dev"

timeout /t 3 /nobreak >nul

echo [2/2] Iniciando Frontend (Angular puerto 4200)...
start "Colegio Frontend" cmd /k "cd /d %~dp0frontend && npm start"

echo.
echo Sistema iniciado:
echo   Backend:  http://localhost:3100
echo   Frontend: http://localhost:4200
echo.
pause
