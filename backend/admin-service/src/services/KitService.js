const kitRepo = require('../repositories/KitRepository');
const { upload, removeFile, niceFileName } = require('../helpers/fileUploader');
const { HttpError } = require('../middlewares/error');

const PER_PAGE = 10;

// Upload an incoming cover image (→ R2) and return the stored public URL.
const handleUpload = async (file, title) => {
    const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const destPath = `uploads/kits/covers/${niceFileName(title || 'kit', ext)}`;
    const url = await upload(file, destPath, 1280, 720);
    return { cover_url: url };
};

const list = async ({ page = 1, search } = {}) => {
    const limit = PER_PAGE;
    const offset = (Number(page) - 1) * limit;
    try {
        const { count, rows } = await kitRepo.paginate({ search, limit, offset });
        return {
            kits: {
                data: rows,
                total: count,
                per_page: limit,
                current_page: Number(page),
                last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        console.warn('[kits] DB query failed:', err.message);
        return { kits: { data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1 } };
    }
};

const listPublic = async () => {
    try {
        const rows = await kitRepo.listPublic();
        return rows.map((r) => r.toJSON());
    } catch (err) {
        console.warn('[kits] public query failed:', err.message);
        return [];
    }
};

const get = async (id) => {
    const item = await kitRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Kit not found.');
    return { item };
};

const create = async ({ body, file }) => {
    if (!body.title || !String(body.title).trim()) {
        throw new HttpError(422, 'Title is required');
    }
    const data = {
        title: String(body.title).trim(),
        subtitle: body.subtitle ? String(body.subtitle).trim() : null,
        description: body.description ? String(body.description).trim() : null,
        price: Number.isFinite(Number(body.price)) ? Number(body.price) : 0,
        buy_url: body.buy_url ? String(body.buy_url).trim() : null,
        sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
        status: body.status === '0' || body.status === 0 ? 0 : 1,
        cover_url: null,
    };
    if (file) {
        const up = await handleUpload(file, data.title);
        data.cover_url = up.cover_url;
    }
    const item = await kitRepo.create(data);
    return { success: 'Kit created successfully.', item };
};

const update = async ({ id, body, file }) => {
    const item = await kitRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Kit not found.');

    const next = {
        title: body.title !== undefined ? String(body.title).trim() : item.title,
        subtitle: body.subtitle !== undefined
            ? (body.subtitle ? String(body.subtitle).trim() : null)
            : item.subtitle,
        description: body.description !== undefined
            ? (body.description ? String(body.description).trim() : null)
            : item.description,
        price: body.price !== undefined && Number.isFinite(Number(body.price))
            ? Number(body.price)
            : item.price,
        buy_url: body.buy_url !== undefined
            ? (body.buy_url ? String(body.buy_url).trim() : null)
            : item.buy_url,
        sort_order: body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))
            ? Number(body.sort_order)
            : item.sort_order,
        status: body.status !== undefined
            ? (body.status === '0' || body.status === 0 ? 0 : 1)
            : item.status,
    };

    if (file) {
        if (item.cover_url) { try { await removeFile(item.cover_url); } catch (_e) { /* ignore */ } }
        const up = await handleUpload(file, next.title);
        next.cover_url = up.cover_url;
    }

    await item.update(next);
    return { success: 'Kit updated successfully.', item };
};

const remove = async (id) => {
    const item = await kitRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Kit not found.');
    if (item.cover_url) { try { await removeFile(item.cover_url); } catch (_e) { /* ignore */ } }
    await item.destroy();
    return { success: 'Kit deleted successfully.' };
};

const toggleStatus = async (id) => {
    const item = await kitRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Kit not found.');
    await item.update({ status: item.status ? 0 : 1 });
    return { success: 'Status updated', item };
};

module.exports = { list, listPublic, get, create, update, remove, toggleStatus };
