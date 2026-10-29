@echo off
setlocal
cd /d "%~dp0"

curl.exe --silent --fail http://127.0.0.1:8080/api/health 2>nul | findstr /C:productReviews >nul
if not errorlevel 1 goto open_site

curl.exe --silent --fail http://127.0.0.1:8080/api/health >nul 2>nul
if not errorlevel 1 goto outdated_server

start "Northgate Local Server" /D "%~dp0" cmd /k python server.py

for /L %%i in (1,1,15) do (
  timeout /t 1 /nobreak >nul
  curl.exe --silent --fail http://127.0.0.1:8080/api/health 2>nul | findstr /C:productReviews >nul
  if not errorlevel 1 goto open_site
)

echo Northgate did not start. Check the Northgate Local Server window for errors.
echo Make sure Python is installed and port 8080 is available.
pause
exit /b 1

:outdated_server
echo A Northgate server is already running, but it does not support product reviews yet.
echo Close its server window, then run this file again to start the updated version.
pause
exit /b 1

:open_site
start "" "http://127.0.0.1:8080/"
exit /b 0
