// src/index.js
'use strict';

import dotenv from 'dotenv';
dotenv.config();
import './observability.js'; // Sentry.init() — keep right after env load
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';

import rateLimiter from './middlewares/rateLimiter.js';
import routes from './routes/index.js';
import { isAllowedOrigin } from './utils/cors.js';
import { attachErrorHandler } from './observability.js';

const app = express();

// Behind Nginx/ALB on EC2 — needed for correct client IP in rate limiter and logs.
app.set('trust proxy', 1);

app.use(helmet());

// Middlewares
app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Skip JSON parsing for multipart bodies — those requests need to stream
// untouched to the upstream service (e.g. assessment-service file uploads).
// Otherwise express.json() reads the raw body and 413s on the file payload
// before the proxy ever sees the request.
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.startsWith('multipart/form-data')) return next();
  return express.json({ limit: '10mb' })(req, res, next);
});
app.use(morgan('combined'));
app.use(rateLimiter);

// Health check for ALB / Nginx / uptime probes — must respond before auth/proxy.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api', routes);

app.get('/', (_req, res) => {
  res.send('Welcome to Bastion Server');
});

// Anything not matched above is an unknown route — say so. The old catch-all
// answered 200 "Welcome" to every typo'd path/method, which masked broken
// client URLs and made uptime checks useless.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

attachErrorHandler(app);

// Final JSON error handler. Sentry's handler (above) only reports — without
// this, errors fall through to Express's default HTML error page (stack
// trace in dev). Must be last and must keep the 4-arg signature.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[Bastion] unhandled error:', err);
  if (res.headersSent) return;
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

export default app;