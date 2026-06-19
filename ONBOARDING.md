# New Developer Onboarding Guide

Welcome to the VR Robotics LMS! This guide will get you productive in ~2 hours.

---

## Phase 1: Setup (30 minutes)

### 1.1 Clone & Install

```bash
git clone <repo-url>
cd VR_LMS_MISSION

# Copy credentials from existing deployment or set up new Supabase project
cp credentials.env .env

# Install root dependencies
npm install
```

### 1.2 Start All Services

**Windows:**
```powershell
.\run.ps1
```

**Mac/Linux:**
```bash
cd backend/admin-service && npm run dev &
cd backend/auth-service && npm run dev &
cd backend/Bastion-server && npm run dev &
cd backend/assessment-service && npm run dev &
cd frontend && npm run dev
```

### 1.3 Verify Everything Works

Open http://localhost:5173 (or 8080 depending on your configuration)

- [ ] Frontend loads
- [ ] Login page appears
- [ ] Health endpoints respond:
  - http://localhost:8001/health (auth-service)
  - http://localhost:5000/api/health (admin-service)
  - http://localhost:8000/health (Bastion gateway)

---

## Phase 2: Understand the Architecture (45 minutes)

### Read These Files (In This Order)

1. **CLAUDE.md** — Overview of stack, quick commands, structure
2. **DEVELOPER_GUIDE.md** — Detailed architecture, endpoints, database models
3. **PRODUCTION_PATTERNS.md** — Best practices for writing code
4. **DATABASE.md** — Schema and relationships (skim)

### Key Concepts to Understand

- **Multi-Service**: 4 backend services + 1 frontend (loosely coupled via HTTP APIs)
- **Monolithic Database**: All services share Supabase PostgreSQL (different schemas)
- **JWT Auth**: Every request includes a Bearer token; server verifies with `SUPABASE_JWT_SECRET`
- **Role-Based Access**: `admin`, `teacher`, `student`, `root_admin` roles
- **Teacher Delegation**: Admin assigns courses to teachers; teachers unlock lessons
- **Leaderboard**: Per-course + overall student rankings (cached)
- **Payments**: Razorpay integration (optional; endpoint returns 503 if not configured)

---

## Phase 3: Make Your First Contribution (45 minutes)

### Task: Add a New "Announce Message" Feature

Create an endpoint to let teachers post announcements to their batches.

**Endpoint Goal:**
```
POST /api/announcements
Body: { batch_id, title, message }
Response: { success: true, announcement_id }

GET /api/announcements?batch_id=123
Response: { success: true, data: [...] }
```

### Step 1: Define the Database Model

Create `backend/admin-service/src/models/Announcement.js`:

```javascript
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Announcement = sequelize.define('Announcement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    batch_id: { type: DataTypes.INTEGER, allowNull: false },
    teacher_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'announcements',
    timestamps: false,
  });

  Announcement.associate = (models) => {
    Announcement.belongsTo(models.Batch, { foreignKey: 'batch_id' });
    Announcement.belongsTo(models.User, { foreignKey: 'teacher_id' });
  };

  return Announcement;
};
```

Register in `src/models/index.js`:
```javascript
const Announcement = require('./Announcement')(sequelize);
models.Announcement = Announcement;
```

### Step 2: Create the Route with Validation

Create `backend/admin-service/src/routes/announcement.routes.js`:

```javascript
const { Router } = require('express');
const { validateBody, validateQuery, schemas } = require('../lib/validators');
const { teacherOnly, auth } = require('../middlewares/auth');
const controller = require('../controllers/AnnouncementController');

const router = Router();

// Create announcement (teacher only)
router.post(
  '/',
  auth,
  teacherOnly,
  validateBody(schemas.createAnnouncement),
  controller.create
);

// List announcements for batch
router.get(
  '/',
  auth,
  validateQuery(joi.object({ batch_id: joi.number().integer().positive().required() })),
  controller.list
);

module.exports = router;
```

### Step 3: Add Validation Schemas

In `backend/admin-service/src/lib/validators.js`, add:

```javascript
schemas.createAnnouncement = joi.object({
  batch_id: fields.id,
  title: fields.string(5, 200).required(),
  message: fields.string(10, 2000).required(),
});
```

### Step 4: Create the Controller

Create `backend/admin-service/src/controllers/AnnouncementController.js`:

```javascript
const { Announcement, Batch, TeachingAssignment } = require('../models');
const { logger, auditLog } = require('../lib/logger');

/**
 * Create a new announcement
 * @param {Object} req - Express request
 * @param {Object} req.authUser - Verified user from JWT
 * @param {Object} req.validatedBody - Validated { batch_id, title, message }
 * @param {Object} res - Express response
 */
async function create(req, res) {
  try {
    const { batch_id, title, message } = req.validatedBody;
    const teacher_id = req.authUser.userId;

    // Verify teacher owns this batch
    const assignment = await TeachingAssignment.findOne({
      where: { batch_id, teacher_id },
    });
    if (!assignment) {
      return res.status(403).json({ error: 'Not assigned to this batch' });
    }

    // Create announcement
    const announcement = await Announcement.create({
      batch_id,
      teacher_id,
      title,
      message,
    });

    auditLog('ANNOUNCEMENT_CREATED', {
      announcement_id: announcement.id,
      batch_id,
    }, teacher_id);

    logger.info('Announcement created', {
      announcement_id: announcement.id,
      teacher_id,
      batch_id,
    });

    res.status(201).json({
      success: true,
      announcement_id: announcement.id,
    });
  } catch (error) {
    logger.error('Failed to create announcement', {
      batch_id: req.body.batch_id,
      teacher_id: req.authUser.userId,
    }, error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
}

/**
 * List announcements for a batch
 */
async function list(req, res) {
  try {
    const { batch_id } = req.validatedQuery;
    const userId = req.authUser.userId;

    // Verify user is enrolled in or teaches this batch
    const isTeacher = await TeachingAssignment.findOne({
      where: { batch_id, teacher_id: userId },
    });
    const isStudent = await Enrollment.findOne({
      where: { batch_id, student_id: userId },
    });

    if (!isTeacher && !isStudent) {
      return res.status(403).json({ error: 'Not enrolled in this batch' });
    }

    const announcements = await Announcement.findAll({
      where: { batch_id },
      order: [['created_at', 'DESC']],
      include: ['User'],
    });

    res.json({
      success: true,
      data: announcements,
    });
  } catch (error) {
    logger.error('Failed to list announcements', {
      batch_id: req.query.batch_id,
    }, error);
    res.status(500).json({ error: 'Failed to load announcements' });
  }
}

module.exports = { create, list };
```

