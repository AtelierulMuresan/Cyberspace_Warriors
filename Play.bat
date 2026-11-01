@echo off
rem Serves the game locally (ES modules need http://, not file://) and opens the browser.
cd /d "%~dp0"
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8080"
python serve.py 8080
