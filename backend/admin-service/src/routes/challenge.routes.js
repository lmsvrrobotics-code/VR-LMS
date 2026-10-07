const joi = require('joi');
const express = require('express');
const ctrl = require('../controllers/ChallengeController');
const { validateBody, validateParams } = require('../lib/validators');

/**
 * CHALLENGE lessons — two surfaces, two routers.
 *
 * They are split rather than sharing one router because they mount behind
 * DIFFERENT middleware in server.js: the student routes behind requireStudent,
 * the review routes behind adminOrTeacher. Mounting one router twice would give
 * students the review endpoints (or teachers the submit endpoint) depending on
 * which mount matched first.
 */

const lessonIdParam = joi.object({
    lessonId: joi.number().integer().positive().required(),
});
const idParam = joi.object({
    id: joi.number().integer().positive().required(),
});

// The URL is validated properly in the service (protocol allowlist); this is
// just a cheap shape/size gate so obvious junk never reaches it.
const submitBody = joi.object({
    submission_url: joi.string().trim().max(2000).required(),
    submission_note: joi.string().trim().max(2000).allow('', null),
});

// Every challenge is marked out of 100 (see ChallengeService.MAX_SCORE).
// Bounded here as well as in the service and the DB CHECK, so a bad mark is
// rejected at the edge rather than surfacing as a 500 from Postgres.
const markBody = joi.object({
    score: joi.number().integer().min(0).max(100).required(),
    feedback: joi.string().trim().max(4000).allow('', null),
});

// ---- Student surface (mounted behind requireStudent) ----------------------
const studentRouter = express.Router();

// Every challenge the student can reach, with their own submission attached —
// the dashboard's Challenges tab. Declared ABOVE '/challenges/:lessonId/...'
// so the literal 'mine' is not captured as a lessonId and rejected by the
// numeric param validator.
studentRouter.get('/challenges/mine', ctrl.listMine);

studentRouter.get(
    '/challenges/:lessonId/my-submission',
    validateParams(lessonIdParam),
    ctrl.mine,
);
studentRouter.post(
    '/challenges/:lessonId/submit',
    validateParams(lessonIdParam),
    validateBody(submitBody),
    ctrl.submit,
);

// ---- Teacher / admin surface (mounted behind adminOrTeacher) --------------
const reviewRouter = express.Router();

// Every submission across the courses this teacher teaches — the dashboard
// queue. Declared ABOVE '/challenges/:lessonId/...' so the literal 'queue' is
// not captured as a lessonId and rejected by the numeric param validator.
reviewRouter.get('/challenges/queue', ctrl.queue);

reviewRouter.get(
    '/challenges/:lessonId/submissions',
    validateParams(lessonIdParam),
    ctrl.list,
);
reviewRouter.post(
    '/challenges/submissions/:id/mark',
    validateParams(idParam),
    validateBody(markBody),
    ctrl.mark,
);

module.exports = { studentRouter, reviewRouter };
