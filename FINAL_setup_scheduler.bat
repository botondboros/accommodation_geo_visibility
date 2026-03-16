@echo off
:: setup_scheduler.bat
:: Run this ONCE as Administrator to register the 48-hour pipeline task.
:: Right-click this file → "Run as administrator"

set TASK_NAME=HRAssistant_Pipeline
set PYTHON_PATH=python
set SCRIPT_DIR=C:\Users\bboro\Documents\hr_assistant
set SCRIPT=run_pipeline.py

echo.
echo ════════════════════════════════════════════
echo   HR Assistant — Task Scheduler Setup
echo ════════════════════════════════════════════
echo.

:: Delete existing task if it exists
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Create new task: runs every 2 days (48h) at 08:00
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "cmd /c cd /d %SCRIPT_DIR% && %PYTHON_PATH% %SCRIPT% >> hr_assistant.log 2>&1" ^
  /sc DAILY ^
  /mo 2 ^
  /st 08:00 ^
  /sd 02/27/2026 ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% == 0 (
    echo.
    echo  ✅ Task registered successfully!
    echo.
    echo  Schedule:  Every 48 hours at 08:00
    echo  Starts:    27 Feb 2026
    echo  Folder:    %SCRIPT_DIR%
    echo  Log:       %SCRIPT_DIR%\hr_assistant.log
    echo.
    echo  To check status:   schtasks /query /tn "%TASK_NAME%"
    echo  To run manually:   schtasks /run /tn "%TASK_NAME%"
    echo  To disable:        schtasks /change /tn "%TASK_NAME%" /disable
    echo  To delete:         schtasks /delete /tn "%TASK_NAME%" /f
    echo.
) else (
    echo.
    echo  ❌ Failed to create task. Make sure you ran as Administrator.
    echo.
)

pause
