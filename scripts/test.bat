@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
  echo Окружение .venv не найдено. Запускаю установку...
  call "%~dp0setup.bat"
  if errorlevel 1 exit /b 1
)
".venv\Scripts\python.exe" -m pytest backend\tests -q
