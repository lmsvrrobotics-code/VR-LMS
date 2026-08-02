const router = require('express').Router();
const ctrl = require('../controllers/LeadController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// Admin lead pipeline — mounted under /api/admin with adminOnly (see server.js).
// /leads/stats is declared before the :id routes so it isn't shadowed.
router.get('/leads', ctrl.list);
router.get('/leads/stats', ctrl.stats);
router.put('/leads/:id', validateParams(schemas.idParam), validateBody(schemas.updateLead), ctrl.update);
router.post('/leads/:id/convert', validateParams(schemas.idParam), validateBody(schemas.convertLead), ctrl.convert);
router.delete('/leads/:id', validateParams(schemas.idParam), ctrl.remove);

module.exports = router;
