# Developer Quick Reference Card

**Print this. Bookmark this. Reference daily.**

---

## 🚀 Getting Started (First Time)

```powershell
git clone <repo>
cd VR_LMS_MISSION
cp credentials.env .env
.\run.ps1
```

Open: http://localhost:5173 (frontend) or http://localhost:8080

**First Read**: ONBOARDING.md (30 mins)

---

## 📋 Before Writing Any Code

Read: **PRODUCTION_PATTERNS.md** § [Your Task]
- **Adding endpoint?** → § Checklist for New Endpoints
- **Validating input?** → § Input Validation
- **Logging errors?** → § Error Handling & Logging
- **Auth check?** → § Authentication & Authorization

---

## 🔧 Common Commands

| Task | Command |
|------|---------|
| Start all services | `.\run.ps1` |
| Quick restart | `.\restart.ps1` |
| Start only frontend | `cd frontend && npm run dev` |
| Start only admin-service | `cd backend/admin-service && npm run dev` |
| Run tests | `cd backend/admin-service && npm test` |
| Lint frontend | `cd frontend && npm run lint` |
| Seed admin accounts | `cd backend/admin-service && npm run seed:admin` |

---

## ✅ Adding a New Endpoint (Checklist)

When creating `POST /api/announcements`:

### 1. Validation Schema
```javascript
// src/lib/validators.js
schemas.createAnnouncement = joi.object({
  batch_id: fields.id,
  title: fields.string(5, 200).required(),
  message: fields.string(10, 2000).required(),
});
```

### 2. Route with Middleware
```javascript
// src/routes/announcement.routes.js
const { validateBody } = require('../lib/validators');
router.post('/', auth, teacherOnly, validateBody(schemas.createAnnouncement), ctrl.create);
```

### 3. Controller with Logging
```javascript
// src/controllers/AnnouncementController.js
const { logger, auditLog } = require('../lib/logger');

async function create(req, res) {
  try {
    const { batch_id, title, message } = req.validatedBody;
    const announcement = await Announcement.create({...});
    auditLog('ANNOUNCEMENT_CREATED', { announcement_id: announcement.id }, req.authUser.userId);
    res.json({ success: true, announcement_id: announcement.id });
  } catch (error) {
    logger.error('Failed to create announcement', { batch_id }, error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
}
```

### 4. Register Route
```javascript
// src/server.js
const announcementRoutes = require('./routes/announcement.routes');
app.use('/api/announcements', announcementRoutes);
```

### 5. Add JSDoc Comments
```javascript
/**
 * Create a new announcement
 * @param {Object} req - Request with verified user in req.authUser
 * @param {Object} req.validatedBody - { batch_id, title, message }
 * @returns {Object} { success: true, announcement_id }
 */
```

### 6. Write Tests (Optional)
```javascript
// tests/announcement.test.js
it('creates announcement for teacher batch', async () => {
  const res = await request(app)
    .post('/api/announcements')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ batch_id: 1, title: 'Test', message: 'Hello' })
    .expect(201);
  expect(res.body.success).toBe(true);
});

it('blocks non-teacher', async () => {
  const res = await request(app)
    .post('/api/announcements')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ batch_id: 1, title: 'Test', message: 'Hello' })
    .expect(403);
});
```

---

## 🔐 Security Checklist

Before committing ANY code:

- [ ] **No hardcoded secrets** — Use env vars
- [ ] **User identity from JWT** — Use `req.authUser.userId`, NOT from body
- [ ] **Role check middleware** — `auth`, `adminOnly`, `teacherOnly`
- [ ] **Input validation** — `validateBody(schema)` on all user input
- [ ] **Query filtering** — All queries filter by user: `where: { user_id: req.authUser.userId }`
- [ ] **Error logging** — `logger.error()` with context
- [ ] **Sensitive ops logged** — `auditLog()` for payments, role changes, deletes
- [ ] **No console.log** — Use `logger.info/warn/error()`
- [ ] **HTTPS only in prod** — Frontend uses https:// in production
- [ ] **CORS configured** — Set `ADMIN_ALLOWED_ORIGINS` in prod

