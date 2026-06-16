# 👨‍💻 **DEVELOPER GUIDE - VR Robotics LMS**

**For**: Future developers maintaining and extending this codebase  
**Updated**: 2026-06-16  
**Status**: Production-Ready

---

## **🗂️ REPOSITORY STRUCTURE**

```
VR_LMS_MISSION/
├── backend/
│   ├── admin-service/              # Main API (Node.js + Express + Sequelize)
│   │   ├── src/
│   │   │   ├── models/             # Sequelize models (67 total)
│   │   │   ├── controllers/        # API logic
│   │   │   ├── services/           # Business logic
│   │   │   ├── routes/             # API endpoints
│   │   │   ├── middlewares/        # Auth, error handling
│   │   │   ├── config/             # Database, cache config
│   │   │   └── server.js           # Express app
│   │   ├── .env                    # Production config
│   │   └── package.json
│   └── [other services...]
├── frontend/
│   ├── src/
│   │   ├── pages/                  # Route components
│   │   │   └── student/            # Student dashboard
│   │   ├── components/             # Reusable components
│   │   ├── api/                    # API wrappers
│   │   ├── styles/                 # CSS
│   │   └── main.tsx                # App entry
│   ├── .env                        # Production config
│   └── package.json
├── Documentation/
│   ├── STUDENT_DASHBOARD_GUIDE.md  # User guide
│   ├── CRITICAL_FIXES_APPLIED.md   # What was fixed
│   ├── PRODUCTION_DEPLOYMENT_GUIDE.md # How to deploy
│   ├── DEVELOPER_GUIDE.md          # This file
│   ├── TEST_PLAN.md                # Test cases
│   └── FINAL_STATUS_REPORT.md      # Status summary
└── git commits (detailed history)
```

---

## **🔧 LOCAL SETUP**

### **Prerequisites**
- Node.js 18+
- Git
- PostgreSQL (or Supabase account)
- Redis (optional, for caching)

### **Backend Setup**
```bash
cd backend/admin-service
npm install
cp .env.example .env  # Update with your Supabase credentials
npm start
# Runs on http://localhost:5000
```

### **Frontend Setup**
```bash
cd frontend
npm install
# Update .env with VITE_ADMIN_API_URL=http://localhost:5000
npm run dev
# Runs on http://localhost:8080
```

### **Environment Variables**

**Backend (.env)**:
- `DATABASE_URL`: Supabase PostgreSQL connection string
- `SUPABASE_JWT_SECRET`: JWT verification key
- `REDIS_URL`: For caching (optional)
- `SMTP_*`: Email configuration
- `R2_*`: Cloudflare R2 for assets
- `BUNNY_STREAM_*`: Video streaming

**Frontend (.env)**:
- `VITE_ADMIN_API_URL`: Backend URL
- `VITE_BASTION_API_URL`: Gateway URL
- `VITE_SUPABASE_*`: Supabase credentials
- `VITE_RAZORPAY_KEY_ID`: Payment integration

---

## **🏗️ ARCHITECTURE**

### **Backend Stack**
- **Framework**: Express.js
- **ORM**: Sequelize
- **Database**: PostgreSQL (Supabase)
- **Cache**: Redis (Upstash)
- **Auth**: Supabase JWT
- **Storage**: Cloudflare R2
- **CDN**: Bunny Stream
- **Monitoring**: Sentry

### **Frontend Stack**
- **Framework**: React 18
- **Build**: Vite
- **UI**: Tailwind CSS + shadcn/ui
- **State**: React Query + React Router
- **HTTP**: Axios
- **Auth**: Supabase Client

---

## **📡 API ENDPOINTS**

### **Student Endpoints** (`/api/public`)

**Batches & Courses**:
```
GET /api/public/batches/my          → Student's enrolled batches
GET /api/public/courses/my          → Student's enrolled courses
```

**Assignments**:
```
GET /api/public/my-assignments      → List assignments for student
POST /api/public/assignments/:id/submit → Submit assignment
GET /api/public/assignments/:id/submission → Get submission details
```

**Notifications**:
```
GET /api/public/notifications       → List notifications
GET /api/public/notifications/unread → Get unread count
PATCH /api/public/notifications/:id/read → Mark as read
```

**Profile**:
```
GET /api/public/profile             → Get user profile
PATCH /api/public/profile           → Update profile
```

### **Admin Endpoints** (`/api/admin`)

**Assignments**:
```
POST /api/admin/assignments         → Create assignment
GET /api/admin/batches/:id/assignments → List batch assignments
GET /api/admin/assignments/:id/submissions → Get submissions
PATCH /api/admin/submissions/:id/grade → Grade submission
```

---

## **🔐 SECURITY**

### **Authentication**
- JWT verification via Supabase
- `req.authUser?.userId` extracts verified identity
- Never trust `x-user-id` header alone

### **Authorization**
- `adminOnly` middleware for admin routes
- `requireStudent` middleware for protected student routes
- Teacher ownership checks on grading
- Batch membership verification on submissions

