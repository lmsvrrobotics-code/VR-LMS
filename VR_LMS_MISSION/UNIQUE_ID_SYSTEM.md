# Student & Teacher Unique ID System

## Overview

This document describes the robust unique ID system implemented for students and teachers. Each student and teacher receives an immutable, memorable unique identifier that serves as their primary key in the system.

## ID Format

**Format:** `FirstName` + `YYYYMMDD` + `-` + `SerialNumber`

**Examples:**
- `John20260618-01` - John, created on 2026-06-18, 1st user that day
- `Priya20260615-03` - Priya, created on 2026-06-15, 3rd user that day
- `Sarah20260618-02` - Sarah, created on 2026-06-18, 2nd user that day

## Components

| Component | Description | Example |
|-----------|-------------|---------|
| **FirstName** | First word of the person's full name | John, Priya, Sarah |
| **YYYYMMDD** | Date of join (creation date, ISO format) | 20260618 (2026-06-18) |
| **Hyphen** | Separator | `-` |
| **SerialNumber** | Auto-incrementing counter (per day) | 01, 02, 03, etc. (zero-padded to 2 digits) |

## Key Features

✅ **Immutable** - Once generated, the ID never changes
✅ **Unique** - Guaranteed unique in the system
✅ **Memorable** - Easy to read and remember (includes name + date)
✅ **Traceable** - Admin can easily track creation date and order
✅ **No Collisions** - Serial number ensures uniqueness even for same-named users created on same day

## Database Schema

### Lucy_devdb.users Table

The unique ID is the PRIMARY KEY for the `lucy_devdb.users` table (where students and teachers are stored):

```sql
CREATE TABLE lucy_devdb.users (
  unique_id    VARCHAR(100) PRIMARY KEY,  -- Unique ID (FirstName+YYYYMMDD-SerialNumber)
  "userId"     VARCHAR(255) UNIQUE NOT NULL,  -- Legacy userId (kept for backward compat)
  name         VARCHAR(255) NOT NULL,
  email        VARCHAR(255) NOT NULL UNIQUE,
  role         VARCHAR(100) NOT NULL,  -- 'student' or 'teacher'
  -- ... other fields
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_unique_id ON lucy_devdb.users (unique_id);
```

## Implementation Details

### Backend Code

**Location:** `backend/admin-service/src/services/`

#### StudentService.js

```javascript
const generateUniqueStudentTeacherId = async (fullName) => {
  // Extract first name
  const firstName = (fullName || '').trim().split(' ')[0] || 'User';
  
  // Format today's date as YYYYMMDD
  const today = new Date();
  const dateStr = `${year}${month}${day}`;
  
  // Count users created today to get serial number
  const count = await authDb.query(
    `SELECT COUNT(*) FROM users WHERE DATE("createdAt") = CURRENT_DATE`
  );
  
  // Combine all parts
  const uniqueId = `${firstName}${dateStr}-${paddedSerial}`;
  return uniqueId;
};
```

### Creating Students/Teachers

When admin creates a student or teacher:

1. **Admin fills form** with name, email, password
2. **System generates unique ID** using `generateUniqueStudentTeacherId(name)`
3. **Supabase Auth account created** with email/password
4. **Database insert** with the generated unique ID as PRIMARY KEY
5. **Welcome email sent** with login details

### Database Migrations

**Migration Files:**
- `supabase/migrations/10_unique_student_teacher_ids_lucy.sql` - Adds unique ID system to lucy_devdb

**What the migration does:**
1. Adds `unique_id` column to `lucy_devdb.users`
2. Generates unique IDs for all existing users
3. Creates indexes for performance
4. Makes `unique_id` the PRIMARY KEY

## Use Cases

### Admin Monitoring
- **View all students by unique ID** - Easy to scan and track
- **Filter by date** - All users created on 2026-06-18: John20260618-*, Sarah20260618-*, etc.
- **Export student list** - IDs are stable and never change

### Course Assignment
- **Assign course to student by ID** - Instead of "user 12345", it's "John20260618-01"
- **Query by ID** - `SELECT * FROM users WHERE unique_id = 'John20260618-01'`

### Batch Assignment
- **Create batch with specific students by ID** - List of student IDs like "John20260618-01", "Priya20260615-03"
- **Manage batch membership** - Track which students (by ID) are in which batch

### Teacher Assignment
- **Assign teacher to course** - Use teacher's unique ID like "Sarah20260618-02"
- **Track teacher workload** - Easy to see which students (by ID) are taught by which teacher

## Example: Admin Adding a Student

**Input:**
```json
{
  "name": "John Kumar",
  "email": "john@example.com",
  "password": "SecurePass123",
  "phone": "+919876543210",
  "collegeId": "clg-123"
}
```

