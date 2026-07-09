# ================================================================
#  SENTINEL — Script de démarrage tout-en-un (Windows, sans Docker)
#  Lance : Mosquitto (broker MQTT) + Backend FastAPI + Frontend Vite
#
#  Usage :  clic droit → « Exécuter avec PowerShell »
#           ou dans un terminal :  .\start-sentinel.ps1
#
#  Si l'exécution de scripts est bloquée, lancer une fois :
#     Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# ================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Write-Host ""
Write-Host "  SENTINEL - Demarrage du systeme" -ForegroundColor Cyan
Write-Host "  =================================" -ForegroundColor Cyan
Write-Host ""

# ── 0) IP locale du PC (a mettre dans le secrets.h des firmwares) ──
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
       Select-Object -First 1).IPAddress
Write-Host "  IP de ce PC (broker MQTT pour les ESP) : $ip" -ForegroundColor Yellow
Write-Host "  -> Verifier MQTT_BROKER dans les secrets.h des firmwares." -ForegroundColor DarkGray
Write-Host ""

# ── 0bis) Pare-feu Windows : ouvrir 8000 (API), 5173 (Web), 1883 (MQTT) ──
# Necessaire pour que les telephones du jury et les ESP atteignent le PC.
# Requiert des droits admin : sinon on previent et on continue.
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    foreach ($p in 8000, 5173, 1883) {
        $ruleName = "SENTINEL-$p"
        if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
                -Action Allow -Protocol TCP -LocalPort $p -Profile Any | Out-Null
            Write-Host "  [PARE-FEU] Port $p ouvert (regle $ruleName creee)." -ForegroundColor Green
        }
    }
} else {
    Write-Host "  [PARE-FEU] Non-admin : ports non ouverts automatiquement." -ForegroundColor DarkYellow
    Write-Host "             Si le jury n'accede pas, lancer CE script UNE fois" -ForegroundColor DarkGray
    Write-Host "             en tant qu'administrateur (clic droit -> Executer admin)." -ForegroundColor DarkGray
}
Write-Host ""

# ── 1) Broker MQTT (Mosquitto) ─────────────────────────────────────
# Cherche d'abord un service Windows nomme "mosquitto", sinon lance l'exe.
$mosqSvc = Get-Service -Name "mosquitto" -ErrorAction SilentlyContinue
if ($mosqSvc) {
    if ($mosqSvc.Status -ne "Running") {
        Write-Host "  [MQTT] Demarrage du service Mosquitto..." -ForegroundColor Green
        Start-Service mosquitto
    } else {
        Write-Host "  [MQTT] Service Mosquitto deja actif." -ForegroundColor Green
    }
} else {
    # Pas de service : on tente l'executable (installation portable)
    $mosqExe = @(
        "C:\Program Files\mosquitto\mosquitto.exe",
        "C:\Program Files (x86)\mosquitto\mosquitto.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($mosqExe) {
        Write-Host "  [MQTT] Lancement de Mosquitto ($mosqExe)..." -ForegroundColor Green
        # -v = verbeux ; ecoute par defaut sur 0.0.0.0:1883 (config par defaut)
        Start-Process -FilePath $mosqExe -ArgumentList "-v" -WindowStyle Minimized
    } else {
        Write-Host "  [MQTT] Mosquitto introuvable !" -ForegroundColor Red
        Write-Host "         Installer depuis https://mosquitto.org/download/" -ForegroundColor Red
        Write-Host "         puis relancer ce script." -ForegroundColor Red
        Write-Host ""
    }
}
Start-Sleep -Seconds 1

# ── 1bis) Moniteur MQTT (voir les trames en direct) ────────────────
# mosquitto_sub s'abonne a TOUS les topics ("#") et affiche chaque message
# avec son topic (-v). C'est la "fenetre broker" : on y voit passer en direct
# les trames /data des ESP, les /status ONLINE/OFFLINE et les /cmd relais.
$mosqSub = @(
    "C:\Program Files\mosquitto\mosquitto_sub.exe",
    "C:\Program Files (x86)\mosquitto\mosquitto_sub.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($mosqSub) {
    Write-Host "  [MQTT] Ouverture du moniteur (toutes les trames)..." -ForegroundColor Green
    # Guillemets SIMPLES autour du chemin : ils survivent au re-parsing de
    # Start-Process, meme si le chemin contient un espace (Program Files).
    $subCmd = "`$host.UI.RawUI.WindowTitle='SENTINEL - Moniteur MQTT'; " +
              "Write-Host 'Moniteur MQTT (topic # = tout). Trames en direct :' -ForegroundColor Cyan; " +
              "& '$mosqSub' -h localhost -t '#' -v"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $subCmd
} else {
    Write-Host "  [MQTT] mosquitto_sub introuvable (moniteur non ouvert)." -ForegroundColor DarkYellow
}
Start-Sleep -Seconds 1

# ── 2) Backend FastAPI (uvicorn) ───────────────────────────────────
# --host 0.0.0.0 pour que les ESP du reseau local atteignent l'API si besoin.
# IMPORTANT : on utilise le Python du VENV du projet (celui de PyCharm), qui
# contient les dependances (pydantic_settings, fastapi...). Le "python" global
# ne les a PAS et provoquerait "ModuleNotFoundError: No module named ...".
$venvPy = @(
    "$root\backend\venv\Scripts\python.exe",
    "$root\backend\.venv\Scripts\python.exe",
    "$root\.venv\Scripts\python.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($venvPy) {
    Write-Host "  [API]  Backend via venv : $venvPy" -ForegroundColor Green
} else {
    $venvPy = "python"
    Write-Host "  [API]  venv introuvable -> python global (les deps doivent y etre)." -ForegroundColor DarkYellow
}
Write-Host "  [API]  Lancement du backend FastAPI (port 8000)..." -ForegroundColor Green
$backendCmd = "cd '$root\backend'; & '$venvPy' -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# ── 3) Frontend React (Vite) ───────────────────────────────────────
Write-Host "  [WEB]  Lancement du frontend Vite (port 5173)..." -ForegroundColor Green
$frontendCmd = "cd '$root\frontend'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "  Tout est lance dans des fenetres separees :" -ForegroundColor Cyan
Write-Host "    - Broker MQTT  : $ip : 1883"
Write-Host "    - Moniteur MQTT: fenetre 'SENTINEL - Moniteur MQTT' (trames en direct)"
Write-Host "    - API/Backend  : http://localhost:8000  (docs: /docs)"
Write-Host "    - Interface Web: http://localhost:5173  (sur ce PC)"
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Magenta
Write-Host "   POUR LE JURY (telephones sur le meme WiFi) :" -ForegroundColor Magenta
Write-Host "      http://$ip`:5173" -ForegroundColor White
Write-Host "  ================================================" -ForegroundColor Magenta
Write-Host "   -> Les telephones DOIVENT etre sur le meme reseau WiFi que ce PC." -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Fermer les fenetres PowerShell pour tout arreter." -ForegroundColor DarkGray
Write-Host ""

# Ouvre l'interface dans le navigateur par defaut apres quelques secondes
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"
