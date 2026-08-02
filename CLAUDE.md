# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

### Run Everything Locally (Windows)
```powershell
.\run.ps1
```
This idempotent script installs dependencies, applies database migrations, seeds admin accounts, and launches all services in separate windows. Opens http://localhost:5173 in the browser when ready. Default login credentials are displayed at the end.

### Quick Restart (Fast)
```powershell
.\restart.ps1
```
Kills all node processes and relaunches services that have `node_modules` installed. Skips install/migrate/seed (faster than `run.ps1`).

### Service-Specific Dev Commands
- **Admin Service**: `cd backend/admin-service && npm run dev` (port 5000)
- **Auth Service**: `cd backend/auth-service && npm run dev` (port 8001)
- **Assessment Service**: `cd backend/assessment-service && npm run dev` (port 8003)
- **Bastion Gateway**: `cd backend/Bastion-server && npm run dev` (port 8000)
- **Frontend**: `cd frontend && npm run dev` (port 5173)

### Build & Test
```bash
# Frontend build
cd frontend && npm run build

# Backend tests
cd backend/admin-service && npm test

# Teaching flow E2E test
cd backend/admin-service && npm run test:teaching-e2e

# Seed admin accounts (idempotent)
cd backend/admin-service && npm run seed:admin
```

### Lint
```bash
cd frontend && npm run lint
```

---

## 🚀 For New Developers: Start Here

**Just joined the team?** Follow these in order:

1. **[ONBOARDING.md](./ONBOARDING.md)** — 2-hour setup + first feature (READ THIS FIRST)
2. **[PRODUCTION_PATTERNS.md](./PRODUCTION_PATTERNS.md)** — How to write code safely and correctly
3. **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** — Architecture deep-dive and API reference
4. **This file (CLAUDE.md)** — Quick reference for commands and structure

**Key Files:**
- Input validation: `backend/admin-service/src/lib/validators.js`
- Logging & correlation IDs: `backend/admin-service/src/lib/logger.js`
- Auth middleware: `backend/admin-service/src/middlewares/auth.js`
- Environment validation: `backend/admin-service/src/config/validate-env.js`

---

## Architecture Overview

### High-Level Stack
- **Gateway**: Bastion Server (Express, rate-limited reverse proxy)
- **Backend**: 4 microservices (Node.js + Express)
  - `admin-service` (main API, Sequelize ORM for PostgreSQL)
  - `auth-service` (Supabase JWT verification, user management)
  - `assessment-service` (assessments/quizzes)
  - (Optional) `college-service` (institutional admin features)
- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL (Supabase)
- **Auth**: Supabase JWT (verified server-side)
- **Storage**: Cloudflare R2 (assets, PDFs) + Bunny Stream (videos)
- **Cache**: Redis (Upstash)
- **Payments**: Razorpay
- **Monitoring**: Sentry
- **Email**: Nodemailer (SMTP)

### Request Flow
```
Browser → Frontend (Vite, port 5173)
       ↓
       → Bastion Gateway (port 8000, routes API calls)
       ↓
       → Admin Service (port 5000, main business logic)
       ↓
       → PostgreSQL (Supabase)
```

### Multi-Service Orchestration
All services run independently in `npm run dev` during local development. In production, they're deployed as separate services. The `run.ps1` script launches each in its own PowerShell window for visibility.

---

## Key Files & Directories

### Backend (admin-service, the main service)
- `src/server.js` — Express app setup, middleware registration, route mounting
- `src/models/` — Sequelize models (67 total); associations defined per-model
- `src/controllers/` — Request handlers with business logic
- `src/routes/` — API endpoint definitions (registered in `server.js`)
- `src/services/` — Business logic, database queries, helper functions
- `src/middlewares/` — Auth verification (`requireStudent`, `adminOnly`), error handling
- `src/config/database.js` — Sequelize initialization and connection pooling
- `src/helpers/` — Utilities (JWT verification, caching, email, file uploads)
- `.env` — Environment variables (DATABASE_URL, SUPABASE_JWT_SECRET, etc.)

