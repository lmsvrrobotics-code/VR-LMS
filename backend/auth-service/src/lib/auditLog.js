import logger from './logger.js';

/**
 * ✅ AUDIT LOGGING - Track all security-sensitive events
 * Used for: compliance, security monitoring, breach detection
 */

class AuditLogger {
  constructor() {
    this.events = [];
  }

  /**
   * Log auth event with full context
   */
  logAuthEvent(event, data = {}, userId = null, req = null) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      event,
      userId,
      ip: req?.ip || 'unknown',
      userAgent: req?.get('user-agent') || 'unknown',
      method: req?.method || 'N/A',
      path: req?.path || 'N/A',
      ...data,
      // DO NOT LOG: passwords, tokens, credit cards, SSN
    };

    // Log to file
    logger.warn(`[AUDIT] ${event}`, auditEntry);

    // Store in memory (for this session)
    this.events.push(auditEntry);

    // TODO: Send to audit log database/service for compliance
    // await db.AuditLog.create(auditEntry);

    return auditEntry;
  }

  /**
   * Login attempts
   */
  logLoginAttempt(email, success, reason = null, req = null) {
    this.logAuthEvent(
      success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
      {
        email,
        reason: reason || (success ? 'correct_credentials' : 'invalid_credentials'),
      },
      null,
      req
    );
  }

  /**
   * Logout
   */
  logLogout(userId, email, req = null) {
    this.logAuthEvent(
      'LOGOUT',
      { email },
      userId,
      req
    );
  }

  /**
   * Token refresh
   */
  logTokenRefresh(userId, email, req = null) {
    this.logAuthEvent(
      'TOKEN_REFRESH',
      { email },
      userId,
      req
    );
  }

  /**
   * Password changes
   */
  logPasswordChange(userId, email, changedBy = null, req = null) {
    this.logAuthEvent(
      'PASSWORD_CHANGED',
      {
        email,
        changedBy: changedBy || 'user_self',
      },
      userId,
      req
    );
  }

  /**
   * Failed login attempts (for brute force detection)
   */
  logFailedLoginAttempt(email, attempt, lockout = false, req = null) {
    this.logAuthEvent(
      lockout ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      {
        email,
        attempt,
        reason: 'incorrect_password',
      },
      null,
      req
    );
  }

  /**
   * Suspicious activities
   */
  logSuspiciousActivity(activity, details = {}, userId = null, req = null) {
    this.logAuthEvent(
      'SUSPICIOUS_ACTIVITY',
      {
        activity,
        ...details,
      },
      userId,
      req
    );
  }

  /**
   * Security events
   */
  logSecurityEvent(event, details = {}, userId = null, req = null) {
    this.logAuthEvent(
      event,
      details,
      userId,
      req
    );
  }

  /**
   * Get audit trail for user
   */
  getUserAuditTrail(userId) {
    return this.events.filter((e) => e.userId === userId);
  }

  /**
   * Get events by type
   */
  getEventsByType(event) {
    return this.events.filter((e) => e.event === event);
  }
}

export default new AuditLogger();
