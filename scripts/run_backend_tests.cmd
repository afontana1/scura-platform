@echo off
cd /d %~dp0\..\backend
python -m pytest
