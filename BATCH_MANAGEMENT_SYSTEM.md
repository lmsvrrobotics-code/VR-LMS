# Batch Management System - Complete Implementation Guide

## Overview

A robust batch management system where:
- **Batch** = 1 teacher + 1+ students + 1+ courses
- **Minimum:** 1 student, 1 teacher, 1 course
- **Admin controls:** Student roster, course assignment, temporary teacher assignment
- **Teacher controls:** Content release (lesson delivery to batch)
- **No payment/enrollment:** All students auto-eligible for any batch

---

## Architecture

### Core Tables

#### 1. `lms_admin.batches`
Primary batch record with unique ID as primary key.

```sql
unique_id (PK)         -- Python20260618-01
display_name           -- Optional custom name
primary_teacher_id (FK) -- References lucy_devdb.users.unique_id
status                 -- active, archived, etc.
created_at             -- Creation timestamp
updated_at             -- Last update timestamp
```

#### 2. `lms_admin.batch_courses`
Many-to-many: allows 1+ courses per batch.

```sql
id (PK)
batch_id (FK)   -- References batches.unique_id
course_id (FK)  -- References courses.id
added_at
```

#### 3. `lms_admin.batch_members`
Student roster: students in the batch.

```sql
id (PK)
batch_id (FK)   -- References batches.unique_id
student_id (FK) -- References lucy_devdb.users.unique_id
added_at
```

#### 4. `lms_admin.batch_classes`
Individual class sessions with optional temporary teacher override.

```sql
id (PK)
batch_id (FK)                -- References batches.unique_id
course_id (FK)               -- References courses.id
class_date_time              -- When the class happens
primary_teacher_id           -- From batch.primary_teacher_id
temporary_teacher_id         -- Optional override for this class only
title                        -- Lesson title
description
status                       -- scheduled, completed, cancelled
created_at
updated_at
```

#### 5. `lms_admin.batch_lesson_releases`
Teacher releases content (lessons) to entire batch at once.

```sql
id (PK)
batch_id (FK)     -- References batches.unique_id
lesson_id (FK)    -- References lessons.id
released_by       -- Teacher's unique_id
released_at       -- When released
created_at
```

---

## Unique ID Format

**Format:** `CourseName + YYYYMMDD + "-" + SerialNumber`

**Examples:**
- `Python20260618-01` - First Python batch created today
- `DSA20260615-02` - Second DSA batch created on 2026-06-15
- `Java20260618-01` - First Java batch created today

**Generation Logic:**
1. Extract first course name
2. Remove special characters
3. Get today's date (YYYYMMDD)
4. Count batches created today
5. Pad serial number to 2 digits
6. Combine: `CourseName + Date + "-" + Serial`

---

## Database Migration

**File:** `supabase/migrations/11_batch_management_system.sql`

**What it does:**
1. Creates all 5 batch tables
2. Adds foreign key constraints
3. Creates indexes for performance
4. Creates `get_next_batch_id()` function for ID generation
5. Creates `updated_at` triggers

**How to apply:**
```bash
node supabase/apply-migrations.js
```

---

## Sequelize Models

### Files Created:
- `src/models/Batch.js` - Main batch model
- `src/models/BatchCourse.js` - Course associations
- `src/models/BatchMember.js` - Student roster
- `src/models/BatchClass.js` - Class sessions
- `src/models/BatchLessonRelease.js` - Lesson releases

### Model Relationships:
```
Batch
├── hasMany BatchCourse (batch_id → batches.unique_id)
├── hasMany BatchMember (batch_id → batches.unique_id)
├── hasMany BatchClass (batch_id → batches.unique_id)
└── hasMany BatchLessonRelease (batch_id → batches.unique_id)
```

---

## Backend Service: BatchService.js

**File:** `src/services/BatchService.js`

**Functions:**

### 1. `create(body)` - Create batch with courses & students
```javascript
POST /api/batches
{
  "primary_teacher_id": "John20260618-01",
  "course_ids": [1, 2, 3],
  "student_ids": ["Priya20260615-01", "Sarah20260618-02"],
  "display_name": "Advanced Python Group"  // optional
}

Returns: { unique_id, courses[], students[], student_count }
```

### 2. `get(batchId)` - Fetch batch details
```javascript
GET /api/batches/:batchId

Returns: { 
  unique_id, 
  display_name, 
  primary_teacher_id,
  courses: [{ id, title, slug }],
  students: [{ student_id, name, email }],
  student_count,
  created_at,
  updated_at 
}
```

### 3. `list(options)` - List all batches with pagination
```javascript
GET /api/batches?page=1&per_page=10&search=Python&status=active

Returns: { 
  data: [{ unique_id, display_name, student_count, course_count }],
  pagination: { total, page, per_page }
}
```

### 4. `addStudents(batchId, studentIds)` - Add students to batch
```javascript
POST /api/batches/:batchId/students
{
  "student_ids": ["John20260618-01", "Priya20260615-03"]
}

Returns: Updated batch object
```

### 5. `removeStudent(batchId, studentId)` - Remove student from batch
```javascript
DELETE /api/batches/:batchId/students/:studentId

Returns: Updated batch object
```

### 6. `assignTemporaryTeacher(batchId, classId, tempTeacherId)` - Override teacher for specific class
```javascript
POST /api/batches/:batchId/classes/:classId/temporary-teacher
{
  "temporary_teacher_id": "Sarah20260618-02"
}

Returns: { message: "Temporary teacher assigned successfully" }
```

### 7. `releaseLesson(batchId, lessonId, teacherId)` - Teacher releases lesson to batch
```javascript
POST /api/batches/:batchId/release-lesson
{
  "lesson_id": 42,
  "teacher_id": "John20260618-01"
}

Returns: { message: "Lesson released successfully to batch" }
```

