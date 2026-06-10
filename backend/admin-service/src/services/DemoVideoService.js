const demoRepo = require('../repositories/DemoVideoRepository');
const { DemoVideo } = require('../models');
const { upload, removeFile, niceFileName } = require('../helpers/fileUploader');
const { HttpError } = require('../middlewares/error');

const PER_PAGE = 10;

const toBool = (v) => v === true || v === 1 || v === '1' || v === 'true';

// Upload an incoming file (video → Bunny, image → R2) and return the stored
// public URL + detected media type. Mirrors GalleryService.handleUpload.
const handleUpload = async (file, title) => {
    const ext = (file.originalname.split('.').pop() || 'mp4').toLowerCase();
    const isVideo = (file.mimetype || '').startsWith('video/');
    const folder = isVideo ? 'demo/videos' : 'demo/images';
    const destPath = `uploads/${folder}/${niceFileName(title || 'demo', ext)}`;
    const url = await upload(file, destPath, isVideo ? null : 1280, isVideo ? null : 720);
    return { media_url: url, media_type: isVideo ? 'video' : 'image' };
};

// When marking a video as the intro, clear the flag on every other row so
// there's only ever one intro video.
const clearOtherIntros = async (exceptId) => {
    try {
        const where = exceptId ? { id: { [require('sequelize').Op.ne]: exceptId } } : {};
        await DemoVideo.update({ is_intro: false }, { where });
    } catch (e) { console.warn('[demo-videos] clear intro failed:', e.message); }
};

const list = async ({ page = 1, search } = {}) => {
    const limit = PER_PAGE;
    const offset = (Number(page) - 1) * limit;
    try {
        const { count, rows } = await demoRepo.paginate({ search, limit, offset });
        return {
            demo_videos: {
                data: rows,
                total: count,
                per_page: limit,
                current_page: Number(page),
                last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        console.warn('[demo-videos] DB query failed:', err.message);
        return { demo_videos: { data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1 } };
    }
};

const listPublic = async () => {
    try {
        const rows = await demoRepo.listPublic();
        return rows.map((r) => r.toJSON());
    } catch (err) {
        console.warn('[demo-videos] public query failed:', err.message);
        return [];
    }
};

const get = async (id) => {
    const item = await demoRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Demo video not found.');
    return { item };
};

const create = async ({ body, file }) => {
    if (!body.title || !String(body.title).trim()) throw new HttpError(422, 'Title is required');
    const data = {
        title: String(body.title).trim(),
        description: body.description ? String(body.description).trim() : null,
        is_intro: toBool(body.is_intro),
        sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
        status: body.status === '0' || body.status === 0 ? 0 : 1,
        media_type: 'video',
        media_url: null,
    };
    if (file) {
        const up = await handleUpload(file, data.title);
        data.media_url = up.media_url;
        data.media_type = up.media_type;
    }
    const item = await demoRepo.create(data);
    if (data.is_intro) await clearOtherIntros(item.id);
    return { success: 'Demo video saved successfully.', item };
};

const update = async ({ id, body, file }) => {
    const item = await demoRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Demo video not found.');

    const next = {
        title: body.title !== undefined ? String(body.title).trim() : item.title,
        description: body.description !== undefined
            ? (body.description ? String(body.description).trim() : null)
            : item.description,
        is_intro: body.is_intro !== undefined ? toBool(body.is_intro) : item.is_intro,
        sort_order: body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))
            ? Number(body.sort_order)
            : item.sort_order,
        status: body.status !== undefined
            ? (body.status === '0' || body.status === 0 ? 0 : 1)
            : item.status,
    };

    if (file) {
        if (item.media_url) { try { await removeFile(item.media_url); } catch (_e) { /* ignore */ } }
        const up = await handleUpload(file, next.title);
        next.media_url = up.media_url;
        next.media_type = up.media_type;
    }

    await item.update(next);
    if (next.is_intro) await clearOtherIntros(item.id);
    return { success: 'Demo video updated successfully.', item };
};

const remove = async (id) => {
    const item = await demoRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Demo video not found.');
    if (item.media_url) { try { await removeFile(item.media_url); } catch (_e) { /* ignore */ } }
    await item.destroy();
    return { success: 'Demo video deleted successfully.' };
};

const toggleStatus = async (id) => {
    const item = await demoRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Demo video not found.');
    await item.update({ status: item.status ? 0 : 1 });
    return { success: 'Status updated', item };
};

module.exports = { list, listPublic, get, create, update, remove, toggleStatus };
