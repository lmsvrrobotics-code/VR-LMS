# Production Patterns & Best Practices

This guide documents production-ready patterns for this codebase. **New developers must follow these when adding features.**

---

## 1. Input Validation

All user input must be validated before reaching the database. Use the centralized validation library.

### ✅ DO - Use Joi Validators

```javascript
// routes/course.routes.js
const { validateBody } = require('../lib/validators');
const { schemas } = require('../lib/validators');
const ctrl = require('../controllers/CourseController');

router.post('/courses', validateBody(schemas.createCourse), ctrl.createCourse);
router.patch('/courses/:id', validateBody(schemas.updateCourse), ctrl.updateCourse);

// Controller receives validated data in req.validatedBody
async function createCourse(req, res) {
  const { name, slug, description } = req.validatedBody;
  // Data is guaranteed to be valid here
  const course = await Course.create({ name, slug, description });
  res.json(course);
}
```

### ❌ DON'T - Accept Raw User Input

```javascript
// BAD: No validation, opens to injection/invalid data
router.post('/courses', (req, res) => {
  const { name, description } = req.body;
  const course = await Course.create({ name, description }); // ⚠️ Unvalidated
});
```

### Adding New Validation Schemas

Edit `src/lib/validators.js` and add to `schemas`:

```javascript
// In src/lib/validators.js
schemas.updateTeacher = joi.object({
  id: fields.id,
  name: fields.stringOptional(2, 100),
  email: fields.emailOptional,
  phone: joi.string().pattern(/^\d{10,15}$/).optional(),
});
```

---

## 2. Error Handling & Logging

All errors must be logged with context for debugging. Use structured logging with correlation IDs.

### ✅ DO - Log Errors with Context

```javascript
const { logger, auditLog } = require('../lib/logger');

async function createPaymentOrder(req, res) {
  try {
    const orderId = await Razorpay.createOrder(...);
    auditLog('PAYMENT_ORDER_CREATED', { orderId, amount: req.body.amount }, req.authUser.userId);
    res.json({ orderId });
  } catch (error) {
    logger.error('Payment order creation failed', {
      amount: req.body.amount,
      courseid: req.body.course_id,
    }, error);
    res.status(500).json({ error: 'Payment service unavailable' });
  }
}
```

### ❌ DON'T - Silent Failures or Generic Errors

```javascript
// BAD: Error swallowed, no context for debugging
try {
  const order = await Razorpay.createOrder(...);
} catch (e) {
  console.log('error'); // ⚠️ Unhelpful
  res.status(500).send('Error');
}

// BAD: Error logged but no context
console.error(error); // ⚠️ No request ID or user info
```

### Middleware Integration

Add logging middleware early in `server.js`:

```javascript
const { requestIdMiddleware, userContextMiddleware } = require('./lib/logger');

app.use(requestIdMiddleware);
app.use(auth); // Validates JWT
app.use(userContextMiddleware); // Injects user context into logger

// Now all logs automatically include requestId and userId
logger.info('User action', { action: 'viewed_course' });
// Output: { requestId: '...-...', userId: 123, action: 'viewed_course', ... }
```

---

## 3. Authentication & Authorization

Never trust client-provided data for identity. Always extract from verified JWT.

### ✅ DO - Verify JWT, Use Auth Middleware

```javascript
// middleware/auth.js - already implemented
const { verifyToken } = require('../helpers/jwt');

async function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const user = verifyToken(token, process.env.SUPABASE_JWT_SECRET);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  req.authUser = user; // Verified identity
  next();
}

// Use in routes
router.get('/my-assignments', auth, ctrl.getMyAssignments);

// Controller can safely use req.authUser.userId
async function getMyAssignments(req, res) {
  const assignments = await Assignment.findAll({
    where: { student_id: req.authUser.userId } // ✅ From JWT, not request body
  });
  res.json(assignments);
}
```

### ❌ DON'T - Trust Client Identity Claims

```javascript
// BAD: User ID from request body (can be spoofed)
router.get('/assignments', (req, res) => {
  const userId = req.body.userId; // ⚠️ Attacker can set this to anyone
  const assignments = await Assignment.findAll({ where: { student_id: userId } });
});

// BAD: User ID from unverified header
router.get('/assignments', (req, res) => {
  const userId = req.headers['x-user-id']; // ⚠️ Client controls this
  const assignments = await Assignment.findAll({ where: { student_id: userId } });
});
```

