@echo off
setlocal enabledelayedexpansion
title DOJO SHOW 2.0
color 0D
cd /d "%~dp0"

:: ==========================================
::  ETAPE 1 : Trouver Node.js
:: ==========================================

:: 1a. Node systeme ?
where node >nul 2>&1
if not errorlevel 1 goto NODE_READY

:: 1b. Node portable local ?
if exist "%~dp0node_portable\node.exe" (
  set "PATH=%~dp0node_portable;%PATH%"
  goto NODE_READY
)

:: 1c. Node introuvable - proposer le telechargement
cls
echo.
echo  ==========================================
echo    DOJO SHOW 2.0 - Configuration initiale
echo  ==========================================
echo.
echo    Node.js n'est pas installe sur ce PC.
echo    Il est necessaire pour faire tourner le serveur.
echo.
echo    [1] Telecharger automatiquement (~25 Mo)
echo        (installe localement dans le dossier)
echo.
echo    [2] Quitter et installer manuellement
echo        depuis nodejs.org
echo.
echo  ==========================================
echo.
set /p NC="  Choix [1-2] : "

if not "%NC%"=="1" (
  echo.
  echo  Rendez-vous sur https://nodejs.org
  echo  Installez la version LTS puis relancez start.bat
  echo.
  pause
  goto QUIT
)

echo.
echo  [*] Telechargement de Node.js portable...
echo  [*] Cela peut prendre 1-2 minutes selon la connexion.
echo.

set "NODE_VER=v20.18.0"
set "NODE_ZIP=%~dp0_node_dl.zip"
set "NODE_URL=https://nodejs.org/dist/%NODE_VER%/node-%NODE_VER%-win-x64.zip"

:: Telechargement : curl (Windows 10+), sinon PowerShell
curl.exe -L --progress-bar -o "%NODE_ZIP%" "%NODE_URL%" 2>nul
if not exist "%NODE_ZIP%" (
  echo  [*] Methode alternative en cours...
  powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%'"
)

if not exist "%NODE_ZIP%" (
  echo.
  echo  [!] Echec du telechargement.
  echo  [!] Verifiez votre connexion internet.
  echo  [!] Ou installez Node.js depuis https://nodejs.org
  echo.
  pause
  goto QUIT
)

echo  [*] Extraction en cours...
powershell -Command "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '%~dp0_node_tmp' -Force"

:: Deplacer le dossier extrait vers node_portable
if exist "%~dp0node_portable" rd /s /q "%~dp0node_portable" >nul 2>&1
for /d %%D in ("%~dp0_node_tmp\node-*") do (
  move "%%D" "%~dp0node_portable" >nul
)

:: Nettoyage fichiers temporaires
del "%NODE_ZIP%" >nul 2>&1
rd /s /q "%~dp0_node_tmp" >nul 2>&1

if not exist "%~dp0node_portable\node.exe" (
  echo.
  echo  [!] L'extraction a echoue.
  echo  [!] Installez Node.js depuis https://nodejs.org
  echo.
  pause
  goto QUIT
)

set "PATH=%~dp0node_portable;%PATH%"
echo.
echo  [OK] Node.js installe avec succes !
echo.

:NODE_READY

:: ==========================================
::  ETAPE 2 : Installer les dependances
:: ==========================================
if not exist "node_modules" (
  echo.
  echo  [*] Premiere utilisation - Installation des dependances...
  echo  [*] Cela peut prendre quelques secondes.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [!] ERREUR : npm install a echoue.
    echo  [!] Verifiez votre connexion internet et relancez.
    echo.
    pause
    exit /b 1
  )
  echo.
  echo  [OK] Dependances installees !
  echo.
)

:: ==========================================
::  ETAPE 3 : Detecter l'adresse IP locale
:: ==========================================
set "LAN_IP=introuvable"
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress"`) do set "LAN_IP=%%i"

:: ==========================================
::  ETAPE 4 : Menu de lancement
:: ==========================================
cls
echo.
echo  ==========================================
echo    DOJO SHOW 2.0 - Lanceur
echo  ==========================================
echo.
echo    Adresses du serveur :
echo    - Sur CE PC :  http://localhost:3000
echo    - Sur le LAN : http://%LAN_IP%:3000
echo.
echo    Les autres organisateurs peuvent ouvrir
echo    l'adresse LAN dans leur navigateur.
echo    Aucune installation requise chez eux !
echo.
echo  ------------------------------------------
echo    Ouvrir avec :
echo    1. Google Chrome  [mode app]
echo    2. Microsoft Edge [mode app]
echo    3. Firefox
echo    4. Navigateur par defaut
echo    5. Serveur uniquement [pas de navigateur]
echo  ==========================================
echo.
set /p CHOIX="  Choix [1-5] : "

:: ==========================================
::  ETAPE 5 : Demarrer le serveur
:: ==========================================
echo.
echo  [*] Demarrage du serveur...

