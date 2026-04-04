@echo off
setlocal enabledelayedexpansion
title DOJO SHOW 2.0
color 0D

:: Stocker le chemin de base AVANT tout bloc if/for
:: Ceci evite les bugs si le chemin contient des parentheses ex: dossier(2)
set "BD=%~dp0"
cd /d "!BD!"

:: ==========================================
::  ETAPE 1 : Trouver Node.js
:: ==========================================

:: 1a. Node systeme ?
where node >nul 2>&1
if not errorlevel 1 goto NODE_READY

:: 1b. Node portable local ?
if exist "!BD!node_portable\node.exe" goto USE_PORTABLE
goto NO_NODE

:USE_PORTABLE
set "PATH=!BD!node_portable;%PATH%"
goto NODE_READY

:NO_NODE
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
echo    [1] Telecharger automatiquement ~25 Mo
echo        installe localement dans le dossier
echo.
echo    [2] Quitter et installer manuellement
echo        depuis nodejs.org
echo.
echo  ==========================================
echo.
set /p NC="  Choix [1-2] : "

if not "!NC!"=="1" goto MANUAL_INSTALL
goto AUTO_INSTALL

:MANUAL_INSTALL
echo.
echo  Rendez-vous sur https://nodejs.org
echo  Installez la version LTS puis relancez start.bat
echo.
pause
goto QUIT

:AUTO_INSTALL
echo.
echo  [*] Telechargement de Node.js portable...
echo  [*] Cela peut prendre 1-2 minutes selon la connexion.
echo.

set "NODE_VER=v20.18.0"
set "NODE_ZIP=!BD!_node_dl.zip"
set "NODE_URL=https://nodejs.org/dist/%NODE_VER%/node-%NODE_VER%-win-x64.zip"

:: Telechargement : curl Windows 10+, sinon PowerShell
curl.exe -L --progress-bar -o "!NODE_ZIP!" "!NODE_URL!" 2>nul
if not exist "!NODE_ZIP!" goto DL_POWERSHELL
goto DL_DONE

:DL_POWERSHELL
echo  [*] Methode alternative en cours...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '!NODE_URL!' -OutFile '!NODE_ZIP!'"

:DL_DONE
if not exist "!NODE_ZIP!" goto DL_FAILED
goto DL_EXTRACT

:DL_FAILED
echo.
echo  [!] Echec du telechargement.
echo  [!] Verifiez votre connexion internet.
echo  [!] Ou installez Node.js depuis https://nodejs.org
echo.
pause
goto QUIT

:DL_EXTRACT
echo  [*] Extraction en cours...
powershell -NoProfile -Command "Expand-Archive -Path '!NODE_ZIP!' -DestinationPath '!BD!_node_tmp' -Force"

:: Deplacer le dossier extrait vers node_portable
if exist "!BD!node_portable" rd /s /q "!BD!node_portable" >nul 2>&1
for /d %%D in ("!BD!_node_tmp\node-*") do move "%%D" "!BD!node_portable" >nul

:: Nettoyage fichiers temporaires
del "!NODE_ZIP!" >nul 2>&1
rd /s /q "!BD!_node_tmp" >nul 2>&1

if not exist "!BD!node_portable\node.exe" goto EXTRACT_FAILED
goto EXTRACT_OK

:EXTRACT_FAILED
echo.
echo  [!] L'extraction a echoue.
echo  [!] Installez Node.js depuis https://nodejs.org
echo.
pause
goto QUIT

:EXTRACT_OK
set "PATH=!BD!node_portable;%PATH%"
echo.
echo  [OK] Node.js installe avec succes !
echo.

:NODE_READY

:: ==========================================
::  ETAPE 2 : Installer les dependances
:: ==========================================
if exist "node_modules" goto DEPS_OK

echo.
echo  [*] Premiere utilisation - Installation des dependances...
echo  [*] Cela peut prendre quelques secondes.
echo.
call npm install
if errorlevel 1 goto DEPS_FAILED
echo.
echo  [OK] Dependances installees !
echo.
goto DEPS_OK

:DEPS_FAILED
echo.
echo  [!] ERREUR : npm install a echoue.
echo  [!] Verifiez votre connexion internet et relancez.
echo.
pause
exit /b 1

:DEPS_OK

