@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
echo.
echo  ЩЕБЕНЬ GO — локальный запуск
echo  http://127.0.0.1:8110/
echo  База: data\shcheben_go.db
echo  Остановить: Ctrl+C
echo.

if not exist ".venv\Scripts\python.exe" (
  echo Окружение .venv не найдено. Запускаю установку...
  call "%~dp0setup.bat"
  if errorlevel 1 exit /b 1
)

".venv\Scripts\python.exe" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8110
