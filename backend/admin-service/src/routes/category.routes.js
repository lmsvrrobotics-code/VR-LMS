const router = require('express').Router();
const ctrl = require('../controllers/CategoryController');
const upload = require('../middlewares/multer');
const { adminOnly, adminOrTeacher } = require('../middlewares/auth');
const { validateBody, validateParams, schemas } = require('../lib/validators');

const fields = upload.fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'category_logo', maxCount: 1 }]);

// Mounted via `app.use('/api/admin', auth, categoryRoutes)` — `auth` decodes
// the JWT, each route picks its own gate. The category LIST is read-only
// reference data the course-management screens need (filter dropdowns), so
// teachers may read it. Creating/editing/deleting categories stays
// admin-only.
router.get('/categories', adminOrTeacher, ctrl.index);
router.post('/category/store', adminOnly, validateBody(schemas.createCategory), fields, ctrl.store);
router.post('/category/update/:id', adminOnly, validateParams(schemas.idParam), validateBody(schemas.updateCategory), fields, ctrl.update);
router.delete('/category/delete/:id', adminOnly, validateParams(schemas.idParam), ctrl.delete);

module.exports = router;
