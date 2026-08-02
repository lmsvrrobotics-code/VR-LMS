import logger from './logger.js';
import auditLog from './auditLog.js';

/**
 * ✅ BRUTE FORCE PROTECTION
 * Locks accounts after N failed login attempts
 */

class BruteForceProtection {
  constructor() {
    this.failedAttempts = {}; // In-memory store (TODO: use Redis)
    this.lockedAccounts = {}; // In-memory store (TODO: use Redis)

    this.config = {
      maxFailedAttempts: 5,
      lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
      attemptWindowMs: 60 * 60 * 1000, // 1 hour window
    };
  }

  /**
   * Check if account is locked
   */
  isAccountLocked(email) {
    const lockKey = `locked:${email}`;
    const lockTime = this.lockedAccounts[lockKey];

    if (!lockTime) {
      return false;
    }

    // Check if lockout period has expired
    if (Date.now() > lockTime) {
      delete this.lockedAccounts[lockKey];
      delete this.failedAttempts[email];
      return false;
    }

    return true;
  }

  /**
   * Record failed login attempt
   */
  recordFailedAttempt(email) {
    const key = `attempts:${email}`;

    if (!this.failedAttempts[key]) {
      this.failedAttempts[key] = [];
    }

    // Add current attempt
    this.failedAttempts[key].push(Date.now());

    // Remove attempts outside the window
    this.failedAttempts[key] = this.failedAttempts[key].filter(
      (time) => Date.now() - time < this.config.attemptWindowMs
    );

    const attempts = this.failedAttempts[key].length;

    logger.warn('[BRUTE_FORCE] Failed login attempt', {
      email,
      attempts,
      maxAttempts: this.config.maxFailedAttempts,
    });

    // Lock account if threshold exceeded
    if (attempts >= this.config.maxFailedAttempts) {
      this.lockAccount(email, attempts);
      return {
        locked: true,
        attempts,
        message: 'Too many failed attempts. Account locked for 15 minutes.',
      };
    }

    return {
      locked: false,
      attempts,
      remainingAttempts: this.config.maxFailedAttempts - attempts,
      message: `Invalid credentials. ${this.config.maxFailedAttempts - attempts} attempts remaining.`,
    };
  }

  /**
   * Lock account
   */
  lockAccount(email, attempts) {
    const lockKey = `locked:${email}`;
    const lockUntil = Date.now() + this.config.lockoutDurationMs;

    this.lockedAccounts[lockKey] = lockUntil;

    logger.error('[BRUTE_FORCE] Account locked due to failed attempts', {
      email,
      attempts,
      lockedUntil: new Date(lockUntil).toISOString(),
    });

    auditLog.logFailedLoginAttempt(email, attempts, true);

    // TODO: Send security alert email to user
    // await sendSecurityAlertEmail(email);
  }

  /**
   * Clear failed attempts on successful login
   */
  clearFailedAttempts(email) {
    const key = `attempts:${email}`;
    delete this.failedAttempts[key];
  }

  /**
   * Get attempt info for debugging
   */
  getAttemptInfo(email) {
    const key = `attempts:${email}`;
    const lockKey = `locked:${email}`;
    const attempts = this.failedAttempts[key] || [];
    const isLocked = this.isAccountLocked(email);
    const lockUntil = this.lockedAccounts[lockKey];

    return {
      email,
      attempts: attempts.length,
      isLocked,
      lockUntilTime: lockUntil ? new Date(lockUntil).toISOString() : null,
      config: this.config,
    };
  }
}

export default new BruteForceProtection();
