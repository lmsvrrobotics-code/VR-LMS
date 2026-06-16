import { z } from 'zod';
import { QueryTypes } from 'sequelize';
import sequelize from '../db/index.js';
import { generateUserID } from '../utils/uidGeneration.js';
import User from '../db/models/User.js';
import Role from '../db/models/Role.js';
import supabaseAdmin from '../lib/supabaseAdmin.js';
import supabaseAnon from '../lib/supabaseAnon.js';

// Block login when the user's college has been revoked from Manage Colleges
// → Options → Revoke Access. Raw SELECT avoids defining a duplicate College
// model just for this gate. Best-effort: a missing column / query failure
// falls through so we don't lock everyone out on a DB hiccup.
async function assertCollegeActive(collegeId) {
  if (!collegeId) return;
  try {
    const rows = await sequelize.query(
      'SELECT "isActive" FROM colleges WHERE "clgId" = :clgId LIMIT 1',
      { replacements: { clgId: collegeId }, type: QueryTypes.SELECT }
    );
    if (rows.length && rows[0].isActive === false) {
      const err = new Error('Your college access has been revoked. Please contact your administrator.');
      err.status = 403;
      throw err;
    }
  } catch (e) {
    if (e.status === 403) throw e;
    console.warn('[auth] college isActive check skipped:', e.message);
  }
}

// ======================
// Schemas
// ======================
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().min(10).max(15),
  dob: z.string().min(10).max(10),
  gender: z.enum(['male', 'female']),
  role: z.enum(['student', 'teacher', 'admin', 'auditor']).optional(),
  educationLevel: z.enum(['inter', 'bachelor', 'master', 'phd', 'other']).optional().or(z.literal('')),
  branch: z.string().optional(),
  collegeName: z.string().optional(),
  graduationYear: z.string().optional(),
  collegeCode: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  // Login must NOT enforce the new-account length rule: legacy/admin-created
  // accounts can have shorter passwords and must still reach Supabase, which
  // is the actual verifier. Only require that something was typed.
  password: z.string().min(1, 'Password is required')
});

// Turn a ZodError into one clean, human sentence. Without this, err.message
// is the raw JSON dump of every issue ("[ { \"origin\": \"string\", ... } ]")
// and we were returning that straight to the browser.
function validationMessage(err) {
  const issue = err?.issues?.[0];
  if (!issue) return 'Invalid input';
  const field = issue.path?.join('.') || 'input';
  return `${field}: ${issue.message}`;
}

// ======================
// Helpers
// ======================
function setAuthCookies(res, session) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    path: '/',
  };
  // Supabase access tokens default to 1h; refresh tokens are long-lived.
  res.cookie('accessToken',  session.access_token,  { ...cookieOpts, maxAge: 60 * 60 * 1000 });
  res.cookie('refreshToken', session.refresh_token, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function shapeUserResponse(profile, role, session) {
  return {
    accessToken:  session.access_token,
    refreshToken: session.refresh_token,
    user: {
      userId:            profile.userId,
      email:             profile.email,
      name:              profile.name,
      phone:             profile.phone,
      dob:               profile.dob,
      gender:            profile.gender,
      role:              role ? role.role : null,
      collegeId:         profile.collegeId,
      orgId:             profile.orgId,
      branchId:          profile.branchId,
      yearOfEducation:   profile.yearOfEducation,
      yearOfStudy:       profile.yearOfStudy,
      programInterested: profile.programInterested,
    },
  };
}

// ======================
// Controllers
// ======================

// Register: create the Supabase Auth user FIRST so we get the auth UID, then
// mirror a profile row into lucy_devdb.users keyed on the same id. This keeps
// downstream services (which key on userId everywhere) working without change.
export async function register(req, res) {
  try {
    // SECURITY: public self-signup is DISABLED. Only admins create teacher/
    // student accounts (admin-service uses the service-role key directly). Public
    // "interest" goes through the Leads form, not account creation. Set
    // ALLOW_PUBLIC_SIGNUP=true to re-enable open registration.
    if (process.env.ALLOW_PUBLIC_SIGNUP !== 'true') {
      return res.status(403).json({
        message: 'Public sign-up is disabled. Accounts are created by your administrator.',
      });
    }

    const data = registerSchema.parse(req.body);

    // Block duplicate emails before we touch Supabase Auth.
    const existing = await User.findOne({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const role = await Role.findOne({ where: { role: data.role || 'student' } });
    if (!role) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // 1. Create the auth user. email_confirm: true skips the confirmation
    //    email — matches the existing flow where signup logs the user in
    //    immediately. Flip to false if you want email verification.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        name: data.name,
      },
      // Role drives authorization, so it must live in app_metadata — settable
      // only with the service-role key, NOT editable by the user themselves
      // (user_metadata is, via supabase.auth.updateUser).
      app_metadata: {
        role: role.role,
      },
    });
    if (createErr) {
      return res.status(400).json({ error: createErr.message });
    }

    const supabaseUid = created.user.id;
    const userId = generateUserID();

    // 2. Profile row. Store BOTH the legacy userId (used as PK across all
    //    services) and the Supabase auth uid (in passwordHash slot — repurposed
    //    as a back-pointer; bcrypt hashes are no longer needed since Supabase
    //    owns the password). We keep the column to avoid a schema change.
    try {
      await User.create({
        userId,
        email: data.email,
        passwordHash: `supabase:${supabaseUid}`,
        name: data.name,
        phone: data.phone,
        dob: data.dob,
        gender: data.gender,
        roleId: role.roleId,
        educationLevel: data.educationLevel || null,
        branch: data.branch || null,
        collegeName: data.collegeName || null,
        graduationYear: data.graduationYear || null,
        collegeCode: data.collegeCode || null,
      });
    } catch (e) {
      // Roll back the auth user so we don't leak orphans on a profile-write failure.
      await supabaseAdmin.auth.admin.deleteUser(supabaseUid).catch(() => {});
      throw e;
    }

    // 3. Sign the user in to get back a session for the cookie.
    const { data: signin, error: signinErr } = await supabaseAnon.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (signinErr) return res.status(400).json({ error: signinErr.message });

    setAuthCookies(res, signin.session);

    const profile = await User.findOne({ where: { userId } });
    return res.status(201).json(shapeUserResponse(profile, role, signin.session));

  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ error: validationMessage(err) });
    }
    console.error('Register error:', err);
    return res.status(400).json({ error: err.message });
  }
}

