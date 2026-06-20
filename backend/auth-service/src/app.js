// import 'dotenv/config';
// import express from 'express';
// import helmet from 'helmet';
// import cors from 'cors';
// import morgan from 'morgan';
// import rateLimit from 'express-rate-limit';
// import sequelize from './db/index.js';
// import authRoutes from './routes/auth.routes.js';
// import roleRoutes from './routes/roles.routes.js';
// import cookieParser from "cookie-parser";



// import dotenv from 'dotenv';

// dotenv.config()

// const app = express();

// const allowedOrigin = (origin, cb) => {
//   if (!origin) return cb(null, true);
//   if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return cb(null, true);
//   return cb(new Error('Not allowed by CORS'));
// };

// app.use(cors({
//   origin: allowedOrigin,
//   credentials: true,
// }));

// app.use(helmet());
// app.use(express.json());
// app.use(morgan('dev'));
// app.use(cookieParser());
// app.use(rateLimit({ windowMs: 60_000, max: 200 }));

// app.get('/health', (req, res) => {
//   res.json({ status: 'ok', service: process.env.SERVICE_NAME });
// });

// app.get("/", (req, res) => {
//   res.send("Welcome to the Authentication Service API");
// });

// app.use('/', authRoutes);
// app.use('/roles', roleRoutes);

// export async function initDb() {
//   await sequelize.authenticate();
//   await sequelize.sync();
//   console.log('🗄️  Database connected and synced---');
// }

// export default app;

// // import 'dotenv/config';
// // import express from 'express';
// // import helmet from 'helmet';
// // import cors from 'cors';
// // import morgan from 'morgan';
// // import rateLimit from 'express-rate-limit';
// // import sequelize from './db/index.js';
// // import authRoutes from './routes/auth.routes.js';
// // import roleRoutes from './routes/roles.routes.js';
// // import cookieParser from "cookie-parser";

// // const app = express();

// // app.use(cors({ 
// //   origin: process.env.CORS_ORIGIN || '*',
// //   credentials: true,
// // }));

// // app.use(helmet());
// // app.use(express.json());
// // app.use(morgan('dev'));
// // app.use(cookieParser());
// // app.use(rateLimit({ windowMs: 60_000, max: 200 }));

// // // Health check
// // app.get('/health', (req, res) => {
// //   res.json({ status: 'ok', service: process.env.SERVICE_NAME });
// // });

// // app.get("/", (req, res) => {
// //   res.send("Welcome to the Authentication Service API");
// // });

// // // ✅ FIX: Mount auth routes under /auth prefix
// // app.use('/auth', authRoutes);
// // app.use('/auth/roles', roleRoutes);

// // // 404 handler for undefined routes
// // app.use('*', (req, res) => {
// //   res.status(404).json({ error: 'Route not found' });
// // });

// // export async function initDb() {
// //   await sequelize.authenticate();
// //   await sequelize.sync();
// //   console.log('🗄️ Database connected and synced');
// // }

// // export default app;





import 'dotenv/config';
import './observability.js'; // Sentry.init() — keep first
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import sequelize from './db/index.js';
import Role from './db/models/Role.js';
import authRoutes from './routes/auth.routes.js';
import roleRoutes from './routes/roles.routes.js';
import cookieParser from "cookie-parser";
import { generateRoleID } from './utils/uidGeneration.js';
import { attachErrorHandler } from './observability.js';

// ✅ SECURITY IMPORTS
import { sanitizeMiddleware } from './lib/sanitize.js';
import auditLog from './lib/auditLog.js';
import bruteForce from './lib/bruteForceProtection.js';

const app = express();

// Behind Railway's proxy the client IP is in X-Forwarded-For. Without this,
// express-rate-limit keys every request to the proxy IP, defeating throttling.
app.set('trust proxy', 1);

// CORS allowlist. `origin: true` reflected ANY site and combined with
// credentials:true let any website make authenticated requests on a user's
// behalf (CSRF-ish). In prod, set CORS_ORIGINS to a comma-separated list of
// your frontend origins. Localhost is always allowed for dev.
// Accept either env name: CORS_ORIGINS (canonical) or ALLOWED_ORIGINS (what the
// shipped .env historically used). Reading both avoids a silent prod CORS lockout
// where browser logins fail but curl/Postman (no Origin) still work.
const corsAllow = (process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOrigin = (origin, cb) => {
  if (!origin) return cb(null, true); // same-origin / curl / mobile
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
  if (corsAllow.includes(origin)) return cb(null, true);
  return cb(new Error('Not allowed by CORS'));
};
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));

app.use(helmet());
app.use(express.json());

// ✅ SECURITY: Sanitize all inputs (removes XSS)
app.use(sanitizeMiddleware);

app.use(morgan('dev'));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: process.env.SERVICE_NAME });
});

app.get("/", (req, res) => {
  res.send("Welcome to the Authentication Service API");
});

app.use('/', authRoutes);
app.use('/roles', roleRoutes);

// Alias mounts so the frontend (which calls the Bastion-style /api/v1/auth/*
// path) can reach this service directly during local dev, without the gateway.
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/roles', roleRoutes);
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', service: process.env.SERVICE_NAME }));

const ROLES = ['student', 'teacher', 'admin', 'auditor'];

export async function initDb() {
  await sequelize.authenticate();
  await sequelize.sync();

  // Ensure every role row exists — safe to run on every boot.
  for (const roleName of ROLES) {
    const [, created] = await Role.findOrCreate({
      where: { role: roleName },
      defaults: { roleId: generateRoleID('R'), role: roleName },
    });
    if (created) console.log(`  ✅ Seeded role: ${roleName}`);
  }

  console.log('🗄️  Database connected and synced---');
}

// Sentry error handler — must come after routes, before any custom
// error-handling middleware / export.
attachErrorHandler(app);

export default app;