// Cloudflare R2 storage adapter.
//
// R2 is S3-compatible — we use @aws-sdk/client-s3 against R2's endpoint
// (https://<account-id>.r2.cloudflarestorage.com). All non-video assets
// (images, PDFs, thumbnails, attachments, certificates, exports) live here.
// Videos go to Bunny Stream — see BunnyStream.js.
//
// DB columns store the PUBLIC URL (or relative key under R2_PUBLIC_URL) so
// the frontend can render them directly. We never expose R2 keys/secrets
// to the browser.

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('../config/env');

let s3 = null;
function getClient() {
    if (s3) return s3;
    if (!env.r2.accountId || !env.r2.accessKeyId || !env.r2.secretAccessKey) {
        throw new Error('R2 not configured: missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY');
    }
    s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId:     env.r2.accessKeyId,
            secretAccessKey: env.r2.secretAccessKey,
        },
    });
    return s3;
}

// Build the public URL for a stored key. R2_PUBLIC_URL is your worker /
// custom domain that fronts the bucket — e.g. https://assets.yagnatech.org
// or https://pub-xxxx.r2.dev. The key is appended verbatim.
function publicUrlFor(key) {
    const base = (env.r2.publicUrl || '').replace(/\/$/, '');
    if (!base) {
        // Fall back to a signed URL caller can use until the public domain
        // is set up — kept here so missing R2_PUBLIC_URL doesn't break
        // local-dev uploads.
        return null;
    }
    return `${base}/${key.replace(/^\//, '')}`;
}

// Upload a local file (typically Multer's tmp path) to R2 under `key`.
// Optional `resize` resizes images to width x height using cover-fit before
// upload (mirrors the old fileUploader.js behavior for avatars/thumbnails).
async function uploadFile(file, key, { resize = null, contentType = null } = {}) {
    if (!file?.path) throw new Error('uploadFile: file.path is required');
    if (!env.r2.bucket) throw new Error('uploadFile: R2_BUCKET_NAME not configured');

    let body;
    let cleanupPath = file.path;
    let resolvedType = contentType || file.mimetype || 'application/octet-stream';

    if (resize && (resize.width || resize.height)) {
        const buf = await sharp(file.path)
            .resize(resize.width || null, resize.height || null, { fit: 'cover' })
            .toBuffer();
        body = buf;
    } else {
        body = fs.createReadStream(file.path);
    }

    try {
        await getClient().send(new PutObjectCommand({
            Bucket: env.r2.bucket,
            Key: key,
            Body: body,
            ContentType: resolvedType,
        }));
    } finally {
        if (cleanupPath && fs.existsSync(cleanupPath)) {
            try { fs.unlinkSync(cleanupPath); } catch (_) { /* ignore */ }
        }
    }

    return {
        key,
        url: publicUrlFor(key),
        bucket: env.r2.bucket,
    };
}

// Direct buffer upload — used for generated artifacts (PDF certificates,
// CSV exports) that don't go through Multer.
async function uploadBuffer(buffer, key, contentType = 'application/octet-stream') {
    if (!env.r2.bucket) throw new Error('uploadBuffer: R2_BUCKET_NAME not configured');
    await getClient().send(new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    }));
    return { key, url: publicUrlFor(key), bucket: env.r2.bucket };
}

async function deleteFile(key) {
    if (!key || !env.r2.bucket) return;
    try {
        await getClient().send(new DeleteObjectCommand({
            Bucket: env.r2.bucket,
            Key: key,
        }));
    } catch (e) {
        // Non-fatal — caller is usually best-effort cleanup on update/delete.
        console.warn('[r2] delete failed:', e.message);
    }
}

// Short-lived signed GET URL for keys that aren't fronted by a public
// domain (e.g. private certificates, admin exports). Caller renders the
// URL in an anchor; the link works for `expiresIn` seconds.
async function signedGetUrl(key, expiresIn = 3600) {
    const cmd = new (require('@aws-sdk/client-s3').GetObjectCommand)({
        Bucket: env.r2.bucket,
        Key: key,
    });
    return getSignedUrl(getClient(), cmd, { expiresIn });
}

// Slug-style key builder: <prefix>/<slug>-<timestamp>.<ext>
// Mirrors helpers/fileUploader.js niceFileName so callers can swap with
// minimal churn.
function buildKey(prefix, title, ext) {
    const slug = String(title || 'file')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const cleanPrefix = String(prefix || '').replace(/^\/|\/$/g, '');
    return `${cleanPrefix}/${slug}-${Date.now()}.${ext}`;
}

// List object keys under a prefix (paginated). Used by the DB backup job to
// find existing backup dates for pruning / "did today run already" checks.
async function listKeys(prefix) {
    const out = [];
    let token;
    do {
        const res = await getClient().send(new ListObjectsV2Command({
            Bucket: env.r2.bucket,
            Prefix: prefix,
            ContinuationToken: token,
        }));
        for (const o of res.Contents || []) {
            out.push({ key: o.Key, size: o.Size, lastModified: o.LastModified });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
}

module.exports = {
    uploadFile,
    uploadBuffer,
    deleteFile,
    signedGetUrl,
    buildKey,
    publicUrlFor,
    listKeys,
};
