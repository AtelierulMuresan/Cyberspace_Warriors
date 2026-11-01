@echo off
rem Runs a dedicated match server on this PC: a headless browser that hosts matches and plays in none.
rem It lists itself in the public match list and reopens after each match. Leave the window open; close it to stop.
rem Usage: Host-Server.bat [ROOMCODE] [map] [site url]
setlocal
set ROOM=%~1
if "%ROOM%"=="" set ROOM=PUBLIC1
set MAP=%~2
if "%MAP%"=="" set MAP=market
set SITE=%~3
if "%SITE%"=="" set SITE=https://www.atelierulmuresan.ro/Cyberspace_Warriors/

set BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%BROWSER%" set BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%BROWSER%" (
  echo Chrome or Edge is required.
  exit /b 1
)

echo Dedicated server: room %ROOM% on %MAP%
echo Join link: %SITE%?map=%MAP%^&room=%ROOM%
"%BROWSER%" --headless=new --mute-audio --use-angle=swiftshader --enable-unsafe-swiftshader --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --user-data-dir="%TEMP%\cyberspace-warriors-server-%ROOM%" --remote-debugging-port=0 "%SITE%?map=%MAP%&room=%ROOM%&dedicated=1"
