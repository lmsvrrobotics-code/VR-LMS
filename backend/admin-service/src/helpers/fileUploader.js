// File upload adapter — facade preserved so existing call sites
// (StudentService, TeacherService, CategoryService, CourseService, …)
// don't need code changes when the storage backend swaps.
//
// Routing rule:
//   - Video files (mimetype.startsWith('video/'))  → Bunny Stream
//   - Everything else (images, PDFs, attachments)  → Cloudflare R2
//
// DB stays the same: callers pass a relative `destPath` like
// `uploads/users/student/foo.jpg`. We use that as the R2 key (without the
// leading "uploads/" namespace) and persist the resulting public URL
// (or the key if no public URL is configured) so the frontend reads work
// without any controller change.
//
// `removeFile(stored)` deletes by R2 key if it looks like a key; falls back
// to local-disk delete for any legacy on-prem path still recorded in DB.

const fs   = require('fs');
const path = require('path');
const env  = require('../config/env');
const r2   = require('../services/R2Storage');
const bunny = require('../services/BunnyStream');

// Resolve a caller-supplied destPath into an R2 key. We strip a leading
// "uploads/" prefix so the R2 bucket layout doesn't duplicate that segment.
const toR2Key = (destPath) =>
    String(destPath || '').replace(/^\/?uploads\//, '').replace(/^\//, '');

const niceFileName = (title, ext) => {
    const base = String(title || 'file')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${base}-${Date.now()}.${ext}`;
};

// Main upload entrypoint used by every service. Returns the value to PERSIST
// in DB — that's the public R2 URL when env.r2.publicUrl is set, otherwise
// the R2 key (so the legacy `uploads/...` path still resolves on the
// frontend through the bastion / API).
// `opts.fit` is forwarded to sharp: 'cover' (default) crops to fill, while
// 'contain' letterboxes so the whole image survives the upload. See the note
// in R2Storage.uploadFile — cover-fit discards the cropped edges for good.
const upload = async (file, destPath, width = null, height = null, opts = {}) => {
    if (!file) return null;

    // Videos always go to Bunny Stream. Caller passes the desired display
    // title as destPath (the slug-based filename). We use that as the
    // Bunny video title.
    if (file.mimetype && file.mimetype.startsWith('video/')) {
        const title = path.basename(destPath || file.originalname || 'lesson', path.extname(destPath || ''));
        const created = await bunny.uploadVideoForTitle(title, file);
        // Persist the embed URL by convention so existing <iframe> code in
        // PublicCourseService keeps working without a controller change.
        return created.embedUrl || created.hlsUrl || `bunny:${created.guid}`;
    }

    // Everything else → R2 (images/PDFs/attachments).
    const key = toR2Key(destPath);
    const resize = (width || height)
        ? { width, height, ...(opts.fit ? { fit: opts.fit } : {}) }
        : null;
    const result = await r2.uploadFile(file, key, { resize });

    // Backwards-compatible return value: keep the same "uploads/..." path
    // shape when no public R2 domain is set so legacy frontend code that
    // prepends VITE_ADMIN_API_URL still resolves (you can front it with a
    // Bastion proxy until R2_PUBLIC_URL is configured).
    return result.url || `uploads/${result.key}`;
};

// Best-effort delete. Accepts either:
//   - R2 public URL  → strip prefix and DELETE the key
//   - "uploads/..."  → treat as R2 key (strip the uploads/ prefix)
//   - "bunny:<guid>" → delete the Bunny Stream video
//   - absolute path  → legacy local-disk file (still on disk during cutover)
const removeFile = async (stored) => {
    if (!stored) return;

    if (typeof stored === 'string' && stored.startsWith('bunny:')) {
        await bunny.deleteVideo(stored.slice(7));
        return;
    }

    if (typeof stored === 'string' && stored.includes('iframe.mediadelivery.net/embed/')) {
        // Recover GUID from a stored embed URL.
        const guid = stored.split('/embed/').pop().split('/').pop();
        if (guid) await bunny.deleteVideo(guid);
        return;
    }

    // Bunny HLS / thumbnail URL: https://{cdnHostname}/{guid}/playlist.m3u8
    // (this is what system-video lessons now persist). Recover the GUID from
    // the path segment after the CDN host and delete the Bunny video.
    const bunnyHost = String(env.bunnyStream?.cdnHostname || '').replace(/^https?:\/\//, '');
    if (bunnyHost && typeof stored === 'string' && stored.includes(bunnyHost)) {
        const after = stored.split(bunnyHost + '/')[1];
        const guid = after ? after.split('/')[0] : null;
        if (guid) await bunny.deleteVideo(guid);
        return;
    }

    // R2 path: figure out the key.
    let key = null;
    const publicBase = (env.r2.publicUrl || '').replace(/\/$/, '');
    if (publicBase && stored.startsWith(publicBase)) {
        key = stored.slice(publicBase.length + 1);
    } else if (stored.startsWith('uploads/')) {
        key = stored.slice('uploads/'.length);
    } else if (!/^https?:\/\//i.test(stored) && !path.isAbsolute(stored)) {
        // Plain relative path — treat as R2 key directly.
        key = stored;
    }

    if (key) {
        await r2.deleteFile(key);
        return;
    }

    // Legacy local-disk path during the migration window — fall through to
    // the on-disk unlink so existing rows still self-clean.
    try {
        const localFull = path.join(__dirname, '..', '..', stored);
        if (fs.existsSync(localFull)) fs.unlinkSync(localFull);
    } catch (_) {
        /* ignore */
    }
};

module.exports = {
    upload,
    removeFile,
    niceFileName,
    // ROOT was used by legacy callers to disk-resolve paths. Kept exported
    // as null so any `if (ROOT)` branch in older code short-circuits safely.
    ROOT: null,
};
