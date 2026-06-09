@echo off
echo Running backend tests...
call scripts\run_backend_tests.cmd
if errorlevel 1 exit /b 1

echo Building frontend...
call scripts\run_frontend_build.cmd
if errorlevel 1 exit /b 1

echo QA smoke checks completed.
