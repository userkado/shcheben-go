@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
echo.
echo  ЩЕБЕНЬ GO — установка окружения
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo Python не найден. Установите Python 3.11+ и повторите.
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Создаю виртуальное окружение .venv...
  python -m venv .venv
  if errorlevel 1 exit /b 1
)

echo Устанавливаю зависимости...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 exit /b 1

echo.
echo Готово. Запуск: scripts\run.bat
