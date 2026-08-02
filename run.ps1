# ============================================================================
# VR Robotics Academy - full bootstrap and launcher
# Usage:  powershell -ExecutionPolicy Bypass -File .\run.ps1
# Idempotent - safe to re-run.
# ============================================================================

$ErrorActionPreference = 'Stop'
$ROOT = $PSScriptRoot
if (-not $ROOT) { $ROOT = (Get-Location).Path }

function Banner($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

function NpmInstall($dir, $label) {
    Write-Host "  -> $label" -ForegroundColor DarkGray
    Push-Location $dir
    try {
        & npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm install failed in $dir" }
    } finally {
        Pop-Location
    }
}

# ---- Sanity check: .env files must exist -----------------------------------
$requiredEnvs = @(
    "$ROOT\backend\auth-service\.env",
    "$ROOT\backend\admin-service\.env",
    "$ROOT\backend\Bastion-server\.env",
    "$ROOT\frontend\.env"
)
foreach ($p in $requiredEnvs) {
    if (-not (Test-Path $p)) {
        Write-Host "ERROR: missing .env file: $p" -ForegroundColor Red
        Write-Host "Create the .env files first (see SETUP_GUIDE.md)." -ForegroundColor Yellow
        exit 1
    }
}

# ---- Step 1: install admin-service (needed for pg used by migrations) ------
Banner "Step 1/5: install admin-service (5-8 min first time)"
NpmInstall "$ROOT\backend\admin-service" "admin-service"

# ---- Step 2: apply Supabase schema -----------------------------------------
Banner "Step 2/5: apply Supabase schema"
Push-Location "$ROOT\backend\admin-service"
try {
    & node "$ROOT\supabase\apply-migrations.js"
    if ($LASTEXITCODE -ne 0) { throw "Schema migration failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

# ---- Step 3: install remaining services + frontend -------------------------
Banner "Step 3/5: install remaining services + frontend"
NpmInstall "$ROOT\backend\auth-service"       "auth-service"
NpmInstall "$ROOT\backend\assessment-service" "assessment-service"
NpmInstall "$ROOT\backend\Bastion-server"     "Bastion-server"
NpmInstall "$ROOT\frontend"                   "frontend"

# ---- Step 4: seed admin accounts (idempotent) ------------------------------
Banner "Step 4/5: seed admin accounts (idempotent - safe re-run)"

Push-Location "$ROOT\backend\admin-service"
try {
    Write-Host "  -> root admin (lms_admin.users)" -ForegroundColor DarkGray
    & npm run seed:admin
} finally { Pop-Location }

Push-Location "$ROOT\backend\auth-service"
try {
    Write-Host "  -> platform admin (lucy_devdb.users + Supabase Auth)" -ForegroundColor DarkGray
    & node "src\scripts\seedAdmin.js"
} finally { Pop-Location }

# ---- Step 5: launch all services in separate windows -----------------------
Banner "Step 5/5: launch services in separate windows"

$services = @(
    @{ Name = 'auth-service';       Port = 8001; Path = "$ROOT\backend\auth-service" },
    @{ Name = 'admin-service';      Port = 5000; Path = "$ROOT\backend\admin-service" },
    @{ Name = 'assessment-service'; Port = 8003; Path = "$ROOT\backend\assessment-service" },
    @{ Name = 'Bastion-server';     Port = 8000; Path = "$ROOT\backend\Bastion-server" },
    @{ Name = 'frontend';           Port = 8080; Path = "$ROOT\frontend" }
)

foreach ($svc in $services) {
    $name  = $svc.Name
    $port  = $svc.Port
    $path  = $svc.Path
    $title = "VR Robotics - $name :$port"
    $cmd   = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$path'; Write-Host '-- $name starting on port $port --' -ForegroundColor Green; npm run dev"
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $cmd | Out-Null
    Write-Host "  -> launched $name (port $port)" -ForegroundColor DarkGray
    Start-Sleep -Milliseconds 700
}

Write-Host ""
Write-Host "All services launching. Waiting ~12 seconds..." -ForegroundColor Green
Start-Sleep -Seconds 12

Write-Host ""
Write-Host "Opening http://localhost:8080" -ForegroundColor Yellow
Start-Process "http://localhost:8080"

Write-Host ""
Write-Host "-------------------------------------------------------------"
Write-Host " Login credentials (change after first login):" -ForegroundColor Yellow
Write-Host "   Platform admin  ->  vradmin@vrroboticsacademy.com   /  VrAdmin@2026"
Write-Host "   Root admin      ->  vrroot@vrroboticsacademy.com    /  VrRoot@2026"
Write-Host ""
Write-Host " Health-check URLs:" -ForegroundColor Yellow
Write-Host "   http://localhost:8001/health     (auth-service)"
Write-Host "   http://localhost:5000/api/health (admin-service)"
Write-Host "   http://localhost:8000/health     (Bastion gateway)"
Write-Host "-------------------------------------------------------------"
Write-Host ""
Write-Host " To stop everything: close the service windows (Ctrl+C in each)."
Write-Host " To re-run anytime:  .\run.ps1   (idempotent)"
Write-Host ""