### Frontend
- `src/main.tsx` — App entry point
- `src/App.tsx` — Main router and layout
- `src/pages/` — Route-level components (StudentDashboard, etc.)
- `src/admin/` — Admin dashboard pages (only `/admin` is live)
- `src/components/` — Reusable UI components
- `src/api/` — Axios API wrappers (e.g., `assignmentApi.ts`)
- `src/context/` — React Context providers (auth, theme, etc.)
- `src/hooks/` — Custom React hooks (`useDashboardTheme`, etc.)
- `src/types/` — TypeScript type definitions
- `.env` — Environment variables (VITE_ADMIN_API_URL, VITE_BASTION_API_URL)

### Database & Migrations
- `supabase/` — SQL migration scripts
  - `01_schemas_and_enums.sql` — Database schemas, enums
  - `02_lucy_devdb_tables.sql` — Auth/identity tables
  - `03_lms_admin_tables.sql` — LMS-specific tables
  - `04_indexes.sql` — Performance indexes
  - `05_seed_roles.sql` — Default role seeds
- `supabase/apply-migrations.js` — Applied automatically by `run.ps1`

### Configuration & Documentation
- `DEVELOPER_GUIDE.md` — Architecture, endpoints, security patterns
- `SETUP_GUIDE.md` — Initial Supabase, R2, Bunny, SMTP setup
- `STUDENT_DASHBOARD_GUIDE.md` — User guide for dashboard features
- `PRODUCTION_DEPLOYMENT_GUIDE.md` — Railway deployment steps
- `credentials.env` — Master credentials (DO NOT COMMIT; auto-synced to service .env files)

---

## Authentication & Authorization

### How Auth Works
1. Frontend logs in via Supabase Auth (email/password)
2. Supabase returns a JWT token (stored in `localStorage`)
3. Frontend sends token in `Authorization: Bearer <JWT>` header with API requests
4. Backend validates JWT signature using `SUPABASE_JWT_SECRET`
5. `req.authUser` contains `userId`, `email`, `role`

### Key Patterns
- **Never trust `x-user-id` header** — always extract user from verified JWT
- `req.authUser.userId` is the verified user identity
- **Student routes** use `requireStudent` middleware
- **Admin routes** use `adminOnly` middleware
- **Teacher operations** verify ownership (e.g., teacher grading their own assignments)
- **Batch membership** is verified via `BatchMember` table, not request body

### Security Reminders
- ✅ All student queries filtered by `user_id`
- ✅ Teachers can only access their assigned batches/courses
- ✅ Enrollment verified before serving course content
- ✅ Payment verified (Razorpay) before unlocking paid courses
- ✅ Release gates enforced (lessons unlocked by teacher or `is_marketing` flag)

---

## Production-Ready Development (NEW)

### 🎯 Input Validation Library (NEW)

All user input must be validated before reaching the database:

```javascript
// src/lib/validators.js has reusable schemas
const { validateBody, schemas } = require('../lib/validators');

router.post('/courses', validateBody(schemas.createCourse), ctrl.create);
// Data is auto-validated in req.validatedBody
```

**See [PRODUCTION_PATTERNS.md](./PRODUCTION_PATTERNS.md) for validation patterns.**

### 📊 Structured Logging with Correlation IDs (NEW)

Every request gets a unique ID for tracing across services:

```javascript
const { logger, auditLog } = require('../lib/logger');

logger.info('User action', { action: 'course_enrolled' });
auditLog('PAYMENT_CAPTURED', { order_id: 123 }, userId);
// Output: { requestId, timestamp, userId, action, ... }
```

**See [PRODUCTION_PATTERNS.md](./PRODUCTION_PATTERNS.md) for logging examples.**

### ✅ Endpoint Checklist (NEW)

When adding a new API endpoint:

- [ ] Auth middleware + role check (`auth`, `adminOnly`, etc.)
- [ ] Input validation (`validateBody(schemas.xxx)`)
- [ ] User filtering in queries (filter by `req.authUser.userId`)
- [ ] Error logging with context (`logger.error()`)
- [ ] Audit logging for sensitive ops (`auditLog()`)
- [ ] JSDoc comments on controller methods
- [ ] Tests for happy path + error cases

**See [PRODUCTION_PATTERNS.md](./PRODUCTION_PATTERNS.md) § Checklist** for details.**

---

## Adding New Features

### Full Walkthrough: Adding a New API Endpoint

**See [ONBOARDING.md](./ONBOARDING.md) for a complete example** creating an "Announcements" feature.

Quick steps:

