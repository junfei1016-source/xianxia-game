@echo off
setlocal enableextensions
cd /d "%~dp0"
set "PORT=3000"
set "TRIES=0"

rem ---- locate node.exe ----
set "NODE="
for %%P in (node.exe) do if not defined NODE if exist "%%~$PATH:P" set "NODE=%%~$PATH:P"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE if exist "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE (
  echo [Xianxia] Node.js not found.
  echo Install Node.js 20+ or edit this launcher to point at node.exe.
  pause
  exit /b 1
)

rem ---- server already running? then just open the page ----
call :probe
if %errorlevel%==0 goto open

rem ---- start the local server in its own minimized window ----
start "Xianxia server (close this window to stop)" /min "%NODE%" server.mjs

:wait
call :probe
if %errorlevel%==0 goto open
set /a TRIES+=1
if %TRIES% geq 20 goto fail
timeout /t 1 /nobreak >nul
goto wait

:fail
echo [Xianxia] The server did not start within 20 seconds.
echo Close other windows using port %PORT%, then try again.
pause
exit /b 1

:open
if not defined NO_BROWSER start "" "http://localhost:%PORT%/"
exit /b 0

:probe
powershell -NoProfile -Command "try{$c=New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0}catch{exit 1}" >nul 2>nul
exit /b %errorlevel%
