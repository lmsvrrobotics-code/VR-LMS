const router = require('express').Router();
const ctrl = require('../controllers/DemoController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

router.get('/demos', ctrl.index);
router.get('/demos/edit/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/demos/store', validateBody(schemas.createDemo), ctrl.store);
router.post('/demos/update/:id', validateParams(schemas.idParam), validateBody(schemas.updateDemo), ctrl.update);
router.delete('/demos/delete/:id', validateParams(schemas.idParam), ctrl.delete);
router.get('/demos/status/:id', validateParams(schemas.idParam), ctrl.status);

module.exports = router;
