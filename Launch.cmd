@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launcher\bootstrap.ps1"
if errorlevel 1 pause