// Login: Supabase verifies the password and issues access/refresh tokens.
// We then look up the profile row for the user-shaped response that the
// frontend expects.
export async function login(req, res) {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const profile = await User.findOne({ where: { email } });
    if (!profile) {
      // Auth user exists but profile doesn't — happens for migrated rows or
      // when admin-created users haven't been backfilled. Reject so the UI
      // surfaces it instead of silently letting the user in with no role.
      return res.status(403).json({ error: 'Profile not provisioned. Contact admin.' });
    }

    await assertCollegeActive(profile.collegeId);

    const role = await Role.findByPk(profile.roleId);

    setAuthCookies(res, data.session);
    return res.json(shapeUserResponse(profile, role, data.session));

  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ error: validationMessage(err) });
    }
    if (err.status === 403) return res.status(403).json({ error: err.message });
    console.error('Login error:', err);
    return res.status(400).json({ error: err.message });
  }
}

// Refresh: hand the refresh token to Supabase, get a new pair back.
// Supabase rotates refresh tokens by default — the old one is single-use.
export async function refresh(req, res) {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken required' });
    }

    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      return res.status(401).json({ error: 'Invalid refreshToken' });
    }

    setAuthCookies(res, data.session);
    return res.json({
      accessToken:  data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(400).json({ error: err.message });
  }
}

