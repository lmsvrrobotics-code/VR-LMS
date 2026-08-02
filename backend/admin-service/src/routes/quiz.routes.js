const joi = require('joi');
const router = require('express').Router();
const ctrl = require('../controllers/QuizController');
const { validateBody, validateParams, schemas } = require('../lib/validators');

// Quiz
router.post('/quiz', validateBody(schemas.createQuiz), ctrl.quiz_store);
router.post('/quiz/:id', validateParams(schemas.idParam), validateBody(schemas.updateQuiz), ctrl.quiz_update);
router.get('/quiz/:id', validateParams(schemas.idParam), ctrl.quiz_show);

// Questions
router.post('/question', validateBody(schemas.createQuestion), ctrl.question_store);
router.post('/question/:id', validateParams(schemas.idParam), validateBody(schemas.updateQuestion), ctrl.question_update);
router.delete('/question/:id', validateParams(schemas.idParam), ctrl.question_delete);
router.post('/question/sort', validateBody(joi.object({
  questions: joi.array().items(joi.object({ id: joi.number().required(), sort_order: joi.number().required() })).required(),
})), ctrl.question_sort);

// Results
router.get('/quiz/:quiz_id/participants', validateParams(joi.object({ quiz_id: schemas.idParam.extract('id') })), ctrl.quiz_participants);
router.get('/quiz/:quiz_id/attempts/:user_id', validateParams(joi.object({ quiz_id: schemas.idParam.extract('id'), user_id: schemas.idParam.extract('id') })), ctrl.quiz_attempts);
router.get('/quiz-submission/:submission_id', validateParams(joi.object({ submission_id: schemas.idParam.extract('id') })), ctrl.quiz_attempt_detail);

module.exports = router;