:: Script temporaire pour la fenetre serveur
>"%~dp0_start_server.cmd" (
  echo @echo off
  echo title DOJO-SERVER
  echo cd /d "%~dp0"
  echo set "PATH=%~dp0node_portable;%%PATH%%"
  echo echo.
  echo echo  [*] Demarrage du serveur Node.js...
  echo echo.
  echo node server.js
  echo set EXITCODE=%%errorlevel%%
  echo echo.
  echo if %%EXITCODE%% neq 0 (
  echo   echo  ==========================================
  echo   echo    [!] ERREUR - Le serveur a plante
  echo   echo  ==========================================
  echo   echo.
  echo   echo    Code erreur : %%EXITCODE%%
  echo   echo.
  echo   echo    Causes possibles :
  echo   echo    - Port 3000 deja utilise
  echo   echo    - Dependance manquante
  echo   echo    - Erreur dans server.js
  echo   echo.
  echo   echo    Relancez start.bat apres avoir
  echo   echo    corrige le probleme.
  echo   echo  ==========================================
  echo ^)
  echo echo.
  echo echo  [!] Le serveur s'est arrete.
  echo pause
)
start "DOJO-SERVER" "%~dp0_start_server.cmd"

:: Attendre que le serveur reponde vraiment (max 15 secondes)
echo  [*] Attente du demarrage du serveur...
set "SERVER_OK=0"
for /L %%i in (1,1,15) do (
  if "!SERVER_OK!"=="0" (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
      set "SERVER_OK=1"
    ) else (
      timeout /t 1 /nobreak >nul
    )
  )
)

if "%SERVER_OK%"=="0" (
  echo.
  echo  ==========================================
  echo    [!] Le serveur n'a pas demarre.
  echo  ==========================================
  echo.
  echo    Verifiez la fenetre DOJO-SERVER pour
  echo    voir les messages d'erreur.
  echo.
  echo    Causes possibles :
  echo    - Port 3000 deja utilise par un autre programme
  echo    - npm install a echoue (pas de connexion ?)
  echo    - Erreur dans un fichier de configuration
  echo.
  echo  ==========================================
  echo.
  pause
  taskkill /FI "WINDOWTITLE eq DOJO-SERVER" /F >nul 2>&1
  goto QUIT
)

echo  [OK] Serveur pret !

set URL=http://localhost:3000/admin.html

if "%CHOIX%"=="1" goto CHROME
if "%CHOIX%"=="2" goto EDGE
if "%CHOIX%"=="3" goto FIREFOX
if "%CHOIX%"=="4" goto DEFAULT
if "%CHOIX%"=="5" goto SERVERONLY
goto DEFAULT

:CHROME
echo  [*] Ouverture avec Google Chrome [mode app]...
set "CHROME_PATH="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if exist %%P set "CHROME_PATH=%%~P"
)
if "%CHROME_PATH%"=="" (
  echo  [!] Chrome introuvable. Navigateur par defaut...
  goto DEFAULT
)
start "" "%CHROME_PATH%" --app="%URL%" --window-size=1920,1080
goto END

:EDGE
echo  [*] Ouverture avec Microsoft Edge [mode app]...
set "EDGE_PATH="
for %%P in (
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) do (
  if exist %%P set "EDGE_PATH=%%~P"
)
if "%EDGE_PATH%"=="" (
  echo  [!] Edge introuvable. Navigateur par defaut...
  goto DEFAULT
)
start "" "%EDGE_PATH%" --app="%URL%" --window-size=1920,1080
goto END

:FIREFOX
echo  [*] Ouverture avec Firefox...
set "FF_PATH="
for %%P in (
  "%ProgramFiles%\Mozilla Firefox\firefox.exe"
  "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
) do (
  if exist %%P set "FF_PATH=%%~P"
)
if "%FF_PATH%"=="" (
  echo  [!] Firefox introuvable. Navigateur par defaut...
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
echo  ==========================================
echo    Serveur demarre !
echo  ------------------------------------------
echo    Sur CE PC :  http://localhost:3000
echo    Sur le LAN : http://%LAN_IP%:3000
echo  ------------------------------------------
echo    Admin  : /admin.html
echo    Display: /display.html
echo  ==========================================
echo.
echo  Appuyez sur une touche pour arreter le serveur...
pause >nul
taskkill /FI "WINDOWTITLE eq DOJO-SERVER" /F >nul 2>&1
goto QUIT

:END
echo.
echo  ==========================================
echo    Serveur demarre !
echo  ------------------------------------------
echo    Sur CE PC :  http://localhost:3000
echo    Sur le LAN : http://%LAN_IP%:3000
echo  ------------------------------------------
echo    Fermez cette fenetre pour tout stopper
echo  ==========================================
echo.
echo  Appuyez sur une touche pour arreter...
pause >nul
taskkill /FI "WINDOWTITLE eq DOJO-SERVER" /F >nul 2>&1

:QUIT
:: Supprimer le script temporaire
del "%~dp0_start_server.cmd" >nul 2>&1
echo  [*] Serveur arrete. Au revoir !
timeout /t 2 /nobreak >nul
