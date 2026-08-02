@echo off
:: ============================================================
::  One-Click Launcher — Windows (double-click this file)
::  Runs install_and_run.ps1 with execution policy bypass.
:: ============================================================
echo Starting Atlantean installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_and_run.ps1" %*
pause