:: ==========================================
::  ETAPE 3 : Detecter l'adresse IP locale
:: ==========================================
set "LAN_IP=introuvable"
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "try { $ip = Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual -ErrorAction Stop; $ip[0].IPAddress } catch { 'introuvable' }"`) do set "LAN_IP=%%i"

:: ==========================================
::  ETAPE 4 : Menu de lancement
:: ==========================================

:: Charger le choix de navigateur sauvegarde
set "CHOIX="
set "PREF_FILE=!BD!_browser_pref.txt"
if exist "!PREF_FILE!" (
  set /p CHOIX=<"!PREF_FILE!"
)

if defined CHOIX (
  cls
  echo.
  echo  ==========================================
  echo    DOJO SHOW 2.0 - Lanceur
  echo  ==========================================
  echo.
  echo    Adresses du serveur :
  echo    - Sur CE PC :  http://localhost:3000
  echo    - Sur le LAN : http://!LAN_IP!:3000
  echo.
  echo    Navigateur memorise : choix !CHOIX!
  echo    Pour changer, supprimez _browser_pref.txt
  echo  ==========================================
  echo.
  goto START_SERVER
)

cls
echo.
echo  ==========================================
echo    DOJO SHOW 2.0 - Lanceur
echo  ==========================================
echo.
echo    Adresses du serveur :
echo    - Sur CE PC :  http://localhost:3000
echo    - Sur le LAN : http://!LAN_IP!:3000
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

:: Sauvegarder le choix
echo !CHOIX!>"!PREF_FILE!"

:START_SERVER

:: ==========================================
::  ETAPE 5 : Demarrer le serveur
:: ==========================================
echo.

:: Verifier si le port 3000 est deja occupe et tuer le processus
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3000.*LISTENING" 2^>nul') do (
  echo  [!] Port 3000 deja utilise par PID %%p - arret en cours...
  taskkill /PID %%p /F >nul 2>&1
  timeout /t 1 /nobreak >nul
)

echo  [*] Demarrage du serveur...

:: Ecrire le script serveur temporaire ligne par ligne pour eviter les problemes de parentheses
set "SRV=!BD!_start_server.cmd"
echo @echo off> "!SRV!"
echo title DOJO-SERVER>> "!SRV!"
echo cd /d "!BD!">> "!SRV!"
echo set "PATH=!BD!node_portable;%%PATH%%">> "!SRV!"
echo echo.>> "!SRV!"
echo echo  [*] Demarrage du serveur Node.js...>> "!SRV!"
echo echo.>> "!SRV!"
echo node server.js>> "!SRV!"
echo echo.>> "!SRV!"
echo echo  [!] Le serveur s'est arrete.>> "!SRV!"
echo echo  [!] Verifiez les messages ci-dessus.>> "!SRV!"
echo pause>> "!SRV!"

start "DOJO-SERVER" "!SRV!"

:: Attendre que le serveur reponde vraiment (max 15 secondes)
echo  [*] Attente du demarrage du serveur...
set "SERVER_OK=0"
set "TRIES=0"

:HEALTH_LOOP
if "!TRIES!"=="15" goto HEALTH_DONE
set /a TRIES+=1
curl.exe -s -o nul -w "" --max-time 1 http://localhost:3000 >nul 2>&1
if not errorlevel 1 (
  set "SERVER_OK=1"
  goto HEALTH_DONE
)
echo  [*] Tentative !TRIES!/15...
timeout /t 1 /nobreak >nul
goto HEALTH_LOOP

:HEALTH_DONE

if "!SERVER_OK!"=="0" goto SERVER_FAILED
goto SERVER_OK

:SERVER_FAILED
echo.
echo  ==========================================
echo    [!] Le serveur n'a pas demarre.
echo  ==========================================
echo.
echo    Verifiez la fenetre DOJO-SERVER pour
echo    voir les messages d'erreur.
echo.
echo    Causes possibles :
echo    - Port 3000 deja utilise
echo    - npm install a echoue
echo    - Erreur dans un fichier de configuration
echo.
echo  ==========================================
echo.
pause
taskkill /FI "WINDOWTITLE eq DOJO-SERVER" /F >nul 2>&1
goto QUIT

:SERVER_OK
echo  [OK] Serveur pret !

set URL=http://localhost:3000/admin.html

if "!CHOIX!"=="1" goto CHROME
if "!CHOIX!"=="2" goto EDGE
if "!CHOIX!"=="3" goto FIREFOX
if "!CHOIX!"=="4" goto DEFAULT
if "!CHOIX!"=="5" goto SERVERONLY
goto DEFAULT

:CHROME
echo  [*] Ouverture avec Google Chrome [mode app]...
set "CHROME_PATH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if "!CHROME_PATH!"=="" goto CHROME_MISSING
start "" "!CHROME_PATH!" --app="!URL!" --window-size=1920,1080
goto END

:CHROME_MISSING
echo  [!] Chrome introuvable. Navigateur par defaut...
goto DEFAULT

:EDGE
echo  [*] Ouverture avec Microsoft Edge [mode app]...
set "EDGE_PATH="
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if "!EDGE_PATH!"=="" goto EDGE_MISSING
start "" "!EDGE_PATH!" --app="!URL!" --window-size=1920,1080
goto END

:EDGE_MISSING
echo  [!] Edge introuvable. Navigateur par defaut...
goto DEFAULT

:FIREFOX
echo  [*] Ouverture avec Firefox...
set "FF_PATH="
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" set "FF_PATH=%ProgramFiles%\Mozilla Firefox\firefox.exe"
if exist "%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe" set "FF_PATH=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
if "!FF_PATH!"=="" goto FF_MISSING
start "" "!FF_PATH!" "!URL!"
goto END

:FF_MISSING
echo  [!] Firefox introuvable. Navigateur par defaut...
goto DEFAULT

:DEFAULT
echo  [*] Ouverture avec le navigateur par defaut...
start "" "!URL!"
goto END

:SERVERONLY
echo.
echo  ==========================================
echo    Serveur demarre !
echo  ------------------------------------------
echo    Sur CE PC :  http://localhost:3000
echo    Sur le LAN : http://!LAN_IP!:3000
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
echo    Sur le LAN : http://!LAN_IP!:3000
echo  ------------------------------------------
echo    Fermez cette fenetre pour tout stopper
echo  ==========================================
echo.
echo  Appuyez sur une touche pour arreter...
pause >nul
taskkill /FI "WINDOWTITLE eq DOJO-SERVER" /F >nul 2>&1

:QUIT
:: Supprimer le script temporaire
del "!BD!_start_server.cmd" >nul 2>&1
echo  [*] Serveur arrete. Au revoir !
timeout /t 2 /nobreak >nul