1. **Add validation schema** in `src/lib/validators.js`
2. **Create controller** with error logging and auth checks
3. **Create route** with `validateBody` middleware
4. **Register route** in `server.js`
5. **Add SQL migration** in `supabase/migrations/`
6. **Write tests** (optional)
7. **Update CLAUDE.md** if new feature type

### Adding a New Database Model

1. **Create model file** (`src/models/MyModel.js`):
```javascript
const { DataTypes } = require('sequelize');
module.exports = (sequelize) => {
  const MyModel = sequelize.define('MyModel', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: DataTypes.STRING,
    user_id: DataTypes.INTEGER,
  }, {
    tableName: 'my_models',
    timestamps: false
  });
  MyModel.associate = (models) => {
    MyModel.belongsTo(models.User, { foreignKey: 'user_id' });
  };
  return MyModel;
};
```

2. **Register in `src/models/index.js`**:
```javascript
const MyModel = require('./MyModel')(sequelize);
models.MyModel = MyModel;
```

3. **Create a SQL migration** and run via Supabase dashboard or `apply-migrations.js`

### Frontend Component Pattern
- Use functional components with hooks
- Import shadcn/ui components from `@/components/ui`
- Fetch data via custom API wrappers (e.g., `src/api/myApi.ts`)
- Use `useDashboardTheme()` hook in dashboard-scoped routes for light/dark toggle
- Use React Router for navigation

---

## Important Patterns & Features

### Student Feedback System
- Teachers post evaluations after class (6 star attributes + text feedback)
- Data stored in `StudentRecord` (kind='evaluation')
- Admin dashboard: `/admin/feedback` shows aggregated stats and per-student feedback
- API: `GET /api/admin/feedback`, `GET /api/admin/feedback/stats`, `GET /api/admin/feedback/by-student`

### Dynamic Feedback Forms
- Teachers build custom forms (rating/text/MCQ/yes-no)
- One-time student submission (unique by form_id + student_id)
- Admin stats on `/admin/feedback-forms`
- Data: `feedback_forms` table, `feedback_responses` for submissions

### Teacher Delegation
- Admin assigns `course + roster → teacher`
- Teachers drip lessons day-by-day via `lesson_releases`
- Data: `teaching_assignments`, `assignment_members`, `lesson_releases` tables
- Server enforces per-lesson gating (video unlock in playerData)

### Leaderboard
- Points: `completion × 10 + quiz × 5`
- Per-course and overall ranking
- Cached for 10k+ students (uses Redis)
- API: `GET /api/public/leaderboard`

### Payment Integration (Razorpay)
- Order creation, verification, webhook handling in `admin-service`
- Table: `lms_admin.payments`
- Paywall in `playerData` (skips delegated assignments)
- Environment-driven keys; returns 503 until configured

### Course Release Gating (Universal)
- **ALL courses** lock lessons until teacher releases (no exceptions)
- Rosterless assignment = global (applies to everyone)
- Paywall layered on top of release gating
- Data: `lesson_releases` table

### Marketing Courses
- `is_marketing` flag = free sample/teaser course
- Fully playable by every registered student
- Bypasses payment + release gating
- Admin toggle in course forms; "Free sample" badge in UI

### Dashboard Theme Toggle
- Premium light/dark scoped toggle in student/teacher/admin dashboards ONLY
- Home page stays light
- `useDashboardTheme()` hook + `<ThemeToggle />` component
- Scoped CSS overrides in `index.css`

### Contact Messages & Leads
- Public Contact form → `contact_messages` table
- Public signup (no login) → `leads` table for follow-up
- Admin inbox: `/admin/messages` and `/admin/leads`
- APIs: `POST /api/public/contact`, admin `GET/PATCH/DELETE /api/admin/contact-messages`

---

## Troubleshooting & Debugging

### Services Won't Start
- Check all `.env` files exist (`backend/*/. env`, `frontend/.env`)
- Verify `SUPABASE_JWT_SECRET` and `DATABASE_URL` are set correctly
- Clear `node_modules` and reinstall: `rm -r node_modules && npm install`
- Check logs in PowerShell windows for error messages

### Database Migration Errors
- Verify migration files are in `supabase/` directory
- Manually run migrations via Supabase SQL Editor if `apply-migrations.js` fails
- Check that `DATABASE_URL` points to the correct Supabase instance

