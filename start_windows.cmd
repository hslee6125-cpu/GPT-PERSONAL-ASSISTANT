@echo off
title GPT Personal Assistant v4
echo.
echo API key must be set in the current environment before starting.
echo Example PowerShell:
echo   $env:OPENAI_API_KEY="YOUR_API_KEY"
echo   $env:OPENAI_MODEL="gpt-5-nano"
echo   node server.js
echo.
node server.js
pause
