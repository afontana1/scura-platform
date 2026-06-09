@echo off
cd frontend
call npm install --no-audit --no-fund
call npm run build
