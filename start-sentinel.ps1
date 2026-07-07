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

# ── 2) Backend FastAPI (uvicorn) ───────────────────────────────────
# --host 0.0.0.0 pour que les ESP du reseau local atteignent l'API si besoin.
Write-Host "  [API]  Lancement du backend FastAPI (port 8000)..." -ForegroundColor Green
$backendCmd = "cd `"$root\backend`"; python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# ── 3) Frontend React (Vite) ───────────────────────────────────────
Write-Host "  [WEB]  Lancement du frontend Vite (port 5173)..." -ForegroundColor Green
$frontendCmd = "cd `"$root\frontend`"; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "  Tout est lance dans des fenetres separees :" -ForegroundColor Cyan
Write-Host "    - Broker MQTT  : $ip : 1883"
Write-Host "    - API/Backend  : http://localhost:8000  (docs: /docs)"
Write-Host "    - Interface Web: http://localhost:5173"
Write-Host ""
Write-Host "  Fermer les fenetres PowerShell pour tout arreter." -ForegroundColor DarkGray
Write-Host ""

# Ouvre l'interface dans le navigateur par defaut apres quelques secondes
Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"