---

## 📊 Logging Examples

### Info Log
```javascript
logger.info('User enrolled in course', { course_id: 123 });
// Output: { timestamp, level: 'INFO', message, course_id, requestId, userId, ... }
```

### Error Log with Context
```javascript
logger.error('Payment failed', { order_id: 123, amount: 1000 }, error);
// Includes stack trace + sends to Sentry
```

### Audit Log (Sensitive Operation)
```javascript
auditLog('PAYMENT_CAPTURED', { order_id: 123, amount: 1000 }, req.authUser.userId);
// Logged for compliance; should also persist to audit_logs table
```

---

## 🧪 Testing Your Endpoint

### With cURL
```bash
# Get JWT token first (log in via frontend)
TOKEN="eyJ..."

# Test POST
curl -X POST http://localhost:5000/api/announcements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "batch_id": 1, "title": "Test", "message": "Hello" }'

# Test GET
curl http://localhost:5000/api/announcements?batch_id=1 \
  -H "Authorization: Bearer $TOKEN"
```

### With Postman
1. Create new POST request
2. URL: `http://localhost:5000/api/announcements`
3. Header: `Authorization: Bearer <TOKEN>`
4. Body (JSON): `{ "batch_id": 1, "title": "Test", "message": "Hello" }`

---

## 🐛 Debugging

| Problem | Solution |
|---------|----------|
| 400 Bad Request | Check validation error in response `details` array |
| 401 Unauthorized | Verify JWT token in header; check `localStorage` in DevTools |
| 403 Forbidden | Check user role; teacher requires `teacherOnly` middleware |
| 500 Server Error | Check logs in PowerShell window; search Sentry |
| Can't connect | Check service is running; verify port number |

---

## 📚 Documentation Files

| File | When to Read |
|------|--------------|
| **ONBOARDING.md** | New to team (30 mins) |
| **PRODUCTION_PATTERNS.md** | Before writing code (reference) |
| **CLAUDE.md** | Quick commands + structure |
| **DEVELOPER_GUIDE.md** | Deep dive into architecture |
| **PRODUCTION_READINESS.md** | Understand what's been improved |

---

## 🎯 Architecture at a Glance

```
Browser
  ↓
Frontend (React, port 5173)
  ↓
Bastion Gateway (port 8000, reverse proxy)
  ↓
Admin Service (port 5000, main API)
  ↓
PostgreSQL (Supabase)
```

**4 Backend Services** (all connect to same DB):
- `admin-service` (port 5000) — Main API
- `auth-service` (port 8001) — JWT verification
- `assessment-service` (port 8003) — Quizzes/assessments
- `Bastion-server` (port 8000) — Gateway/routing

---

## 🚁 Services Health

```bash
# Check all services
curl http://localhost:8001/health      # auth-service ✓
curl http://localhost:5000/api/health  # admin-service ✓
curl http://localhost:8000/health      # Bastion ✓
```

---

## 💡 Pro Tips

1. **Use `req.validatedBody`** — Input is already validated & sanitized
2. **Always log errors** — With context for debugging
3. **Filter queries by user** — Prevents data leaks
4. **Add JSDoc** — IDE autocomplete + generated docs
5. **Write tests** — Especially for auth & payments
6. **Read PRODUCTION_PATTERNS.md** — Before every new endpoint
7. **Commit often** — Small, focused commits
8. **Run tests before push** — `npm test`

---

## 📞 Getting Help

1. **Endpoint questions** → See PRODUCTION_PATTERNS.md
2. **Architecture questions** → See DEVELOPER_GUIDE.md
3. **Setup issues** → See ONBOARDING.md
4. **Code examples** → Check similar controller
5. **Still stuck?** → Check git history: `git log --oneline -20`

---

**Last Updated**: 2026-06-18  
**For**: All VR Robotics LMS Developers  
**Laminate or Bookmark This File!**
