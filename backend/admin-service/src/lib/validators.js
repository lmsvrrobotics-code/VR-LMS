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
  // NOTE: /course/store and /course/update send multipart/form-data, so every
  // value arrives as a STRING (numbers, booleans, ids). The controller reads
  // req.body directly (not req.validatedBody) and CourseService derives `slug`
  // from `title` — the client never sends `name`/`slug`. This schema's job is
  // just to enforce `title` and let the many optional builder fields through
  // (unknown keys are allowed so array-style fields like clgIds[]/faq_title,
  // requirements[], etc. reach the service untouched).
  createCourse: joi.object({
    title: fields.string(2, 200).required(),
    short_description: fields.stringOptional(0, 1000),
    description: fields.stringOptional(0, 20000),
    status: joi.string().allow(null, ''),
    level: joi.string().allow(null, ''),
    course_type: joi.string().allow(null, ''),
    language: joi.string().allow(null, ''),
    is_paid: joi.any(),
    price: joi.any(),
    discounted_price: joi.any(),
    is_marketing: joi.any(),
    has_certificate: joi.any(),
  }).unknown(true),

  updateCourse: joi.object({
    title: fields.stringOptional(2, 200),
    short_description: fields.stringOptional(0, 1000),
    description: fields.stringOptional(0, 20000),
    status: joi.string().allow(null, ''),
    level: joi.string().allow(null, ''),
    is_paid: joi.any(),
    price: joi.any(),
    discounted_price: joi.any(),
    is_marketing: joi.any(),
    has_certificate: joi.any(),
  }).unknown(true),

  // Batches
  // A batch is a named roster scoped to a college — courses are attached to it
  // separately (batch_courses), so there is no course_id here. Mirrors the Add
  // Batch form and BatchService.create; the service owns the semantic rules
  // (name required, duplicate-name-per-college, roster filtering).
  createBatch: joi.object({
    name: fields.string(2, 100).required(),
    description: fields.stringOptional(0, 2000),
    start_date: fields.dateOptional.allow(''),
    end_date: fields.dateOptional.allow(''),
    is_active: joi.any(),
    // Roster of student userIds. They're auth-service ids (11-digit strings),
    // NOT ints — accept both rather than coercing.
    userIds: joi.array().items(
      joi.alternatives().try(joi.string().max(64), joi.number()),
    ).optional(),
    // Teachers assigned to the batch. Same id shape as userIds. The service
    // enforces "at least one, and they must really be teachers" — keeping the
    // rule there means the 422 message matches the student-roster errors.
    teacherIds: joi.array().items(
      joi.alternatives().try(joi.string().max(64), joi.number()),
    ).optional(),
    // Optional course to attach to the batch on creation. OPTIONAL on purpose:
    // a required course_id here previously 400'd every create (see note below).
    // The service validates it exists and stores it on batches.course_id.
    courseId: joi.number().integer().positive().optional().allow(null, ''),
  }).unknown(true),

  // Assignments
  createAssignment: joi.object({
    batch_id: fields.id,
    course_id: fields.id,
    title: fields.string(2, 200).required(),
    description: fields.stringOptional(0, 2000),
    due_date: fields.dateOptional,
    max_score: fields.integerPositive,
  }),

  // assignment_id is NOT required in the body: it comes from the URL
  // (/assignments/:assignment_id/submit) and is checked by validateParams.
  // Requiring it here rejected every real submission with a 400, because the
  // student client sends only the answer itself.
  submitAssignment: joi.object({
    assignment_id: fields.id.optional(),
    submission_text: fields.stringOptional(0, 5000),
    file_url: fields.urlOptional,
  }),

  gradeSubmission: joi.object({
    submission_id: fields.id,
    score: fields.score.required(),
    feedback: fields.stringOptional(0, 1000),
  }),

  // Quizzes
  // A curriculum quiz is defined by its marks/duration and the section it lives
  // in — questions are authored separately afterward (there is no
  // total_questions/passing_score up front). This schema mirrors the fields the
  // admin QuizForm sends and QuizService.createQuiz consumes; the service does
  // the semantic checks (section required, pass_mark <= total_mark). unknown:true
  // lets any extra builder fields through untouched.
  createQuiz: joi.object({
    title: fields.string(2, 200).required(),
    course_id: fields.id,
    section: joi.alternatives().try(joi.number().integer().positive(), joi.string()).required(),
    total_mark: joi.number().integer().min(1).required(),
    pass_mark: joi.number().integer().min(0).required(),
    retake: joi.number().integer().min(0).required(),
    hour: joi.number().integer().min(0).allow(null, ''),
    minute: joi.number().integer().min(0).allow(null, ''),
    second: joi.number().integer().min(0).allow(null, ''),
    description: fields.stringOptional(0, 2000),
  }).unknown(true),

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

  // Auth
  adminLogin: joi.object({
    email: fields.email,
    password: joi.string().min(6).required(),
  }),

  // Admin management
  createAdmin: joi.object({
    name: fields.string(2, 100).required(),
    email: fields.email,
    phone: joi.string().pattern(/^\d{10,15}$/).optional(),
  }),

  updateAdmin: joi.object({
    name: fields.stringOptional(2, 100),
    email: fields.emailOptional,
    phone: joi.string().pattern(/^\d{10,15}$/).optional(),
  }),

  // Category
  createCategory: joi.object({
    name: fields.string(2, 100).required(),
    description: fields.stringOptional(0, 500),
  }),

  updateCategory: joi.object({
    name: fields.stringOptional(2, 100),
    description: fields.stringOptional(0, 500),
  }),

  // Batch — createBatch is defined once above (mirrors the Add Batch form).
  // The stale duplicate that lived here required a course_id the batch feature
  // has never had and, being the later key, silently shadowed the correct
  // schema — every batch create 400'd with `"course_id" is required`. Removed.
  updateBatch: joi.object({
    name: fields.stringOptional(2, 100),
    description: fields.stringOptional(0, 2000),
    start_date: fields.dateOptional.allow(''),
    end_date: fields.dateOptional.allow(''),
    is_active: joi.any(),
  }).unknown(true),

  // Batch member operations
  // The client (and BatchService.addMembers) speak `userIds`, not `student_ids`,
  // and the values are auth-service userIds — 11-digit STRINGS that overflow a
  // 32-bit int, so fields.id would reject every real student.
  addBatchMembers: joi.object({
    userIds: joi.array().items(
      joi.alternatives().try(joi.string().max(64), joi.number()),
    ).required(),
  }).unknown(true),

  // Same id shape as addBatchMembers. The service accepts teacherIds (or
  // userIds as a fallback) and enforces that they really are teachers.
  addBatchTeachers: joi.object({
    teacherIds: joi.array().items(
      joi.alternatives().try(joi.string().max(64), joi.number()),
    ).required(),
  }).unknown(true),

  // Quiz — createQuiz is defined once above (mirrors the admin QuizForm /
  // QuizService fields). The stale duplicate that lived here required
  // total_questions/passing_score and, being the later key, silently shadowed
  // the correct schema — every quiz create 400'd. Removed.
  updateQuiz: joi.object({
    title: fields.stringOptional(2, 200),
    course_id: fields.idOptional,
    section: joi.alternatives().try(joi.number().integer().positive(), joi.string()),
    total_mark: joi.number().integer().min(1),
    pass_mark: joi.number().integer().min(0),
    retake: joi.number().integer().min(0),
    hour: joi.number().integer().min(0).allow(null, ''),
    minute: joi.number().integer().min(0).allow(null, ''),
    second: joi.number().integer().min(0).allow(null, ''),
    description: fields.stringOptional(0, 2000),
  }).unknown(true),

  // Question
  // Mirrors the admin QuestionForm / QuizService.createQuestion contract: the
  // question text is `title`, the type is mcq|fill_blanks|true_false, and
  // `answer` is an array (mcq / fill_blanks) or a string (true_false). The
  // service enforces the semantic rules (answer required; mcq needs options).
  createQuestion: joi.object({
    quiz_id: fields.id,
    title: fields.string(1, 1000).required(),
    type: fields.enum(['mcq', 'fill_blanks', 'true_false']),
    options: joi.array().items(joi.string().allow('').max(500)).optional(),
    answer: joi.alternatives().try(
      joi.array().items(joi.string().allow('').max(1000)),
      joi.string().max(1000),
      joi.number(),
    ).optional(),
  }).unknown(true),

  updateQuestion: joi.object({
    title: fields.stringOptional(1, 1000),
    type: fields.enumOptional(['mcq', 'fill_blanks', 'true_false']),
    options: joi.array().items(joi.string().allow('').max(500)).optional(),
    answer: joi.alternatives().try(
      joi.array().items(joi.string().allow('').max(1000)),
      joi.string().max(1000),
      joi.number(),
    ).optional(),
  }).unknown(true),

  // Common param validators
  idParam: joi.object({
    id: fields.id,
  }),

  typeAndIdParams: joi.object({
    type: fields.string(1, 50).required(),
    id: fields.id,
  }),

  // Generic schemas for common patterns
  createWithName: joi.object({
    name: fields.string(2, 100).required(),
  }),

  updateWithName: joi.object({
    name: fields.stringOptional(2, 100),
  }),

  createWithTitle: joi.object({
    title: fields.string(2, 200).required(),
  }),

  updateWithTitle: joi.object({
    title: fields.stringOptional(2, 200),
  }),

  // Student management
  createStudent: joi.object({
    name: fields.string(2, 100).required(),
    email: fields.email,
    phone: joi.string().pattern(/^\d{10,15}$/).optional(),
    enrollment_number: fields.stringOptional(1, 50),
  }),

  updateStudent: joi.object({
    name: fields.stringOptional(2, 100),
    email: fields.emailOptional,
    phone: joi.string().pattern(/^\d{10,15}$/).optional(),
    enrollment_number: fields.stringOptional(1, 50),
  }),

  // Teacher management
  // Every field the admin Teacher form posts must be declared here: validate()
  // runs with stripUnknown, so anything omitted is silently dropped before the
  // service sees it (an undeclared `password` would break login creation).
  createTeacher: joi.object({
    name: fields.string(2, 100).required(),
    email: fields.email,
    password: joi.string().min(8).required(),
    phone: joi.string().pattern(/^\d{10,15}$/).optional(),
    expertise: fields.stringOptional(0, 255),
    bio: fields.stringOptional(0, 2000),
    yearsOfExperience: joi.number().integer().min(0).max(80).optional(),
    // Free-text input with no scheme enforcement in the UI, so a bare
    // "linkedin.com/in/x" must not 400 on an otherwise-optional field.
    linkedinUrl: joi.string().trim().max(255).allow(null, ''),
    address: fields.stringOptional(0, 500),
  }),

  updateTeacher: joi.object({
    name: fields.stringOptional(2, 100),
    email: fields.emailOptional,
    // Blank/absent = keep the current password (see TeacherService.update).
    password: joi.string().min(8).allow('').optional(),
    phone: joi.string().pattern(/^\d{10,15}$/).optional(),
    expertise: fields.stringOptional(0, 255),
    bio: fields.stringOptional(0, 2000),
    yearsOfExperience: joi.number().integer().min(0).max(80).optional(),
    // Free-text input with no scheme enforcement in the UI, so a bare
    // "linkedin.com/in/x" must not 400 on an otherwise-optional field.
    linkedinUrl: joi.string().trim().max(255).allow(null, ''),
    address: fields.stringOptional(0, 500),
  }),

  // Assignment
  createAssignment: joi.object({
    batch_id: fields.id,
    course_id: fields.id,
    title: fields.string(2, 200).required(),
    description: fields.stringOptional(0, 2000),
    due_date: fields.dateOptional,
    max_score: fields.integerPositive,
  }),

  // assignment_id is NOT required in the body: it comes from the URL
  // (/assignments/:assignment_id/submit) and is checked by validateParams.
  // Requiring it here rejected every real submission with a 400, because the
  // student client sends only the answer itself.
  submitAssignment: joi.object({
    assignment_id: fields.id.optional(),
    submission_text: fields.stringOptional(0, 5000),
    file_url: fields.urlOptional,
  }),

  // Leads
  updateLead: joi.object({
    status: fields.enumOptional(['new', 'contacted', 'qualified', 'converted']),
    notes: fields.stringOptional(0, 2000),
  }),

  // password is REQUIRED only when the lead has no account yet; a self-signup
  // already has a login and converting merely links it (see LeadService.convert),
  // so it stays optional here and the service enforces the rule it needs. It MUST
  // be declared: validate() runs with stripUnknown, so an undeclared password is
  // dropped from validatedBody — today convert() only still works because the
  // controller happens to read raw req.body.
  convertLead: joi.object({
    student_email: fields.emailOptional,
    student_name: fields.stringOptional(2, 100),
    password: joi.string().min(8).optional(),
    collegeId: joi.string().allow(null, '').optional(),
  }),

  // Gallery, Book, Kit (generic CRUD)
  createGalleryItem: joi.object({
    title: fields.string(2, 200).required(),
    description: fields.stringOptional(0, 1000),
    category: fields.stringOptional(1, 100),
    is_visible: joi.boolean(),
  }),

  updateGalleryItem: joi.object({
    title: fields.stringOptional(2, 200),
    description: fields.stringOptional(0, 1000),
    category: fields.stringOptional(1, 100),
    is_visible: joi.boolean(),
  }),

  createBook: joi.object({
    title: fields.string(2, 200).required(),
    author: fields.stringOptional(2, 100),
    description: fields.stringOptional(0, 2000),
    price: joi.number().min(0).allow(null),
    is_visible: joi.boolean(),
  }),

  updateBook: joi.object({
    title: fields.stringOptional(2, 200),
    author: fields.stringOptional(2, 100),
    description: fields.stringOptional(0, 2000),
    price: joi.number().min(0).allow(null),
    is_visible: joi.boolean(),
  }),

  createKit: joi.object({
    title: fields.string(2, 200).required(),
    description: fields.stringOptional(0, 2000),
    price: joi.number().min(0).allow(null),
    is_visible: joi.boolean(),
  }),

  updateKit: joi.object({
    title: fields.stringOptional(2, 200),
    description: fields.stringOptional(0, 2000),
    price: joi.number().min(0).allow(null),
    is_visible: joi.boolean(),
  }),

  // Coupon
  createCoupon: joi.object({
    code: joi.string().uppercase().pattern(/^[A-Z0-9]{3,20}$/).required(),
    discount_percent: joi.number().integer().min(0).max(100).required(),
    max_uses: joi.number().integer().positive().allow(null),
    expiry_date: fields.dateOptional,
  }),

  updateCoupon: joi.object({
    code: joi.string().uppercase().pattern(/^[A-Z0-9]{3,20}$/).optional(),
    discount_percent: joi.number().integer().min(0).max(100),
    max_uses: joi.number().integer().positive().allow(null),
    expiry_date: fields.dateOptional,
  }),

  // Demos = scheduled demo classes: title + course + time window + teachers.
  // These were previously generic {name, description} stubs, which matched
  // neither the Demo model nor DemoService (both use `title` plus the schedule
  // fields). Because validate() runs with stripUnknown, that stub rejected every
  // create with `"name" is required` AND would have discarded course_id /
  // start_at / end_at / teacher_ids / meeting_link even if it had passed.
  // Keep these in sync with src/models/Demo.js.
  createDemo: joi.object({
    title: fields.string(2, 255).required(),
    course_id: fields.stringOptional(1, 64),
    start_at: fields.dateOptional,
    end_at: fields.dateOptional,
    // Teacher ids are auth-service user ids (strings), stored as a JSON array.
    // Accept a JSON/CSV string too — DemoService.toIdArray() handles both, and
    // multipart clients can't send a real array.
    teacher_ids: joi.alternatives()
      .try(joi.array().items(joi.string().trim().min(1)), joi.string().allow(''))
      .default([]),
    meeting_link: fields.urlOptional,
    // The form submits status as the string '0'/'1'; the model stores an int.
    status: joi.alternatives().try(joi.boolean(), joi.number().integer().min(0).max(1), joi.string().valid('0', '1')),
  }),
  updateDemo: joi.object({
    title: fields.stringOptional(2, 255),
    course_id: fields.stringOptional(1, 64),
    start_at: fields.dateOptional,
    end_at: fields.dateOptional,
    teacher_ids: joi.alternatives()
      .try(joi.array().items(joi.string().trim().min(1)), joi.string().allow('')),
    meeting_link: fields.urlOptional,
    status: joi.alternatives().try(joi.boolean(), joi.number().integer().min(0).max(1), joi.string().valid('0', '1')),
  }),

  createNotification: joi.object({ title: fields.string(2, 200).required(), message: fields.string(5, 2000).required() }),
  updateNotification: joi.object({ title: fields.stringOptional(2, 200), message: fields.stringOptional(5, 2000) }),

  // Locations = training centres. The previous stub allowed only {name, address};
  // `address` is not a column on the model at all, and because validate() runs
  // with stripUnknown every real field (city/state/pin/photo_url/map_url/
  // is_new/sort_order) was silently discarded before reaching LocationService.
  // Keep in sync with src/models/Location.js + LocationService.sanitize().
  createLocation: joi.object({
    name: fields.string(2, 100).required(),
    city: fields.stringOptional(1, 100),
    state: fields.stringOptional(1, 100),
    pin: fields.stringOptional(1, 20),
    photo_url: fields.urlOptional,
    map_url: fields.urlOptional,
    is_new: joi.alternatives().try(joi.boolean(), joi.number().integer().min(0).max(1), joi.string().valid('0', '1')),
    sort_order: joi.number().integer().min(0),
    status: joi.alternatives().try(joi.boolean(), joi.number().integer().min(0).max(1), joi.string().valid('0', '1')),
  }),
  updateLocation: joi.object({
    name: fields.stringOptional(2, 100),
    city: fields.stringOptional(1, 100),
    state: fields.stringOptional(1, 100),
    pin: fields.stringOptional(1, 20),
    photo_url: fields.urlOptional,
    map_url: fields.urlOptional,
    is_new: joi.alternatives().try(joi.boolean(), joi.number().integer().min(0).max(1), joi.string().valid('0', '1')),
    sort_order: joi.number().integer().min(0),
    status: joi.alternatives().try(joi.boolean(), joi.number().integer().min(0).max(1), joi.string().valid('0', '1')),
  }),

  createResource: joi.object({ title: fields.string(2, 200).required(), file_url: fields.url }),
  updateResource: joi.object({ title: fields.stringOptional(2, 200), file_url: fields.urlOptional }),

  createProject: joi.object({ title: fields.string(2, 200).required(), description: fields.stringOptional(0, 2000) }),
  updateProject: joi.object({ title: fields.stringOptional(2, 200), description: fields.stringOptional(0, 2000) }),

  createTestimonial: joi.object({ name: fields.string(2, 100).required(), content: fields.string(10, 1000).required() }),
  updateTestimonial: joi.object({ name: fields.stringOptional(2, 100), content: fields.stringOptional(10, 1000) }),

  createClass: joi.object({ name: fields.string(2, 100).required(), course_id: fields.id }),
  updateClass: joi.object({ name: fields.stringOptional(2, 100) }),

  createSlot: joi.object({ title: fields.string(2, 100).required(), start_time: fields.dateOptional, end_time: fields.dateOptional }),
  updateSlot: joi.object({ title: fields.stringOptional(2, 100), start_time: fields.dateOptional, end_time: fields.dateOptional }),
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
