@echo off
title GPT Personal Assistant v4 - Setup
echo.
echo Installing required package...
echo.
npm install
echo.
if %errorlevel% neq 0 (
  echo Installation failed. Check that Node.js is installed and internet access is available.
) else (
  echo Setup complete.
)
echo.
pause