export async function profile(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const role = await Role.findByPk(user.roleId);

    let userJson = user.toJSON();
    delete userJson.passwordHash;
    delete userJson.refreshToken;

    return res.json({ ...userJson, role: role ? role.role : null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateProfile(req, res) {
  try {
    const user = await User.findOne({ where: { userId: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Capture the email BEFORE mutating so the Supabase-sync check below can
    // tell whether it actually changed. (Previously this compared against the
    // already-updated value, so the sync never ran.)
    const oldEmail = user.email;

    const { name, email, phone, dob, bio, expertise, yearsOfExperience, linkedinUrl, address, location } = req.body;
    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    user.dob = dob || user.dob;
    // Teacher-profile fields — only overwrite when explicitly provided so a
    // partial save (e.g. just contact) can't wipe the bio/expertise.
    if (bio !== undefined) user.bio = bio;
    if (expertise !== undefined) user.expertise = expertise;
    if (yearsOfExperience !== undefined) user.yearsOfExperience = yearsOfExperience;
    if (linkedinUrl !== undefined) user.linkedinUrl = linkedinUrl;
    if (address !== undefined) user.address = address;
    if (location !== undefined) user.location = location;

    await user.save();

    // Keep Supabase Auth in sync when the email changes — auth.users.email is
    // the source of truth for sign-in. Best-effort: a Supabase update failure
    // leaves the profile updated but logs the drift.
    if (email && email !== oldEmail) {
      const supabaseUid = String(user.passwordHash || '').replace(/^supabase:/, '');
      if (supabaseUid) {
        await supabaseAdmin.auth.admin
          .updateUserById(supabaseUid, { email })
          .catch((e) => console.warn('[auth] Supabase email sync failed:', e.message));
      }
    }

    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateEducation(req, res) {
  try {
    const user = await User.findOne({ where: { userId: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { yearOfEducation, yearOfStudy, programInterested } = req.body;
    user.yearOfEducation   = yearOfEducation   ?? user.yearOfEducation;
    user.yearOfStudy       = yearOfStudy       ?? user.yearOfStudy;
    user.programInterested = programInterested ?? user.programInterested;

    await user.save();
    return res.status(200).json({ user, message: 'Educational details updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateOrgClgBranch(req, res) {
  try {
    const user = await User.findOne({ where: { userId: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { orgId, collegeId, branchId } = req.body;

    // SECURITY (multi-tenant boundary): orgId + collegeId define which tenant a
    // user belongs to and gate what data they can see. Allowing a user to change
    // their OWN org/college lets them hop into another tenant's scope. So these
    // are SET-ONCE: writable only while still empty (self-onboarding for users an
    // admin created without one); immutable once set. To move a user between
    // colleges, an admin re-assigns via admin-service. branchId stays editable
    // within the user's own college.
    const isEmpty = (v) => v === null || v === undefined || v === '';
    if (!isEmpty(orgId) && isEmpty(user.orgId)) user.orgId = orgId;
    if (!isEmpty(collegeId) && isEmpty(user.collegeId)) user.collegeId = collegeId;
    user.branchId = branchId ?? user.branchId;

    await user.save();
    return res.status(200).json({ user, message: 'Org/College/Branch details updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function preScore(req, res) {
  try {
    const user = await User.findOne({ where: { userId: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { preScore, preScoreDuration } = req.body;
    user.preScore = preScore;
    const dur = Number(preScoreDuration);
    if (Number.isFinite(dur) && dur >= 0) {
      user.preScoreDuration = Math.round(dur);
    }
    await user.save();

    return res.status(200).json({
      message: 'Pre-assessment score updated successfully',
      preScore: user.preScore,
      preScoreDuration: user.preScoreDuration,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function postScore(req, res) {
  try {
    const user = await User.findOne({ where: { userId: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { postScore, postScoreDuration } = req.body;
    if (postScore === undefined) {
      return res.status(400).json({ message: 'postScore is required' });
    }

    user.postScore = postScore;
    if (postScoreDuration !== undefined && postScoreDuration !== null) {
      const dur = Number(postScoreDuration);
      if (Number.isFinite(dur) && dur >= 0) {
        user.postScoreDuration = Math.round(dur);
      }
    }
    await user.save();

    return res.status(200).json({
      message: 'Post-assessment score updated successfully',
      postScore: user.postScore,
      postScoreDuration: user.postScoreDuration,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// Password change: hand off to Supabase Admin API. The currentPassword
// verification still runs through signInWithPassword so we get the same
// "wrong password" UX as before without bcrypt.
export async function changePassword(req, res) {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const { error: signinErr } = await supabaseAnon.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signinErr) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    const supabaseUid = String(user.passwordHash || '').replace(/^supabase:/, '');
    if (!supabaseUid) {
      return res.status(409).json({ error: 'Account not linked to Supabase Auth' });
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      supabaseUid,
      { password: newPassword }
    );
    if (updErr) {
      return res.status(400).json({ error: updErr.message });
    }

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Logout: revoke the Supabase session associated with the access token. We
// pull the token from cookies (set on login) or the Authorization header so
// either client style works. Clears local cookies regardless of Supabase's
// response so the user is logged out client-side even on transient errors.
export async function logout(req, res) {
  try {
    const accessToken =
      req.cookies?.accessToken ||
      (req.headers?.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (accessToken) {
      // Use a per-request client bound to the user's access token so
      // signOut() revokes only THEIR session, not a service-wide one.
      const { createClient } = await import('@supabase/supabase-js');
      const userClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      );
      await userClient.auth.signOut().catch(() => {});
    }

    res.clearCookie('accessToken',  { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