### **Key Fixes to Remember**
- ✅ Student ID is extracted from BatchMember (not request body)
- ✅ Teacher can only grade own assignment submissions
- ✅ Students see only their enrolled batches/courses
- ✅ All queries are filtered by user_id

---

## **📝 COMMON TASKS**

### **Adding a New Endpoint**

1. **Create Controller Method**
```javascript
// controllers/MyController.js
async myHandler(req, res) {
  const userId = req.authUser?.userId;  // Verify auth
  // ... logic ...
  res.json({ success: true, data: result });
}
```

2. **Create Route**
```javascript
// routes/my.routes.js
router.get('/endpoint', ctrl.myHandler);
module.exports = router;
```

3. **Register Route in server.js**
```javascript
const myRoutes = require('./routes/my.routes');
app.use('/api/public', ...requireStudent, myRoutes);
```

### **Adding a New Model**

1. **Create Model File**
```javascript
// models/MyModel.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MyModel = sequelize.define('MyModel', {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    // ... fields ...
  }, {
    tableName: 'my_models',
    timestamps: false
  });

  MyModel.associate = (models) => {
    // Associations here
  };

  return MyModel;
};
```

2. **Import in models/index.js**
```javascript
const MyModel = require('./MyModel')(sequelize);
```

### **Debugging API Issues**

1. Check logs: `railway logs -f`
2. Verify JWT token: Use jwt.io to decode
3. Check database: Use Supabase dashboard
4. Test endpoint: `curl -H "Authorization: Bearer TOKEN" http://localhost:5000/api/endpoint`
5. Check Sentry for errors

---

## **🧪 TESTING**

### **Run Tests**
```bash
# Backend tests
npm test

# Frontend tests
npm run test:ui
```

### **Manual Testing Checklist**
- See TEST_PLAN.md for comprehensive test cases

### **Common Test Scenarios**
1. Student submits assignment → Check database
2. Teacher grades → Verify notification created
3. Profile update → Check database
4. Notification read → Verify UI update

---

## **🚀 DEPLOYMENT**

### **To Railway**
1. Install Railway CLI: `npm install -g railway`
2. Login: `railway login`
3. Deploy: See PRODUCTION_DEPLOYMENT_GUIDE.md

### **Environment-Specific**
- **Local**: http://localhost:5000, http://localhost:8080
- **Production**: https://vrlms-production.up.railway.app, https://vrroboticsacademy.com

---

## **📚 KEY FILES TO KNOW**

| File | Purpose |
|------|---------|
| `backend/admin-service/src/server.js` | Express app setup + route registration |
| `backend/admin-service/src/models/index.js` | Model exports + associations |
| `backend/admin-service/src/config/database.js` | Sequelize config |
| `frontend/src/pages/StudentDashboard.jsx` | Main dashboard component |
| `frontend/src/api/assignmentApi.ts` | Assignment API wrapper |
| `.env` files | Environment configuration |

---

## **🐛 KNOWN ISSUES & WORKAROUNDS**

### **Database Migrations**
The batch_id column may not exist in older tables. Sequelize will log warnings but continue operating.

**Workaround**: Run ALTER TABLE manually if needed:
```sql
ALTER TABLE batches ADD COLUMN batch_id VARCHAR(64) UNIQUE;
```

### **Email Notifications**
SMTP is not configured by default. To enable:
1. Set SMTP_* variables in .env
2. Restart backend
3. Emails will be queued and sent

### **Redis Offline**
If Redis is unavailable, caching is disabled. The app continues to work without caching.

---

## **🎯 FUTURE IMPROVEMENTS**

### **Short Term**
- [ ] Add WebSocket for real-time notifications
- [ ] Implement email notifications for assignments
- [ ] Add progress tracking for students
- [ ] Performance optimization for large datasets

### **Medium Term**
- [ ] Student analytics dashboard
- [ ] Advanced reporting tools
- [ ] Mobile app (React Native)
- [ ] API rate limiting improvements

### **Long Term**
- [ ] AI-powered personalized learning paths
- [ ] Integration with LTI standards
- [ ] Video analytics (watch time, completion)
- [ ] Advanced payment reconciliation

---

## **📞 SUPPORT**

### **Getting Help**
1. Check git commit history: `git log --oneline -20`
2. Read related .md files
3. Search Sentry for errors
4. Check Railway logs

### **Reporting Issues**
Create a GitHub issue with:
- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment (local/staging/prod)
- Relevant logs/screenshots

---

## **✅ CHECKLIST FOR NEW DEVELOPERS**

When joining the team:

- [ ] Clone the repository
- [ ] Setup backend locally
- [ ] Setup frontend locally
- [ ] Read STUDENT_DASHBOARD_GUIDE.md
- [ ] Read CRITICAL_FIXES_APPLIED.md
- [ ] Understand API structure
- [ ] Run test suite
- [ ] Get access to:
  - [ ] Railway dashboard
  - [ ] Supabase console
  - [ ] Sentry monitoring
  - [ ] GitHub repository

---

**Welcome to the team! 🎉**

For questions, refer to the documentation or reach out to the team lead.
