
# Go-Live Checklist — VR Robotics LMS

Tick these in order. Code is ready; the rest is config + deploy. See
`RAILWAY_DEPLOY.md` for the per-service detail and `CLEAN_WORKFLOW.md` for the
canonical flow.

## A. Secrets & config (.env per service)
- [ ] `JWT_SECRET` — long random (≥24 chars). **admin-service refuses to boot in prod if weak.**
- [ ] `SUPABASE_JWT_SECRET` + Supabase URL — on admin, auth, Bastion.
- [ ] `DATABASE_URL` — Supabase **SESSION pooler** endpoint (`...pooler.supabase.com:5432`). ⚠️ NOT the 6543 transaction pooler — it can reset the per-connection `search_path` the raw SQL relies on ("relation does not exist" errors under load).
- [ ] **Backups: enable Supabase PITR or daily scheduled backups** (Dashboard → Project Settings → Database → Backups). Everything else on this list is recoverable; lost data isn't. Verify a restore point exists BEFORE go-live.
- [ ] `REDIS_URL` — Upstash. ✅ already set (verified connecting).
- [ ] `BUNNY_STREAM_LIBRARY_ID / API_KEY / CDN_HOSTNAME` (+ **`BUNNY_STREAM_TOKEN_KEY`** to turn on signed playback).
- [ ] `R2_*` (account, bucket, access keys).
- [ ] `SMTP_*` + `LMS_LOGIN_URL=https://<frontend>/login`.
- [ ] `RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET` (test keys first, NOT the live key for testing).
- [ ] Frontend build: `VITE_ADMIN_API_URL`, `VITE_BASTION_API_URL` → deployed URLs.
- [ ] Bastion: `AUTH_SERVICE_HOST/PORT`, `ADMIN_SERVICE_HOST/PORT`, `BASTION_ALLOWED_ORIGINS=https://<frontend>`.
- [ ] **`CORS_ORIGINS=https://<frontend>` on auth-service** ⚠️ NEW — auth-service CORS is now an allowlist (localhost always allowed). **If unset in prod, every browser login is CORS-blocked** (curl/Postman still work — easy to miss).
- [ ] `NODE_ENV=production` on all three (activates the JWT_SECRET boot guard + correct error behavior).
- [ ] `ALLOW_PUBLIC_SIGNUP` LEFT UNSET/false — public self-signup stays disabled (admins create all teacher/student accounts).

## B. Deploy (Railway) — only these four
- [ ] **admin-service** (public) — build `npm ci`, start `npm start`, health `/api/health`.
- [ ] **auth-service** (private) — health `/health`.
- [ ] **Bastion** (public gateway) — health `/health`. (PORT binding fixed ✅.)
- [ ] **frontend** — `npm ci && npm run build`, serve `dist/` (Vercel/Netlify or Railway static).
- [ ] Skip course/organisation/assessment/payment/college services (off the student path; `/course/all` fails gracefully).
- [ ] Connection pools small (max ~5–10/instance). Start with 2–3 admin replicas.

## C. Provider dashboards
- [ ] **Razorpay** → Webhooks → `https://<admin-url>/api/public/payments/webhook`, events `payment.captured` + `payment.failed`, secret = `RAZORPAY_WEBHOOK_SECRET`.
- [ ] **Bunny** → pull zone → Security → enable URL Token Authentication (matches `BUNNY_STREAM_TOKEN_KEY`).
- [ ] **CI**: connect GitHub repo → Railway auto-deploy on green `main` (`.github/workflows/ci.yml` runs tests + build).

## D. First-boot
- [ ] Restart admin-service once → it auto-creates new tables (`teaching_assignments`, `assignment_members`, `lesson_releases`, `leads`, `payments`). (The old "relation … already exists" boot error is now FIXED — boot log should be clean.)
- [ ] Boot log shows `[cache] Redis connected`.
- [ ] Seed/confirm a root admin account.

## E. Smoke test (post-deploy)
- [ ] `GET /api/health` → `{ok:true}`; `[cache] Redis connected` in logs.
- [ ] Admin: create course + lessons → assign to a teacher + roster.
- [ ] Teacher: release a lesson → student sees it; **locked lesson's `lesson_src` is empty** (Network tab).
- [ ] Student writes (complete/quiz) require a token (401 without) — no spoofing.
- [ ] Buy a paid course (Razorpay test) → lands in player → appears in **My Courses** at once (cache invalidated).
- [ ] Leaderboard loads; 2nd load served from Redis (faster).
- [ ] Lead capture (public Register) → appears in admin Leads → Convert → welcome email.

## F. Already verified in dev (so you don't re-check)
- ✅ 22 unit tests pass; all touched modules load; frontend builds.
- ✅ Identity anti-spoof (verified-JWT on player/writes/reads).
- ✅ Every `lms_admin` user_id column is varchar; models aligned (no silent write failures).
- ✅ Scale: bounded in-mem cache, Redis read-cache (leaderboard/catalog/my-courses), progress writes debounced 5s→20s.
- ✅ Paywall gates paid courses; delegation gates school/batch; both server-enforced.

## Known limitations (not blockers)
- Mentor **earnings/payout dashboard** is a placeholder (unbuilt feature — needs earning rules).
- Two-DB / 6-service structural debt remains (documented in CLEAN_WORKFLOW.md); only auth+admin+Bastion are on the hot path.
