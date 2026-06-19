// Teacher admin CRUD. Teachers are auth-service users with role
// 'teacher' (lucy_devdb.users + roles), so we operate via the read/write
// authDb handle and join the roles table — the same pattern StudentService
// uses for students.
//
// Note: lucy_devdb uses camelCase column names; on Postgres those MUST be
// double-quoted in every raw query (unquoted identifiers fold to lowercase
// and the resolve fails silently as "column does not exist").
const { QueryTypes } = require('sequelize');
const authDb = require('../config/authDatabase');
const { HttpError } = require('../middlewares/error');
const { upload, removeFile, niceFileName } = require('../helpers/fileUploader');
const supabaseAdmin = require('../lib/supabaseAdmin');
const env = require('../config/env');
const { enqueue } = require('../jobs/emailQueue');
const { studentWelcome, passwordReset } = require('../helpers/emailTemplates');

const ROLE = 'teacher';

const saveTeacherPhoto = async (file, displayName) => {
    if (!file) return null;
    const ext = (file.originalname || '').split('.').pop() || 'jpg';
    const destPath = `uploads/users/teacher/${niceFileName(displayName || 'teacher', ext)}`;
    await upload(file, destPath, 400, 400);
    return destPath;
};

// 11-char userId, same pattern as auth-service's generateUserID ("20" + 9
// digits). Inlined so admin-service doesn't depend on the auth service code.
const generateUserId = () => {
    const n = Math.floor(100000000 + Math.random() * 900000000);
    return `20${n}`;
};

const resolveTeacherRoleId = async () => {
    const rows = await authDb.query(
        `SELECT "roleId" FROM roles WHERE role = :role LIMIT 1`,
        { replacements: { role: ROLE }, type: QueryTypes.SELECT }
    );
    if (!rows.length) throw new HttpError(500, 'teacher role not found in roles table');
    return rows[0].roleId;
};

const list = async ({ page = 1, per_page = 1000, search = '' }) => {
    const limit = Number(per_page);
    const offset = (Number(page) - 1) * limit;
    const like = `%${String(search).trim()}%`;
    const searchClause = search
        ? 'AND (u.name ILIKE :like OR u.email ILIKE :like OR u.expertise ILIKE :like)'
        : '';
    try {
        const [{ count }] = await authDb.query(
            `SELECT COUNT(*) AS count
               FROM users u
               JOIN roles r ON r."roleId" = u."roleId"
              WHERE r.role = :role ${searchClause}`,
            { replacements: { role: ROLE, like }, type: QueryTypes.SELECT }
        );
        const rows = await authDb.query(
            `SELECT u."userId" AS id, u.name, u.email, u.phone, u.expertise,
                    u."yearsOfExperience", u."linkedinUrl", u.bio, u.address,
                    u."teacherPhoto", u."createdAt"
               FROM users u
               JOIN roles r ON r."roleId" = u."roleId"
              WHERE r.role = :role ${searchClause}
              ORDER BY u."createdAt" DESC
              LIMIT :limit OFFSET :offset`,
            { replacements: { role: ROLE, like, limit, offset }, type: QueryTypes.SELECT }
        );
        const teachers = rows.map((r) => {
            const { teacherPhoto, ...rest } = r;
            return { ...rest, photo: teacherPhoto || null, course_count: 0 };
        });
        return { teachers, total: Number(count), page: Number(page), per_page: limit };
    } catch (err) {
        console.warn('[teachers] auth DB query failed:', err.message);
        return { teachers: [], total: 0, page: Number(page), per_page: limit };
    }
};

const get = async (id) => {
    const rows = await authDb.query(
        `SELECT u."userId" AS id, u.name, u.email, u.phone, u.dob, u.gender,
                u.expertise, u.bio, u."yearsOfExperience", u."linkedinUrl",
                u.address, u."teacherPhoto", u."createdAt"
           FROM users u
           JOIN roles r ON r."roleId" = u."roleId"
          WHERE r.role = :role AND u."userId" = :id LIMIT 1`,
        { replacements: { role: ROLE, id: String(id) }, type: QueryTypes.SELECT }
    );
    if (!rows.length) throw new HttpError(404, 'Teacher not found');
    const { teacherPhoto, ...rest } = rows[0];
    return { teacher: { ...rest, photo: teacherPhoto || null } };
};

