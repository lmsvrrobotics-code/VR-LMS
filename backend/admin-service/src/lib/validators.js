/**
 * Centralized input validation using joi
 * Import: const { validateBatch, validateCourse, ... } = require('./lib/validators');
 * Usage: const { error, value } = validateCourse(req.body);
 */

const joi = require('joi');

// Reusable field schemas
const fields = {
  id: joi.number().integer().positive().required(),
  idOptional: joi.number().integer().positive().allow(null),
  email: joi.string().email().lowercase().trim().required(),
  emailOptional: joi.string().email().lowercase().trim().allow(null),
  string: (min = 1, max = 255) => joi.string().trim().min(min).max(max),
  stringOptional: (min = 1, max = 255) => joi.string().trim().min(min).max(max).allow(null, ''),
  slug: joi.string().lowercase().pattern(/^[a-z0-9-]+$/).required(),
  url: joi.string().uri().required(),
  urlOptional: joi.string().uri().allow(null, ''),
  date: joi.date().iso().required(),
  dateOptional: joi.date().iso().allow(null),
  boolean: joi.boolean(),
  enum: (values) => joi.string().valid(...values).required(),
  enumOptional: (values) => joi.string().valid(...values).allow(null),
  integer: joi.number().integer(),
  integerPositive: joi.number().integer().positive(),
  score: joi.number().min(0).max(100),
};

// Validation schemas for critical endpoints
const schemas = {
  // Courses
  createCourse: joi.object({
    name: fields.string(2, 100).required(),
    slug: fields.slug,
    description: fields.stringOptional(0, 1000),
    category_id: fields.idOptional,
    thumbnail_url: fields.urlOptional,
    is_published: fields.boolean,
    is_marketing: fields.boolean,
    price: joi.number().min(0).allow(null),
  }),

  updateCourse: joi.object({
    id: fields.id,
    name: fields.stringOptional(2, 100),
    description: fields.stringOptional(0, 1000),
    is_published: fields.boolean,
    is_marketing: fields.boolean,
    price: joi.number().min(0).allow(null),
  }),

  // Batches
  createBatch: joi.object({
    name: fields.string(2, 100).required(),
    course_id: fields.id,
    start_date: fields.dateOptional,
    end_date: fields.dateOptional,
    max_students: fields.integerPositive.allow(null),
  }),

  // Assignments
  createAssignment: joi.object({
    batch_id: fields.id,
    course_id: fields.id,
    title: fields.string(2, 200).required(),
    description: fields.stringOptional(0, 2000),
    due_date: fields.dateOptional,
    max_score: fields.integerPositive,
  }),

  submitAssignment: joi.object({
    assignment_id: fields.id,
    submission_text: fields.stringOptional(0, 5000),
    file_url: fields.urlOptional,
  }),

  gradeSubmission: joi.object({
    submission_id: fields.id,
    score: fields.score.required(),
    feedback: fields.stringOptional(0, 1000),
  }),

  // Quizzes
  createQuiz: joi.object({
    title: fields.string(2, 200).required(),
    course_id: fields.id,
    description: fields.stringOptional(0, 2000),
    total_questions: fields.integerPositive.required(),
    passing_score: fields.score,
  }),

  submitQuizAnswer: joi.object({
    quiz_id: fields.id,
    question_id: fields.id,
    answer: joi.alternatives().try(
      joi.string().max(1000),
      joi.number(),
      joi.array().items(joi.string().max(100))
    ).required(),
  }),

  // Feedback Forms
  createFeedbackForm: joi.object({
    title: fields.string(2, 200).required(),
    description: fields.stringOptional(0, 1000),
    questions: joi.array().items(joi.object({
      label: fields.string(2, 200).required(),
      type: fields.enum(['rating', 'text', 'mcq', 'yesno']),
      options: joi.array().items(joi.string().max(100)).when('type', {
        is: 'mcq',
        then: joi.required(),
        otherwise: joi.optional(),
      }),
    })).min(1).required(),
  }),

  submitFeedbackForm: joi.object({
    form_id: fields.id,
    responses: joi.object().required(), // { question_id: answer_value, ... }
  }),

  // Profile
  updateProfile: joi.object({
    first_name: fields.stringOptional(1, 50),
    last_name: fields.stringOptional(1, 50),
    phone: joi.string().pattern(/^\d{10,15}$/).optional(),
    bio: fields.stringOptional(0, 500),
    profile_photo_url: fields.urlOptional,
  }),

  // Payments
  createPaymentOrder: joi.object({
    course_id: fields.id,
    amount: fields.integerPositive.required(),
    currency: fields.enum(['INR', 'USD']).required(),
  }),

  // Gallery
  createGalleryItem: joi.object({
    title: fields.string(2, 200).required(),
    description: fields.stringOptional(0, 1000),
    image_url: fields.url,
    category: fields.stringOptional(1, 100),
  }),

  // Contact/Leads
  submitContactForm: joi.object({
    name: fields.string(2, 100).required(),
    email: fields.email,
    phone: joi.string().pattern(/^\d{10,15}$/).optional(),
    message: fields.string(10, 2000).required(),
  }),

  // Dynamic Feedback
  submitDynamicFeedback: joi.object({
    form_id: fields.id,
    student_id: fields.id,
    responses: joi.object().pattern(
      joi.string(),
      joi.alternatives().try(joi.string(), joi.number(), joi.boolean())
    ).required(),
  }),
};

/**
 * Validate request body against a schema
 * @param {Object} data - The data to validate
 * @param {joi.Schema} schema - The joi schema
 * @returns {Object} - { error, value } where error is null if valid
 */
function validate(data, schema) {
  return schema.validate(data, {
    stripUnknown: true, // Remove unknown fields
    abortEarly: false, // Collect all errors, not just the first
  });
}

/**
 * Middleware factory to validate request body
 * Usage: router.post('/courses', validateBody(schemas.createCourse), controller.create);
 */
function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = validate(req.body, schema);
    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return res.status(400).json({
        error: 'Validation failed',
        details,
      });
    }
    req.validatedBody = value;
    next();
  };
}

/**
 * Middleware factory to validate request query
 * Usage: router.get('/courses', validateQuery(schemas.listCourses), controller.list);
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = validate(req.query, schema);
    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return res.status(400).json({
        error: 'Query validation failed',
        details,
      });
    }
    req.validatedQuery = value;
    next();
  };
}

/**
 * Middleware factory to validate request params
 * Usage: router.get('/courses/:id', validateParams(schemas.getCourse), controller.get);
 */
function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = validate(req.params, schema);
    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return res.status(400).json({
        error: 'Parameter validation failed',
        details,
      });
    }
    req.validatedParams = value;
    next();
  };
}

module.exports = {
  schemas,
  validate,
  validateBody,
  validateQuery,
  validateParams,
  fields,
};