### API Requests Return 401/403
- Verify JWT token is present in `Authorization: Bearer <token>` header
- Decode token at [jwt.io](https://jwt.io) and check expiry
- Ensure `SUPABASE_JWT_SECRET` in backend matches Supabase settings
- Check user role in JWT (`role: 'admin'`, `role: 'student'`, etc.)

### Frontend Can't Connect to API
- Verify `.env` has `VITE_ADMIN_API_URL=http://localhost:5000` (dev) or production URL
- Ensure Bastion gateway (port 8000) is running and healthy
- Check CORS settings in Bastion middleware
- Check browser DevTools Network tab for failed requests

### Redis/Cache Unavailable
- Caching is optional; app continues without Redis
- Check `REDIS_URL` in `.env` if caching is needed
- Upstash dashboard for connection monitoring

---

## Common Development Tasks

### Run Only Frontend
```bash
cd frontend && npm run dev
```
Useful for UI-only work if backend is already running elsewhere.

### Run Only a Specific Backend Service
```bash
cd backend/admin-service && npm run dev
```
Useful for isolated backend feature development.

### Test an API Endpoint
```bash
# Get a JWT token first (log in via frontend)
# Then use it in curl:
curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:5000/api/admin/courses
```

### Seed Admin Accounts
```bash
cd backend/admin-service && npm run seed:admin
```
Creates/updates `vrroot@vrroboticsacademy.com` and `vradmin@vrroboticsacademy.com` with default passwords. Idempotent; safe to re-run.

### Database Inspection
1. Open Supabase dashboard
2. Go to SQL Editor or Table Editor
3. Query/edit tables directly (e.g., `lucy_devdb.users`, `lms_admin.courses`)

### Sentry Error Monitoring
- Check `SENTRY_DSN` in `.env`
- Errors are auto-reported in production
- Visit [sentry.io](https://sentry.io) to view error logs

---

## Before Committing

1. **Do not commit sensitive files**: `.env`, credentials, API keys
2. **Check .gitignore**: It should exclude `.env`, `node_modules/`, build artifacts
3. **Run lint** (frontend): `npm run lint`
4. **Run tests** (backend): `npm test`
5. **Test locally**: Run the full `run.ps1` stack and manually verify changes
6. **Update docs** if architecture or setup changes

---

## Deployment Notes

### Local Ports
- Admin Service: `5000`
- Frontend: `5173`
- Auth Service: `8001`
- Assessment Service: `8003`
- Bastion Gateway: `8000`

### Environment Switching
- **Local** (`.env`): Points to `http://localhost:*` URLs
- **Production**: Points to production domain URLs (configured via Railway/hosting platform)

### credentials.env Sync
The `credentials.env` file is a **master credentials source**. Running `node sync-credentials.js` (mentioned in credentials.env header) pushes values to all service `.env` files. Keep it in `.gitignore` and manage it separately in your hosting platform.

---

## Key Memory Context

This project has evolved significantly. Key decision points and workarounds:

1. **Auth UI Removed**: The login/signup pages were removed in favor of a cleaner authentication flow. If you need to restore them, check commit history or revert specific commits (see memory: "VR Robotics admin login").

2. **Release Gating is Universal**: ALL courses now lock lessons until explicitly released by the teacher (no "delegated only" exception). This is the current behavior.

3. **Multi-Service Deployment**: Four independent backend services. Each is deployable separately but depends on the same Supabase PostgreSQL database.

4. **Cloudflare Deployment**: A Cloudflare Worker (`gentle-limit-6149`) fronts the frontend. Deploy via `npx wrangler deploy`.

5. **Windows PowerShell Scripts**: `run.ps1` and `restart.ps1` are Windows-specific. On Linux/Mac, manually run `npm run dev` in each service directory.

---

## Additional Resources

- `DEVELOPER_GUIDE.md` — Deep dive into architecture, endpoints, security
- `STUDENT_DASHBOARD_GUIDE.md` — User guide for dashboard features
- `PRODUCTION_DEPLOYMENT_GUIDE.md` — How to deploy to Railway or other platforms
- `LMS_Infrastructure_reference.md` — Detailed infrastructure and API reference

---

**Last Updated**: 2026-06-18  
**Status**: Production-Ready, Actively Developed
## Add unit tests 

whenever you add anychaanges add run make sure all the tests are passed.