const findById = async (id) => {
    const rows = await authDb.query(
        `SELECT "userId", "teacherPhoto", "passwordHash"
           FROM users WHERE "userId" = :id LIMIT 1`,
        { replacements: { id: String(id) }, type: QueryTypes.SELECT }
    );
    return rows[0] || null;
};

const isEmailTaken = async (email, excludeId = null) => {
    const sql = excludeId
        ? `SELECT 1 FROM users WHERE email = :email AND "userId" <> :id LIMIT 1`
        : `SELECT 1 FROM users WHERE email = :email LIMIT 1`;
    const rows = await authDb.query(sql, {
        replacements: { email, id: String(excludeId || '') },
        type: QueryTypes.SELECT,
    });
    return rows.length > 0;
};

const generateUniqueStudentTeacherId = async (fullName) => {
    try {
        // Extract first name (first word only)
        const firstName = (fullName || '').trim().split(' ')[0] || 'User';

        // Get today's date in YYYYMMDD format
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}${month}${day}`;

        // Count how many users were created today
        const result = await authDb.query(
            `SELECT COUNT(*) as count FROM users WHERE DATE("createdAt") = CURRENT_DATE`,
            { type: QueryTypes.SELECT }
        );

        const serialNumber = (result[0]?.count || 0) + 1;
        const paddedSerial = String(serialNumber).padStart(2, '0');

        const uniqueId = `${firstName}${dateStr}-${paddedSerial}`;
        return uniqueId;
    } catch (error) {
        throw new HttpError(500, `Failed to generate unique ID: ${error.message}`);
    }
};

// Admin-created teachers land in lucy_devdb.users (role=teacher) AND
// Supabase Auth so they can sign in. Mirrors StudentService.create.
const create = async (body, file = null) => {
    if (!body.name || !body.email || !body.password) {
        throw new HttpError(422, 'Name, email, and password are required');
    }
    if (String(body.password).length < 8) {
        throw new HttpError(422, 'Password must be at least 8 characters');
    }
    if (await isEmailTaken(body.email)) {
        throw new HttpError(422, 'Email already in use');
    }
    const roleId = await resolveTeacherRoleId();
    const userId = generateUserId();
    // Generate unique ID: FirstName + YYYYMMDD + "-" + SerialNumber
    const uniqueId = await generateUniqueStudentTeacherId(body.name);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name: body.name },
        // Role in app_metadata (service-role-only) — never user_metadata, which
        // the user can edit and would let them self-escalate.
        app_metadata: { role: 'teacher' },
    });
    if (createErr) throw new HttpError(400, createErr.message);
    const supabaseUid = created.user.id;

    const photoPath = await saveTeacherPhoto(file, body.name);

    try {
        await authDb.query(
            `INSERT INTO users
                ("userId", name, email, "passwordHash", phone, "roleId",
                 expertise, bio, "yearsOfExperience", "linkedinUrl", address,
                 "teacherPhoto", "createdAt", "updatedAt")
             VALUES
                (:userId, :name, :email, :passwordHash, :phone, :roleId,
                 :expertise, :bio, :yearsOfExperience, :linkedinUrl, :address,
                 :teacherPhoto, NOW(), NOW())`,
            {
                replacements: {
                    userId,
                    name: body.name,
                    email: body.email,
                    passwordHash: `supabase:${supabaseUid}`,
                    phone: body.phone || null,
                    roleId,
                    expertise: body.expertise || null,
                    bio: body.bio || null,
                    yearsOfExperience:
                        body.yearsOfExperience != null && body.yearsOfExperience !== ''
                            ? Number(body.yearsOfExperience)
                            : null,
                    linkedinUrl: body.linkedinUrl || null,
                    address: body.address || null,
                    teacherPhoto: photoPath,
                },
                type: QueryTypes.INSERT,
            }
        );
    } catch (e) {
        await supabaseAdmin.auth.admin.deleteUser(supabaseUid).catch(() => {});
        throw e;
    }

    // Welcome email with login details (best-effort; worker retries SMTP).
    try {
        const { subject, html } = studentWelcome({
            studentName: body.name, email: body.email, password: body.password, loginUrl: env.mail?.lmsLoginUrl,
        });
        await enqueue({ to: body.email, subject, html });
    } catch (e) { console.warn('[teachers] welcome email enqueue failed:', e.message); }

    return { message: 'Teacher added successfully', teacher: (await get(userId)).teacher };
};

const update = async (id, body, file = null) => {
    const existing = await findById(id);
    if (!existing) throw new HttpError(404, 'Teacher not found');
    if (!body.name || !body.email) throw new HttpError(422, 'Name and email are required');
    if (await isEmailTaken(body.email, id)) {
        throw new HttpError(422, 'Email already in use');
    }
    const sets = [
        'name = :name', 'email = :email', 'phone = :phone',
        'expertise = :expertise', 'bio = :bio',
        '"yearsOfExperience" = :yearsOfExperience',
        '"linkedinUrl" = :linkedinUrl',
        'address = :address',
    ];
    const replacements = {
        id: String(id),
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        expertise: body.expertise ?? null,
        bio: body.bio ?? null,
        yearsOfExperience:
            body.yearsOfExperience != null && body.yearsOfExperience !== ''
                ? Number(body.yearsOfExperience)
                : null,
        linkedinUrl: body.linkedinUrl ?? null,
        address: body.address ?? null,
    };

    if (file) {
        const photoPath = await saveTeacherPhoto(file, body.name);
        if (photoPath) {
            sets.push('"teacherPhoto" = :teacherPhoto');
            replacements.teacherPhoto = photoPath;
            if (existing.teacherPhoto) removeFile(existing.teacherPhoto);
        }
    }

    await authDb.query(
        `UPDATE users SET ${sets.join(', ')}, "updatedAt" = NOW()
          WHERE "userId" = :id`,
        { replacements, type: QueryTypes.UPDATE }
    );

    // Keep Supabase Auth in sync on email changes.
    const uid = String(existing.passwordHash || '').replace(/^supabase:/, '');
    if (body.email && body.email !== existing.email) {
        if (uid) {
            await supabaseAdmin.auth.admin
                .updateUserById(uid, { email: body.email })
                .catch((e) => console.warn('[teacher] Supabase email sync failed:', e.message));
        }
    }

    // Optional password reset — admin can set/replace the teacher's login
    // password from Edit Teacher. Blank = keep current. This is what lets the
    // teacher log in directly with admin-set credentials.
    if (body.password != null && String(body.password).trim() !== '') {
        if (String(body.password).length < 8) {
            throw new HttpError(422, 'Password must be at least 8 characters');
        }
        if (uid) {
            const { error } = await supabaseAdmin.auth.admin.updateUserById(uid, {
                password: String(body.password),
            });
            if (error) throw new HttpError(400, `Failed to update password: ${error.message}`);
        }
        // Email the teacher their new login details (best-effort; worker retries SMTP).
        try {
            const { subject, html } = passwordReset({
                name: body.name, email: body.email, password: body.password, loginUrl: env.mail?.lmsLoginUrl,
            });
            await enqueue({ to: body.email, subject, html });
        } catch (e) { console.warn('[teachers] password-reset email enqueue failed:', e.message); }
    }

    return (await get(id)).teacher;
};

const remove = async (id) => {
    const existing = await findById(id);
    if (!existing) throw new HttpError(404, 'Teacher not found');

    await authDb.query(`DELETE FROM users WHERE "userId" = :id`, {
        replacements: { id: String(id) },
        type: QueryTypes.DELETE,
    });
    if (existing.teacherPhoto) removeFile(existing.teacherPhoto);

    // Drop the Supabase Auth user so the email is freed for re-use.
    const uid = String(existing.passwordHash || '').replace(/^supabase:/, '');
    if (uid) {
        await supabaseAdmin.auth.admin
            .deleteUser(uid)
            .catch((e) => console.warn('[teacher] Supabase delete failed:', e.message));
    }

    return { message: 'Teacher deleted successfully' };
};

module.exports = { list, get, create, update, remove };