### Role-Based Access

```javascript
// middleware/auth.js
async function adminOnly(req, res, next) {
  if (req.authUser?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function teacherOnly(req, res, next) {
  if (!['teacher', 'admin'].includes(req.authUser?.role)) {
    return res.status(403).json({ error: 'Teacher access required' });
  }
  next();
}

// Use in routes
router.post('/admin/courses', adminOnly, ctrl.createCourse);
router.post('/assignments/:id/grade', teacherOnly, ctrl.gradeSubmission);
```

---

## 4. Database Queries

Always filter queries by user context to prevent information disclosure.

### ✅ DO - Filter by User

```javascript
async function getMyBatches(req, res) {
  const batches = await Batch.findAll({
    where: { student_id: req.authUser.userId }, // ✅ Restricted to this user
  });
  res.json(batches);
}

// For admins viewing others' data
async function getStudentBatches(req, res) {
  if (req.authUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { studentId } = req.params;
  const batches = await Batch.findAll({
    where: { student_id: studentId },
  });
  res.json(batches);
}
```

### ❌ DON'T - Return All Data Without Filtering

```javascript
// BAD: Returns all batches regardless of user
async function getAllBatches(req, res) {
  const batches = await Batch.findAll(); // ⚠️ No user filter
  res.json(batches);
}
```

---

## 5. Checklist for New Endpoints

When adding a new API endpoint, follow this checklist:

### Security & Validation
- [ ] **Auth Check** — Does the route need authentication? Add `auth` middleware
- [ ] **Role Check** — Does it need `adminOnly`, `teacherOnly`? Add appropriate middleware
- [ ] **Input Validation** — Does request body/params need validation? Add `validateBody(schema)`
- [ ] **User Filtering** — Does the query filter by user ID (if not admin)?
- [ ] **Rate Limiting** — Is this public endpoint? Consider `writeLimiter`

### Logging & Monitoring
- [ ] **Request Logging** — Is this a sensitive operation? Add `auditLog()` call
- [ ] **Error Logging** — Does error handler include context for debugging?
- [ ] **Sentry Integration** — Are errors captured for production monitoring?

### Documentation
- [ ] **JSDoc Comments** — Does controller method have @param/@return comments?
- [ ] **OpenAPI Spec** — Is endpoint documented in Swagger/OpenAPI?
- [ ] **CLAUDE.md** — Add to feature documentation if new feature

### Testing
- [ ] **Happy Path** — Does endpoint work with valid input?
- [ ] **Error Cases** — Does it fail gracefully with 4xx errors?
- [ ] **Auth Denial** — Does it return 401 if token missing? 403 if insufficient role?
- [ ] **Invalid Input** — Does it return 400 with helpful message?

### Example: Creating a `/quizzes/:id/submit` Endpoint

```javascript
// routes/quiz.routes.js
const { validateBody } = require('../lib/validators');
const { schemas } = require('../lib/validators');
const { writeLimiter } = require('../middlewares/rate-limit');

router.post(
  '/quizzes/:id/submit',
  writeLimiter, // Rate limit writes
  auth, // Verify JWT
  validateBody(schemas.submitQuizAnswer), // Validate input
  ctrl.submitQuizAnswer
);

// controllers/QuizController.js
/**
 * Submit a quiz answer
 * @param {Object} req - Express request
 * @param {Object} req.authUser - Verified user from JWT
 * @param {Object} req.validatedBody - Validated { quiz_id, question_id, answer }
 * @param {Object} res - Express response
 */
async function submitQuizAnswer(req, res) {
  try {
    const { quiz_id, question_id, answer } = req.validatedBody;
    const userId = req.authUser.userId;

    // Verify user is enrolled in batch that has this quiz
    const quiz = await Quiz.findByPk(quiz_id, { include: 'batch' });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const enrollment = await Enrollment.findOne({
      where: { batch_id: quiz.batch_id, student_id: userId },
    });
    if (!enrollment) return res.status(403).json({ error: 'Not enrolled' });

    // Submit answer
    const submission = await QuizSubmission.create({
      quiz_id,
      question_id,
      student_id: userId,
      answer,
    });

    auditLog('QUIZ_ANSWER_SUBMITTED', { quiz_id, student_id: userId }, userId);
    res.json({ success: true, submission_id: submission.id });
  } catch (error) {
    logger.error('Quiz submission failed', {
      quiz_id: req.body.quiz_id,
      student_id: req.authUser.userId,
    }, error);
    res.status(500).json({ error: 'Submission failed' });
  }
}
```