### Step 5: Register the Route

In `backend/admin-service/src/server.js`, add:

```javascript
const announcementRoutes = require('./routes/announcement.routes');
app.use('/api/announcements', announcementRoutes);
```

### Step 6: Create a Database Migration

In `supabase/migrations/99_announcements.sql`:

```sql
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_announcements_batch_id ON announcements(batch_id);
CREATE INDEX idx_announcements_teacher_id ON announcements(teacher_id);
```

### Step 7: Test It

```bash
# Restart backend
.\restart.ps1

# Create announcement (need valid JWT from login)
curl -X POST http://localhost:5000/api/announcements \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "batch_id": 1, "title": "Test", "message": "Hello" }'

# List announcements
curl http://localhost:5000/api/announcements?batch_id=1 \
  -H "Authorization: Bearer <TOKEN>"
```

### Step 8: Document It

Update **CLAUDE.md** section "Important Patterns & Features" with:

```markdown
### Announcements
- Teachers post announcements to batches they teach
- Students see announcements for enrolled batches
- Data: `announcements` table
- API: `POST /api/announcements`, `GET /api/announcements?batch_id=X`
```

---

## Phase 4: Common Tasks (Bookmark These)

### Run Frontend Only
```bash
cd frontend && npm run dev
```

### Run a Specific Backend Service
```bash
cd backend/admin-service && npm run dev
```

### Run Tests
```bash
cd backend/admin-service && npm test
```

### Check API Health
```bash
curl http://localhost:8001/health     # auth-service
curl http://localhost:5000/api/health # admin-service
curl http://localhost:8000/health     # Bastion
```

### Debug Database
- Open Supabase dashboard
- Go to SQL Editor or Table Editor
- Query directly or use VS Code with Supabase extension

### Check Logs
- Look at PowerShell windows running each service
- Logs are JSON-formatted (request_id, user_id, etc.)
- Errors sent to Sentry (check Sentry dashboard in production)

### Add Another Endpoint
1. Copy a similar controller (e.g., `AnnouncementController.js`)
2. Add validation schema to `validators.js`
3. Create routes file
4. Register in `server.js`
5. Write tests (optional but recommended)

---

## Phase 5: Important Patterns to Know

### Authentication
- Every protected route needs `auth` middleware
- `req.authUser.userId`, `.email`, `.role` available after
- Admin routes add `adminOnly` middleware
- Teacher routes add `teacherOnly` middleware

### Validation
- ALWAYS validate user input with `validateBody(schemas.xxx)`
- Add schemas to `validators.js`
- Joi ensures type safety at API boundary

### Logging
- Use `logger.info()`, `logger.error()` for structured logs
- Use `auditLog()` for sensitive operations (payments, role changes)
- Logs include `requestId` for tracing across services

### Database
- All queries filtered by user ID (unless admin)
- Use transactions for multi-table updates
- Models use Sequelize ORM

### Frontend
- API calls go to `http://localhost:5000` (admin-service)
- Or `http://localhost:8000` (Bastion gateway for routes to other services)
- Use React Query for caching/refetching
- shadcn/ui for pre-built components

---

## Troubleshooting

### "Cannot connect to localhost:5173"
- Wait 10 seconds for Vite to compile
- Check frontend PowerShell window for errors
- Try: `cd frontend && npm run dev`

### "401 Unauthorized"
- Your JWT token expired (>1 hour)
- Log in again to get a new token
- Check DevTools > Application > localStorage for token

### "Database connection refused"
- Verify `DATABASE_URL` in `.env`
- Check Supabase dashboard for connection status
- Try: `psql $DATABASE_URL` to test connection

### "Validation failed"
- Check the error response `details` array for which field failed
- Review the schema in `validators.js`
- Make sure your JSON is properly formatted

### "Module not found"
- Run: `npm install` in the service directory
- Check imports use correct paths (e.g., `../lib/logger` not `../../lib/logger`)

---

## What's Next?

- [ ] Read PRODUCTION_PATTERNS.md for best practices
- [ ] Read DEVELOPER_GUIDE.md for API design
- [ ] Create your first endpoint (follow the Announcement example above)
- [ ] Write tests for your endpoint
- [ ] Deploy to staging (see PRODUCTION_DEPLOYMENT_GUIDE.md)

---

## Questions?

1. Check **DEVELOPER_GUIDE.md** (architecture, endpoints, security)
2. Check **PRODUCTION_PATTERNS.md** (how to write code)
3. Look at similar controllers for patterns
4. Check git history: `git log --oneline -10`
5. Ask in Slack/Discord

---

**You're ready! Start with the Announcement example above, then move to your real task.**
