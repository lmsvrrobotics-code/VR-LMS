const router = require('express').Router();
const ctrl = require('../controllers/CouponController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

router.get('/coupons', ctrl.index);
router.get('/coupon/edit/:id', validateParams(schemas.idParam), ctrl.show);
router.post('/coupon/store', validateBody(schemas.createCoupon), ctrl.store);
router.post('/coupon/update/:id', validateParams(schemas.idParam), validateBody(schemas.updateCoupon), ctrl.update);
router.delete('/coupon/delete/:id', validateParams(schemas.idParam), ctrl.delete);
router.get('/coupon/status/:id', validateParams(schemas.idParam), ctrl.status);

module.exports = router;