**Execution Date:** 2026-06-18 (and it's the 1st student created today)

**Generated Unique ID:** `John20260618-01`

**Database Record:**
```sql
INSERT INTO lucy_devdb.users
  (unique_id, userId, name, email, passwordHash, phone, roleId, collegeId, createdAt, updatedAt)
VALUES
  ('John20260618-01', '201234567890', 'John Kumar', 'john@example.com', 'supabase:...', '+919876543210', 'student_role_id', 'clg-123', NOW(), NOW())
```

**Response to Admin:**
```json
{
  "message": "Student added successfully",
  "student": {
    "unique_id": "John20260618-01",
    "userId": "201234567890",
    "name": "John Kumar",
    "email": "john@example.com",
    "role": "student",
    "createdAt": "2026-06-18T10:30:00Z"
  }
}
```

## Querying by Unique ID

### Get a specific student by unique ID
```sql
SELECT * FROM lucy_devdb.users WHERE unique_id = 'John20260618-01';
```

### Get all students created on a specific date
```sql
SELECT * FROM lucy_devdb.users 
WHERE unique_id LIKE '%20260618-%' AND roleId = 'student_role_id';
```

### Count students created today
```sql
SELECT COUNT(*) FROM lucy_devdb.users 
WHERE DATE("createdAt") = CURRENT_DATE;
```

## API Endpoints

### Create Student (POST /api/students)
```bash
curl -X POST http://localhost:5000/api/students \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{
    "name": "John Kumar",
    "email": "john@example.com",
    "password": "SecurePass123",
    "phone": "+919876543210"
  }'
```

**Response:**
```json
{
  "message": "Student added successfully",
  "student": {
    "unique_id": "John20260618-01",
    "name": "John Kumar",
    "email": "john@example.com",
    "enrolled_count": 0,
    "created_at": "2026-06-18T10:30:00Z"
  }
}
```

### Create Teacher (POST /api/teachers)
```bash
curl -X POST http://localhost:5000/api/teachers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{
    "name": "Sarah Smith",
    "email": "sarah@example.com",
    "password": "SecurePass123",
    "phone": "+919876543211",
    "expertise": "Computer Science",
    "yearsOfExperience": 5
  }'
```

**Response:**
```json
{
  "message": "Teacher added successfully",
  "teacher": {
    "unique_id": "Sarah20260618-02",
    "name": "Sarah Smith",
    "email": "sarah@example.com",
    "expertise": "Computer Science",
    "yearsOfExperience": 5,
    "created_at": "2026-06-18T10:35:00Z"
  }
}
```

## Important Notes

⚠️ **Backward Compatibility:**
- The legacy `userId` field is still present and UNIQUE
- All existing references to `userId` continue to work
- New code should use `unique_id` instead

⚠️ **Migration Requirements:**
- Run `supabase/migrations/10_unique_student_teacher_ids_lucy.sql` before deploying
- This migrates all existing users to have unique IDs
- No data loss - all student/teacher records preserved

⚠️ **Immutability:**
- The unique ID is immutable - it cannot be changed after creation
- If an error is made, contact an admin to verify the record

## Monitoring & Analytics

### Admin Dashboard Considerations
- Display `unique_id` in student/teacher lists (instead of or alongside `userId`)
- Use unique ID in export files for easy reference
- Show creation date when displaying unique ID (helps with sorting/filtering)

### Example Admin Table Display
```
| Unique ID         | Name          | Email                | Role    | Created      |
|-------------------|---------------|----------------------|---------|--------------|
| John20260618-01   | John Kumar    | john@example.com     | Student | 2026-06-18   |
| Sarah20260618-02  | Sarah Smith   | sarah@example.com    | Teacher | 2026-06-18   |
| Priya20260615-03  | Priya Sharma  | priya@example.com    | Student | 2026-06-15   |
```

## Testing

### Manual Test Steps

1. **Start the backend:**
   ```bash
   cd backend/admin-service && npm run dev
   ```

2. **Apply migrations:**
   ```bash
   node supabase/apply-migrations.js
   ```

3. **Create a student via API:**
   ```bash
   curl -X POST http://localhost:5000/api/students \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <JWT>" \
     -d '{"name": "Test User", "email": "test@example.com", "password": "Pass123456"}'
   ```

4. **Verify the unique ID:**
   - Check response JSON for `unique_id` field
   - Query database: `SELECT * FROM lucy_devdb.users WHERE name = 'Test User';`
   - Verify format: `TestUser<YYYYMMDD>-<NN>`

## Troubleshooting

### Issue: Unique ID generation fails
**Solution:** Ensure `lucy_devdb.users` table has the migration applied. Run migration 10.

### Issue: Duplicate unique IDs created
**Solution:** This should not happen. Each ID includes a serial number based on creation count. If duplicates exist, check database triggers and constraints.

### Issue: Legacy code breaks
**Solution:** The system maintains both `unique_id` (PK) and `userId` (UNIQUE). Update code to query by `unique_id` instead of `userId`.

## Related Files

- **Database Migration:** `supabase/migrations/10_unique_student_teacher_ids_lucy.sql`
- **Student Service:** `backend/admin-service/src/services/StudentService.js`
- **Teacher Service:** `backend/admin-service/src/services/TeacherService.js`
- **Models:** `backend/admin-service/src/models/User.js`
- **Routes:** `backend/admin-service/src/routes/student.routes.js`, `backend/admin-service/src/routes/teacher.routes.js`

---

**Last Updated:** 2026-06-18  
**Status:** Implemented and Ready for Testing
