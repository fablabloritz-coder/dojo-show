@echo off
chcp 65001 >nul 2>&1
title DOJO SHOW 2.0 — Lanceur
color 0D

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         DOJO SHOW 2.0 — Lanceur          ║
echo  ╠══════════════════════════════════════════╣
echo  ║                                          ║
echo  ║   1. Google Chrome  (mode app)           ║
echo  ║   2. Microsoft Edge (mode app)           ║
echo  ║   3. Firefox                             ║
echo  ║   4. Navigateur par defaut               ║
echo  ║   5. Serveur uniquement (pas de nav.)    ║
echo  ║                                          ║
echo  ╚══════════════════════════════════════════╝
echo.

set /p CHOIX="  Choix [1-5] : "

:: Demarrer le serveur Node
echo.
echo  [*] Demarrage du serveur...
cd /d "%~dp0"
start "DOJO-SERVER" /min cmd /c "node server.js"

:: Attendre que le serveur soit pret
timeout /t 2 /nobreak >nul

set URL=http://localhost:3000/admin.html

if "%CHOIX%"=="1" goto CHROME
if "%CHOIX%"=="2" goto EDGE
if "%CHOIX%"=="3" goto FIREFOX
if "%CHOIX%"=="4" goto DEFAULT
if "%CHOIX%"=="5" goto SERVERONLY
goto DEFAULT

:CHROME
echo  [*] Ouverture avec Google Chrome (mode app)...
set CHROME_PATH=
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if exist %%P set CHROME_PATH=%%~P
)
if "%CHROME_PATH%"=="" (
  echo  [!] Chrome introuvable. Ouverture avec le navigateur par defaut...
  goto DEFAULT
)
start "" "%CHROME_PATH%" --app="%URL%" --window-size=1920,1080
goto END

:EDGE
echo  [*] Ouverture avec Microsoft Edge (mode app)...
set EDGE_PATH=
for %%P in (
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) do (
  if exist %%P set EDGE_PATH=%%~P
)
if "%EDGE_PATH%"=="" (
  echo  [!] Edge introuvable. Ouverture avec le navigateur par defaut...
  goto DEFAULT
)
start "" "%EDGE_PATH%" --app="%URL%" --window-size=1920,1080
goto END

:FIREFOX
echo  [*] Ouverture avec Firefox...
set FF_PATH=
for %%P in (
  "%ProgramFiles%\Mozilla Firefox\firefox.exe"
  "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
) do (
  if exist %%P set FF_PATH=%%~P
)
if "%FF_PATH%"=="" (
  echo  [!] Firefox introuvable. Ouverture avec le navigateur par defaut...
  goto DEFAULT
)
start "" "%FF_PATH%" "%URL%"
goto END

:DEFAULT
echo  [*] Ouverture avec le navigateur par defaut...
start "" "%URL%"
goto END

:SERVERONLY
echo.
echo  [*] Serveur demarre sur http://localhost:3000
echo  [*] Admin  : http://localhost:3000/admin.html
echo  [*] Display: http://localhost:3000/display.html
echo.
echo  Appuyez sur une touche pour arreter le serveur...
pause >nul
taskkill /FI "WINDOWTITLE eq DOJO-SERVER" /F >nul 2>&1
goto QUIT

:END
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  Serveur : http://localhost:3000          ║
echo  ║  Admin   : Ouvert dans le navigateur      ║
echo  ║                                          ║
echo  ║  Fermez cette fenetre pour stopper        ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Appuyez sur une touche pour arreter...
pause >nul
taskkill /FI "WINDOWTITLE eq DOJO-SERVER" /F >nul 2>&1

:QUIT
echo  [*] Serveur arrete. Au revoir !
timeout /t 2 /nobreak >nul
