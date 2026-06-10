const locationRepo = require('../repositories/LocationRepository');
const { HttpError } = require('../middlewares/error');

const PER_PAGE = 10;

// Normalise the admin form body into a clean DB row. Shared by create/update.
const sanitize = (body, fallback = {}) => {
    const str = (v, def = null) => (v !== undefined ? (v ? String(v).trim() : null) : def);
    const flag = (v, def) => (v !== undefined ? (v === '1' || v === 1 || v === true ? 1 : 0) : def);
    return {
        name: body.name !== undefined ? String(body.name).trim() : fallback.name,
        city: str(body.city, fallback.city),
        state: str(body.state, fallback.state),
        pin: str(body.pin, fallback.pin),
        photo_url: str(body.photo_url, fallback.photo_url),
        map_url: str(body.map_url, fallback.map_url),
        is_new: flag(body.is_new, fallback.is_new ?? 0),
        sort_order: body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))
            ? Number(body.sort_order)
            : (fallback.sort_order ?? 0),
        status: flag(body.status, fallback.status ?? 1),
    };
};

const list = async ({ page = 1, search } = {}) => {
    const limit = PER_PAGE;
    const offset = (Number(page) - 1) * limit;
    try {
        const { count, rows } = await locationRepo.paginate({ search, limit, offset });
        return {
            locations: {
                data: rows,
                total: count,
                per_page: limit,
                current_page: Number(page),
                last_page: Math.max(1, Math.ceil(count / limit)),
            },
        };
    } catch (err) {
        console.warn('[locations] DB query failed:', err.message);
        return { locations: { data: [], total: 0, per_page: limit, current_page: Number(page), last_page: 1 } };
    }
};

const listPublic = async () => {
    try {
        const rows = await locationRepo.listPublic();
        return rows.map((r) => r.toJSON());
    } catch (err) {
        console.warn('[locations] public query failed:', err.message);
        return [];
    }
};

const get = async (id) => {
    const item = await locationRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Location not found.');
    return { item };
};

const create = async ({ body }) => {
    if (!body.name || !String(body.name).trim()) {
        throw new HttpError(422, 'Centre name is required');
    }
    const item = await locationRepo.create(sanitize(body));
    return { success: 'Location created successfully.', item };
};

const update = async ({ id, body }) => {
    const item = await locationRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Location not found.');
    await item.update(sanitize(body, item.toJSON()));
    return { success: 'Location updated successfully.', item };
};

const remove = async (id) => {
    const item = await locationRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Location not found.');
    await item.destroy();
    return { success: 'Location deleted successfully.' };
};

const toggleStatus = async (id) => {
    const item = await locationRepo.findOne({ id });
    if (!item) throw new HttpError(404, 'Location not found.');
    await item.update({ status: item.status ? 0 : 1 });
    return { success: 'Status updated', item };
};

module.exports = { list, listPublic, get, create, update, remove, toggleStatus };
