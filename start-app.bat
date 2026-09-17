@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-app.ps1"
if errorlevel 1 (
    echo.
    echo One-click launcher exited with an error.
    pause
)
endlocal
