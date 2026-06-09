@echo off
cd /d %~dp0\..\backend
alembic upgrade head
