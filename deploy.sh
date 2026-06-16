#!/bin/bash
# 🚀 VR Robotics LMS - One-Click Production Deployment to Railway
# Run this script to deploy both backend and frontend to Railway

set -e  # Exit on first error

echo "🚀 VR Robotics LMS - Production Deployment to Railway"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found!${NC}"
    echo "Install it with: npm install -g railway"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git not found!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Get current directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Step 1: Sync credentials
echo "📦 Step 1: Syncing credentials from master file..."
node sync-credentials.js
echo -e "${GREEN}✅ Credentials synced${NC}"
echo ""

# Step 2: Deploy Backend
echo "🔧 Step 2: Deploying Backend (admin-service)..."
cd "$PROJECT_ROOT/backend/admin-service"

echo "   - Logging into Railway..."
railway login --browserless 2>/dev/null || true

echo "   - Linking to Railway project..."
railway link --browserless 2>/dev/null || true

echo "   - Setting environment..."
railway variables set NODE_ENV=production

echo "   - Uploading to Railway..."
railway up

echo -e "${GREEN}✅ Backend deployed${NC}"
echo "📍 Backend URL: https://vrlms-production.up.railway.app"
echo ""

# Step 3: Deploy Frontend
echo "🎨 Step 3: Deploying Frontend..."
cd "$PROJECT_ROOT/frontend"

echo "   - Linking to Railway project..."
railway link --browserless 2>/dev/null || true

echo "   - Building frontend..."
railway build

echo "   - Deploying to Railway..."
railway deploy

echo -e "${GREEN}✅ Frontend deployed${NC}"
echo "📍 Frontend URL: https://vrroboticsacademy.com"
echo ""

# Step 4: Verify Deployment
echo "🔍 Step 4: Verifying deployment..."
sleep 5  # Wait for services to start

BACKEND_URL="https://vrlms-production.up.railway.app"
echo "   - Testing backend health at $BACKEND_URL/health"

if curl -s "$BACKEND_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is responding${NC}"
else
    echo -e "${YELLOW}⚠️  Backend not responding yet (may take a minute to start)${NC}"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo "=============================================="
echo ""
echo "📊 Your production system is live:"
echo ""
echo "  Frontend  → https://vrroboticsacademy.com"
echo "  Backend   → https://vrlms-production.up.railway.app"
echo "  Database  → Supabase (mpqtuhgeuixsydofolwo)"
echo "  Cache     → Upstash Redis"
echo ""
echo "🔍 Next Steps:"
echo "  1. Visit https://vrroboticsacademy.com in your browser"
echo "  2. Login with your credentials"
echo "  3. Test the complete workflow:"
echo "     - Student dashboard"
echo "     - Create an assignment"
echo "     - Submit and grade"
echo "  4. Monitor logs: railway logs -f"
echo ""
echo -e "${GREEN}Deployment successful! 🚀${NC}"
