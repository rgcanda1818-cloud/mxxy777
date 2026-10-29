@echo off 
setlocal
cd /d "%~dp0"

set /p ADMIN_EMAIL=Enter the email of an existing Northgate account:

if not defined ADMIN_EMAIL (
  echo An email address is required.
  pause
  exit /b 1
)

python server.py --promote-admin "%ADMIN_EMAIL%"
if errorlevel 1 (
  echo Admin promotion failed. Create the account first and check the email address.
  pause
  exit /b 1
)

echo Sign out and back in, or reload the account page, to see Admin orders.
pause
