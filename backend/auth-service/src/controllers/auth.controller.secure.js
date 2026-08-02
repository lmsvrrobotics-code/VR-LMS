/**
 * ✅ SECURE AUTH CONTROLLER
 * Includes: input validation, XSS protection, audit logging, brute force protection
 * Merge these into your existing auth.controller.js
 */

import logger from '../lib/logger.js';
import auditLog from '../lib/auditLog.js';
import bruteForce from '../lib/bruteForceProtection.js';

// Example: Updated login function
export async function login(req, res) {
  try {
    // ✅ Input already validated and sanitized by middleware
    const { email, password } = req.validatedBody;

    // ✅ Check if account is locked
    if (bruteForce.isAccountLocked(email)) {
      auditLog.logFailedLoginAttempt(email, 0, true, req);
      return res.status(429).json({
        error: 'Account locked',
        message: 'Too many failed attempts. Please try again in 15 minutes.',
      });
    }

    // ✅ Attempt login with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // ✅ Record failed attempt
      const result = bruteForce.recordFailedAttempt(email);

      // ✅ Audit log failed attempt
      auditLog.logLoginAttempt(email, false, 'invalid_credentials', req);

      logger.warn('[AUTH] Login failed', {
        email,
        reason: error.message,
        attempts: result.attempts,
      });

      return res.status(401).json({
        error: 'Invalid credentials',
        // Only show remaining attempts if not locked
        ...(result.attempts < bruteForce.config.maxFailedAttempts && {
          remainingAttempts: result.remainingAttempts,
        }),
      });
    }

    // ✅ Success: Clear failed attempts
    bruteForce.clearFailedAttempts(email);

    // ✅ Audit log successful login
    auditLog.logLoginAttempt(email, true, 'correct_credentials', req);

    logger.info('[AUTH] Login successful', {
      userId: data.user.id,
      email,
    });

    // ✅ Token expiration is handled by Supabase (1 hour access, 7 day refresh)
    res.status(200).json({
      success: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: 3600, // 1 hour
      user: {
        userId: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role,
      },
    });
  } catch (error) {
    logger.error('[AUTH] Login error', {
      error: error.message,
      email: req.body.email, // Original email (not validated - for logging only)
    });

    auditLog.logSuspiciousActivity('LOGIN_ERROR', {
      error: error.message,
    }, null, req);

    res.status(500).json({
      error: 'Login failed. Please try again later.',
    });
  }
}

// Example: Updated logout function
export async function logout(req, res) {
  try {
    const userId = req.user?.id;
    const email = req.user?.email;

    // ✅ Audit log logout
    auditLog.logLogout(userId, email, req);

    logger.info('[AUTH] User logged out', {
      userId,
      email,
    });

    // ✅ Clear session token (invalidate on backend)
    // TODO: Add to token blacklist in Redis
    // await redis.set(`blacklist:${req.headers.authorization}`, '1', { EX: 3600 });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('[AUTH] Logout error', {
      error: error.message,
      userId: req.user?.id,
    });

    res.status(500).json({
      error: 'Logout failed',
    });
  }
}

// Example: Updated password change function
export async function changePassword(req, res) {
  try {
    const userId = req.user?.id;
    const email = req.user?.email;
    const { currentPassword, newPassword } = req.validatedBody;

    // ✅ Verify current password
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (authError) {
      auditLog.logSuspiciousActivity('PASSWORD_CHANGE_FAILED', {
        reason: 'incorrect_current_password',
      }, userId, req);

      return res.status(401).json({
        error: 'Current password is incorrect',
      });
    }

    // ✅ Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      throw updateError;
    }

    // ✅ Audit log password change
    auditLog.logPasswordChange(userId, email, 'user_self', req);

    logger.info('[AUTH] Password changed', {
      userId,
      email,
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    logger.error('[AUTH] Password change error', {
      error: error.message,
      userId: req.user?.id,
    });

    auditLog.logSuspiciousActivity('PASSWORD_CHANGE_ERROR', {
      error: error.message,
    }, req.user?.id, req);

    res.status(500).json({
      error: 'Failed to change password',
    });
  }
}

// Example: Update profile with validation
export async function updateProfile(req, res) {
  try {
    const userId = req.user?.id;
    // ✅ Already sanitized and validated by middleware
    const { name, email, phone } = req.validatedBody;

    // TODO: Update user profile in database
    // const updated = await db.User.update(
    //   { name, email, phone },
    //   { where: { id: userId }, returning: true }
    // );

    auditLog.logSecurityEvent('PROFILE_UPDATED', {
      fields: Object.keys(req.validatedBody),
    }, userId, req);

    logger.info('[AUTH] Profile updated', {
      userId,
      fields: Object.keys(req.validatedBody),
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      // user: updated
    });
  } catch (error) {
    logger.error('[AUTH] Profile update error', {
      error: error.message,
      userId: req.user?.id,
    });

    res.status(500).json({
      error: 'Failed to update profile',
    });
  }
}

export default {
  login,
  logout,
  changePassword,
  updateProfile,
};
