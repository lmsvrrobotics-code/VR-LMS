# 🚀 **PRODUCTION DEPLOYMENT GUIDE**

**Last Updated**: 2026-06-16  
**Status**: ✅ Ready for Production  
**Target**: Railway.app Production

---

## **📋 DEPLOYMENT CHECKLIST**

### **Pre-Deployment (Already Done ✅)**

- [x] All critical bugs fixed
- [x] Security verified
- [x] Tests passing
- [x] Documentation complete
- [x] .env configured for production
- [x] Git commits ready

### **Deployment Steps**

#### **Step 1: Install Railway CLI**
```bash
npm install -g railway
railway login
```

#### **Step 2: Deploy Backend (admin-service)**
```bash
cd backend/admin-service
railway link  # Select existing Railway project or create new
railway variables set NODE_ENV=production
railway up
```

✅ **Backend will deploy to**: https://vrlms-production.up.railway.app

#### **Step 3: Deploy Frontend**
```bash
cd frontend
railway link  # Select existing Railway project
railway build
railway deploy
```

✅ **Frontend will deploy automatically**

---

## **🔐 ENVIRONMENT CONFIGURATION**

### **Frontend Production .env**
```
VITE_BASTION_API_URL=https://elegant-miracle-production.up.railway.app
VITE_ADMIN_API_URL=https://vrlms-production.up.railway.app
VITE_FRONTEND_URL=https://vrroboticsacademy.com
VITE_SUPABASE_URL=https://mpqtuhgeuixsydofolwo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_BUNNY_STREAM_CDN_HOSTNAME=vz-8a0b8f61-e4d.b-cdn.net
VITE_R2_PUBLIC_URL=https://pub-35b9bf5306ea4018bb410638b90afe99.r2.dev
```

### **Backend Production .env**
```
PORT=5000
NODE_ENV=production
DATABASE_URL=postgresql://[your-supabase-url]
DB_SCHEMA=lms_admin
AUTH_DB_SCHEMA=lucy_devdb
SUPABASE_URL=https://mpqtuhgeuixsydofolwo.supabase.co
SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
SUPABASE_JWT_SECRET=[jwt-secret]
R2_ACCOUNT_ID=[cloudflare-r2-id]
R2_ACCESS_KEY_ID=[r2-access-key]
R2_SECRET_ACCESS_KEY=[r2-secret-key]
BUNNY_STREAM_LIBRARY_ID=671923
BUNNY_STREAM_API_KEY=[bunny-key]
JWT_SECRET=[jwt-secret]
REDIS_URL=rediss://[upstash-redis-url]
SENTRY_DSN=[sentry-dsn]
```

---

## **📊 PRODUCTION URLS (After Deployment)**

| Service | URL |
|---------|-----|
| Frontend | https://vrroboticsacademy.com |
| Bastion Gateway | https://elegant-miracle-production.up.railway.app |
| Admin API | https://vrlms-production.up.railway.app |
| Supabase | https://mpqtuhgeuixsydofolwo.supabase.co |
| Database | Postgres (Supabase pooler) |
| Redis Cache | Upstash Redis |
| Assets (R2) | https://pub-35b9bf5306ea4018bb410638b90afe99.r2.dev |
| Videos (Bunny) | vz-8a0b8f61-e4d.b-cdn.net |

---

## **🔍 POST-DEPLOYMENT VERIFICATION**

### **1. Check Backend Health**
```bash
curl https://vrlms-production.up.railway.app/health
# Expected: { "ok": true, "service": "admin-service" }

curl https://vrlms-production.up.railway.app/health/deep
# Expected: { "ok": true, "db": "ok", "cache": "enabled" }
```

### **2. Check Frontend Loading**
```bash
curl https://vrroboticsacademy.com
# Expected: HTML with Vite bundle loaded
```

### **3. Test API Endpoints**
```bash
# Get profile (requires valid JWT)
curl -H "Authorization: Bearer YOUR_JWT" \
  https://vrlms-production.up.railway.app/api/public/profile

# Get batches
curl -H "Authorization: Bearer YOUR_JWT" \
  https://vrlms-production.up.railway.app/api/public/batches/my
```

### **4. Monitor Logs**
```bash
railway logs  # Real-time backend logs
railway status # Service status
```

---

## **🛡️ SECURITY CHECKLIST**

Before going live:

- [ ] JWT secrets configured in Railway
- [ ] Database credentials secure
- [ ] R2 and Bunny API keys set
- [ ] CORS configured correctly
- [ ] HTTPS enforced
- [ ] Rate limiting enabled
- [ ] Monitoring/alerts set up
- [ ] Backup configured
- [ ] SSL certificates valid
- [ ] Firewall rules correct

---

## **⚠️ MONITORING & ALERTS**

### **Set Up Alerts For:**
- [ ] Backend uptime (Health checks)
- [ ] Database connection failures
- [ ] High error rate (5xx errors)
- [ ] API latency spike
- [ ] Redis connection issues
- [ ] Disk space warnings
- [ ] Memory usage warnings
- [ ] CPU usage warnings

### **Monitor Via:**
- Railway Dashboard
- Sentry (error tracking)
- Grafana (metrics)
- UptimeRobot (uptime monitoring)

---

## **🔄 ROLLBACK PROCEDURE**

If deployment fails:

```bash
# Revert to previous version
railway rollback <deployment-id>

# Or redeploy previous branch
git checkout previous-commit
railway up
```

---

## **📈 SCALING & PERFORMANCE**

### **After First Deployment:**
1. Monitor real user traffic
2. Check database query performance
3. Optimize slow endpoints
4. Scale Redis if needed
5. Configure CDN caching
6. Enable compression

### **Production Optimization:**
```bash
# Enable compression
# Enable caching headers
# Optimize bundle size
# Setup Redis for session storage
# Configure replication for DB
```

---

## **📞 SUPPORT & TROUBLESHOOTING**

### **Backend Not Connecting**
1. Check Railway status
2. Verify DATABASE_URL
3. Check Supabase connection
4. Review logs: `railway logs -f`

### **Frontend Not Loading**
1. Check Vite build: `npm run build`
2. Verify API URLs in .env
3. Check CORS headers
4. Review browser console

### **API Endpoints Not Working**
1. Check JWT token validity
2. Verify Bearer token format
3. Check API route registration
4. Review Sentry errors

### **Database Issues**
1. Check Supabase dashboard
2. Verify schema exists
3. Check query performance
4. Review slow logs

---

## **🎯 SUCCESS CRITERIA**

Production is ready when:

✅ Backend running on vrlms-production  
✅ Frontend running on vrroboticsacademy.com  
✅ All APIs responding  
✅ Database connected  
✅ Authentication working  
✅ Notifications flowing  
✅ Files uploading to R2  
✅ Videos streaming from Bunny  
✅ Cache working (Redis)  
✅ Monitoring in place  

---

## **🚀 DEPLOYMENT COMMAND SUMMARY**

```bash
# Backend
cd backend/admin-service
railway login
railway link
railway variables set NODE_ENV=production
railway up

# Frontend  
cd frontend
railway link
railway build
railway deploy

# Verify
curl https://vrlms-production.up.railway.app/health
open https://vrroboticsacademy.com
```

---

**After deployment, all users can access:**
- ✅ Student Dashboard at https://vrroboticsacademy.com
- ✅ APIs at https://vrlms-production.up.railway.app
- ✅ All features (assignments, batches, notifications, etc.)

**Status**: 🟢 **READY TO DEPLOY**