---

## 6. Database Transactions

Use transactions for operations that span multiple tables.

### ✅ DO - Atomic Operations

```javascript
async function createAssignmentWithNotifications(req, res) {
  const transaction = await sequelize.transaction();

  try {
    // Create assignment
    const assignment = await Assignment.create(req.validatedBody, { transaction });

    // Enroll students
    const students = await Enrollment.findAll({
      where: { batch_id: req.validatedBody.batch_id },
      transaction,
    });

    // Create notifications for each
    await Notification.bulkCreate(
      students.map(s => ({
        student_id: s.student_id,
        type: 'assignment_created',
        data: { assignment_id: assignment.id },
      })),
      { transaction }
    );

    await transaction.commit();
    res.json(assignment);
  } catch (error) {
    await transaction.rollback();
    logger.error('Assignment creation failed', { batch_id: req.body.batch_id }, error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
}
```

---

## 7. TypeScript & Type Safety

Frontend and critical backend services should have strong type checking.

### ✅ DO - Strict Types

```typescript
// frontend/src/api/courseApi.ts
export interface Course {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_published: boolean;
  price: number | null;
}

export async function getCourse(id: number): Promise<Course> {
  const response = await axios.get(`/api/public/courses/${id}`);
  return response.data;
}

// tsconfig.json
{
  "compilerOptions": {
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

---

## 8. API Response Format

Maintain consistent response format for predictability.

### ✅ DO - Consistent Shape

```javascript
// Success - 200
{ success: true, data: { ... } }

// Error - 400/401/403/500
{ error: 'User-friendly message', details: [ { field: '...', message: '...' } ] }

// List - 200
{ success: true, data: [ ... ], pagination: { total: 100, page: 1, limit: 20 } }

// Example
async function listCourses(req, res) {
  const courses = await Course.findAll({ limit: 20 });
  res.json({
    success: true,
    data: courses,
    pagination: { total: await Course.count(), page: 1, limit: 20 }
  });
}
```

---

## 9. Async/Await & Error Boundaries

Always use async/await with proper error handling.

### ✅ DO - Try/Catch

```javascript
async function getData(req, res) {
  try {
    const data = await SomeModel.findAll();
    res.json(data);
  } catch (error) {
    logger.error('Data fetch failed', { error: error.message }, error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### ❌ DON'T - Unhandled Promises

```javascript
// BAD: Promise error not caught
router.get('/data', async (req, res) => {
  const data = await SomeModel.findAll(); // ⚠️ If this throws, no catch
  res.json(data);
});
```

---

## 10. Sensitive Operations Require Audit Logging

Payment captures, role changes, data deletes, etc. must be logged.

### ✅ DO - Audit Trail

```javascript
const { auditLog } = require('../lib/logger');

async function capturePayment(req, res) {
  const result = await razorpay.payments.capture(orderId, amount);
  auditLog('PAYMENT_CAPTURED', {
    order_id: orderId,
    amount,
    razorpay_payment_id: result.id,
  }, req.authUser.userId);
  res.json({ success: true });
}

async function updateUserRole(req, res) {
  const { userId, newRole } = req.validatedBody;
  const user = await User.findByPk(userId);
  const oldRole = user.role;
  
  await user.update({ role: newRole });
  auditLog('USER_ROLE_CHANGED', {
    user_id: userId,
    old_role: oldRole,
    new_role: newRole,
  }, req.authUser.userId); // Who made the change
  
  res.json({ success: true });
}
```

---

## Summary Checklist

Every new endpoint should have:
- ✅ Input validation with Joi
- ✅ Auth middleware (if needed)
- ✅ Role/permission check (if needed)
- ✅ Structured logging
- ✅ User filtering (if reading user-scoped data)
- ✅ JSDoc comments
- ✅ Consistent error responses
- ✅ Audit logging (if sensitive)
- ✅ Tests
- ✅ Documentation

---

**Questions?** Check `DEVELOPER_GUIDE.md` or existing controllers for patterns.
