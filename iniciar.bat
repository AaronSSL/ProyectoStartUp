@echo off
rem TalentAI - abre la aplicacion de escritorio
cd /d "%~dp0"
start "" ".venv\Scripts\pythonw.exe" app.py