### 8. `update(batchId, body)` - Update batch details
```javascript
PATCH /api/batches/:batchId
{
  "display_name": "New Name",
  "status": "archived",
  "primary_teacher_id": "NewTeacher20260618-03"
}

Returns: Updated batch object
```

---

## Backend Controller: BatchController.js

**File:** `src/controllers/BatchController.js` (to be created)

**Endpoints:**
```javascript
// List batches
GET /api/batches?page=1&per_page=10&search=&status=active

// Create batch
POST /api/batches
{
  "primary_teacher_id": "...",
  "course_ids": [...],
  "student_ids": [...],
  "display_name": "..."
}

// Get batch
GET /api/batches/:batchId

// Update batch
PATCH /api/batches/:batchId
{ "display_name": "...", "status": "..." }

// Add students
POST /api/batches/:batchId/students
{ "student_ids": [...] }

// Remove student
DELETE /api/batches/:batchId/students/:studentId

// Assign temporary teacher
POST /api/batches/:batchId/classes/:classId/temporary-teacher
{ "temporary_teacher_id": "..." }

// Release lesson
POST /api/batches/:batchId/release-lesson
{ "lesson_id": 42, "teacher_id": "..." }
```

---

## Backend Routes: batch.routes.js

**File:** `src/routes/batch.routes.js` (to be created)

```javascript
const router = require('express').Router();
const ctrl = require('../controllers/BatchController');
const { adminOnly, auth } = require('../middlewares/auth');

// Admin routes (CRUD)
router.get('/batches', adminOnly, ctrl.index);
router.post('/batches', adminOnly, ctrl.store);
router.get('/batches/:id', adminOnly, ctrl.show);
router.patch('/batches/:id', adminOnly, ctrl.update);

// Student management
router.post('/batches/:id/students', adminOnly, ctrl.addStudents);
router.delete('/batches/:id/students/:studentId', adminOnly, ctrl.removeStudent);

// Teacher operations
router.post('/batches/:id/release-lesson', auth, ctrl.releaseLesson);
router.post('/batches/:id/classes/:classId/temporary-teacher', adminOnly, ctrl.assignTemporaryTeacher);

module.exports = router;
```

---

## Implementation Checklist - 6 Points

- [x] **1. Confirm batch ID naming** - ✅ CourseName + YYYYMMDD + "-" + SerialNumber
- [x] **2. Create batch unique ID system** - ✅ Migration + function created
- [x] **3. Create all tables + migrations** - ✅ Migration 11 created with all 5 tables
- [ ] **4. Create batch management APIs** - 🔄 Service created, need controller + routes
- [ ] **5. Create admin UI for batch CRUD** - ⏳ Frontend (to be built)
- [ ] **6. Add temporary teacher assignment** - ✅ Designed in schema, ready to implement

---

## Remaining Work

### Immediately Required:
1. Create `BatchController.js`
2. Create/register `batch.routes.js` in server.js
3. Apply migration 11 to database

### Optional (Frontend):
1. Create batch management page in admin dashboard
2. Display batch list, create batch form
3. Add/remove students UI
4. Assign temporary teachers UI
5. Teacher lesson release UI

---

## Usage Example

### Admin Creates Batch (2026-06-18)

**Request:**
```json
POST /api/batches
{
  "primary_teacher_id": "John20260618-01",
  "course_ids": [5, 7],
  "student_ids": ["Priya20260615-01", "Sarah20260618-02", "Dev20260610-03"],
  "display_name": "Advanced Programming Cohort"
}
```

**Response:**
```json
{
  "unique_id": "Advanced20260618-01",
  "display_name": "Advanced Programming Cohort",
  "primary_teacher_id": "John20260618-01",
  "courses": [
    { "id": 5, "title": "Python Advanced", "slug": "python-advanced" },
    { "id": 7, "title": "DSA", "slug": "dsa" }
  ],
  "students": [
    { "student_id": "Priya20260615-01", "name": "Priya Sharma", "email": "priya@example.com" },
    { "student_id": "Sarah20260618-02", "name": "Sarah Smith", "email": "sarah@example.com" },
    { "student_id": "Dev20260610-03", "name": "Dev Kumar", "email": "dev@example.com" }
  ],
  "student_count": 3,
  "status": "active",
  "created_at": "2026-06-18T10:30:00Z",
  "updated_at": "2026-06-18T10:30:00Z"
}
```

### Teacher Releases Lesson to Batch

**Request:**
```json
POST /api/batches/Advanced20260618-01/release-lesson
{
  "lesson_id": 42,
  "teacher_id": "John20260618-01"
}
```

**Response:**
```json
{
  "message": "Lesson released successfully to batch"
}
```

All 3 students in the batch now have access to lesson 42.

### Admin Assigns Temporary Teacher for One Class

**Request:**
```json
POST /api/batches/Advanced20260618-01/classes/15/temporary-teacher
{
  "temporary_teacher_id": "Sarah20260618-02"
}
```

**Response:**
```json
{
  "message": "Temporary teacher assigned successfully"
}
```

For this specific class, Sarah teaches instead of John.

---

## Next Steps

1. **Apply Migration:**
   ```bash
   node supabase/apply-migrations.js
   ```

2. **Create Controller & Routes:**
   - Copy the controller template from BatchService
   - Create batch.routes.js
   - Register in server.js

3. **Test API Endpoints:**
   - Create a batch
   - Add students
   - Release lesson
   - Test temporary teacher assignment

4. **Build Frontend (Optional):**
   - Batch CRUD page
   - Student roster management
   - Temporary teacher assignment UI

---

**Status:** ✅ Database & Service Layer Ready | ⏳ API Controller & Routes Pending | ⏳ Frontend Pending

