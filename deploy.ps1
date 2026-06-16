# 🚀 VR Robotics LMS - One-Click Production Deployment to Railway
# PowerShell version for Windows
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message, [string]$Type = "Info")

    $colors = @{
        "Success" = "Green"
        "Error" = "Red"
        "Warning" = "Yellow"
        "Info" = "Cyan"
    }

    Write-Host $Message -ForegroundColor $colors[$Type]
}

Write-Host ""
Write-Host "🚀 VR Robotics LMS - Production Deployment to Railway" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

$missingTools = @()

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    $missingTools += "Railway CLI (install with: npm install -g railway)"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    $missingTools += "Git"
}

if ($missingTools.Count -gt 0) {
    Write-Status "❌ Missing tools:" "Error"
    foreach ($tool in $missingTools) {
        Write-Host "   - $tool"
    }
    exit 1
}

Write-Status "✅ Prerequisites OK" "Success"
Write-Host ""

# Get project root
$PROJECT_ROOT = Get-Location
Write-Host "📁 Project root: $PROJECT_ROOT" -ForegroundColor Gray

# Step 1: Sync credentials
Write-Host "📦 Step 1: Syncing credentials from master file..." -ForegroundColor Yellow
node sync-credentials.js
Write-Status "✅ Credentials synced" "Success"
Write-Host ""

# Step 2: Deploy Backend
Write-Host "🔧 Step 2: Deploying Backend (admin-service)..." -ForegroundColor Yellow
Push-Location "$PROJECT_ROOT/backend/admin-service"

Write-Host "   - Logging into Railway..." -ForegroundColor Gray
railway login --browserless 2>$null
Write-Host "   - Linking to Railway project..." -ForegroundColor Gray
railway link --browserless 2>$null
Write-Host "   - Setting environment..." -ForegroundColor Gray
railway variables set NODE_ENV=production
Write-Host "   - Uploading to Railway..." -ForegroundColor Gray
railway up

Write-Status "✅ Backend deployed" "Success"
Write-Host "📍 Backend URL: https://vrlms-production.up.railway.app" -ForegroundColor Green

Pop-Location
Write-Host ""

# Step 3: Deploy Frontend
Write-Host "🎨 Step 3: Deploying Frontend..." -ForegroundColor Yellow
Push-Location "$PROJECT_ROOT/frontend"

Write-Host "   - Linking to Railway project..." -ForegroundColor Gray
railway link --browserless 2>$null
Write-Host "   - Building frontend..." -ForegroundColor Gray
railway build
Write-Host "   - Deploying to Railway..." -ForegroundColor Gray
railway deploy

Write-Status "✅ Frontend deployed" "Success"
Write-Host "📍 Frontend URL: https://vrroboticsacademy.com" -ForegroundColor Green

Pop-Location
Write-Host ""

# Step 4: Verify Deployment
Write-Host "🔍 Step 4: Verifying deployment..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$BACKEND_URL = "https://vrlms-production.up.railway.app"
Write-Host "   - Testing backend health at $BACKEND_URL/health" -ForegroundColor Gray

try {
    $response = Invoke-WebRequest -Uri "$BACKEND_URL/health" -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        Write-Status "✅ Backend is responding" "Success"
    }
} catch {
    Write-Status "⚠️  Backend not responding yet (may take a minute to start)" "Warning"
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "🎉 DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Your production system is live:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend  → https://vrroboticsacademy.com" -ForegroundColor Green
Write-Host "  Backend   → https://vrlms-production.up.railway.app" -ForegroundColor Green
Write-Host "  Database  → Supabase (mpqtuhgeuixsydofolwo)" -ForegroundColor Green
Write-Host "  Cache     → Upstash Redis" -ForegroundColor Green
Write-Host ""
Write-Host "🔍 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Visit https://vrroboticsacademy.com in your browser" -ForegroundColor Gray
Write-Host "  2. Login with your credentials" -ForegroundColor Gray
Write-Host "  3. Test the complete workflow:" -ForegroundColor Gray
Write-Host "     - Student dashboard" -ForegroundColor Gray
Write-Host "     - Create an assignment" -ForegroundColor Gray
Write-Host "     - Submit and grade" -ForegroundColor Gray
Write-Host "  4. Monitor logs: railway logs -f" -ForegroundColor Gray
Write-Host ""
Write-Status "Deployment successful! 🚀" "Success"
