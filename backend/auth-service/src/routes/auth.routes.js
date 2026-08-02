import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as controller from '../controllers/auth.controller.js';
import isLoggedIn from '../middlewares/isLoggedin.js';
import authRoles from '../middlewares/authRoles.js';

// ✅ SECURITY IMPORTS
import { validateBody, schemas } from '../lib/validators.js';
import { sanitizeMiddleware } from '../lib/sanitize.js';
import bruteForce from '../lib/bruteForceProtection.js';

const router = Router();

// ✅ Brute-force protection on credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 minutes
  max: 10, // 10 attempts per window per IP+email
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').trim().toLowerCase()}`,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

// ✅ Middleware for account lockout protection
const checkBruteForce = (req, res, next) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (bruteForce.isAccountLocked(email)) {
    return res.status(429).json({
      error: 'Account locked due to multiple failed attempts',
      message: 'Please try again in 15 minutes',
    });
  }

  next();
};

// ✅ Routes with security middleware (sanitize → validate → rate limit → handler)
router.post('/register', sanitizeMiddleware, validateBody(schemas.register), authLimiter, controller.register);
router.post('/login', sanitizeMiddleware, validateBody(schemas.login), authLimiter, checkBruteForce, controller.login);
router.post('/refresh', sanitizeMiddleware, validateBody(schemas.refresh), controller.refresh);

// ✅ Protected routes with validation
router.get('/profile', isLoggedIn, controller.profile);
router.put('/profile/update', isLoggedIn, sanitizeMiddleware, validateBody(schemas.updateProfile), controller.updateProfile);
router.put('/profile/update/edu', isLoggedIn, authRoles(['student', 'teacher']), sanitizeMiddleware, validateBody(schemas.updateProfile), controller.updateEducation);
router.put('/profile/update/org-clg-branch', isLoggedIn, authRoles(['student', 'teacher']), sanitizeMiddleware, validateBody(schemas.updateProfile), controller.updateOrgClgBranch);
router.put('/profile/prescore', isLoggedIn, authRoles(['student']), sanitizeMiddleware, controller.preScore);
router.put('/profile/postscore', isLoggedIn, authRoles(['student']), sanitizeMiddleware, controller.postScore);
router.post('/change-password', isLoggedIn, sanitizeMiddleware, validateBody(schemas.changePassword), controller.changePassword);
router.post('/logout', isLoggedIn, controller.logout);

export default router;
