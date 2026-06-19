# Batch System - Deployment & Testing Guide

---

## 🔧 Pre-Deployment Setup

### 1. Database Migrations
```bash
cd backend/admin-service
npx sequelize-cli db:migrate --migrations-path ../../supabase/migrations

# Or manually:
psql -U postgres -d lms_admin -f supabase/migrations/15_fix_batch_members_schema.sql
psql -U postgres -d lms_admin -f supabase/migrations/16_refactor_batch_system.sql
```

### 2. Verify Models Are Synced
```bash
# In server startup logs, should see:
# ✓ Batch model synced
# ✓ BatchMember model synced
# ✓ Course model synced
# ✓ User model synced
```

### 3. Check Database Tables
```sql
-- Verify batches table has course_id
SELECT column_name FROM information_schema.columns 
WHERE table_name='batches' AND column_name='course_id';

-- Verify batch_members has user_id
SELECT column_name FROM information_schema.columns 
WHERE table_name='batch_members' AND column_name='user_id';

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename='batches';
```

---

## 🧪 Testing Phase 1: Backend APIs

### Setup Test Environment
```bash
# 1. Start backend server
cd backend/admin-service
npm start
# Should see: "Server running on :5000"

# 2. Get admin token (from your auth service)
# Store in: export ADMIN_TOKEN="eyJhbGc..."

# 3. Get student token
# Store in: export STUDENT_TOKEN="eyJhbGc..."
```

### Test 1A: Create Batch
```bash
curl -X POST http://localhost:5000/api/admin/batches \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": 1,
    "teacherId": "teacher_demo_123",
    "studentIds": ["student_demo_1", "student_demo_2", "student_demo_3"]
  }'

# Expected Response (200):
{
  "success": "Batch created successfully",
  "batch": {
    "unique_id": "VRSAMPLE_190626_01",
    "course_id": 1,
    "primary_teacher_id": "teacher_demo_123",
    "display_name": "VRSAMPLE_190626_01",
    "status": "active"
  }
}

# Save batch_id for next tests:
export BATCH_ID="VRSAMPLE_190626_01"
```

### Test 1B: Get Batch Details
```bash
curl http://localhost:5000/api/admin/batches/$BATCH_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected Response (200):
{
  "batch": {
    "unique_id": "VRSAMPLE_190626_01",
    "course_id": 1,
    "primary_teacher_id": "teacher_demo_123",
    "status": "active",
    "course": {
      "id": 1,
      "title": "VR Sample Course"
    },
    "members": [
      {
        "batch_id": "VRSAMPLE_190626_01",
        "user_id": "student_demo_1",
        "student_id": "Student_VRSAMPLE_190626_01_001",
        "status": "active"
      },
      {
        "batch_id": "VRSAMPLE_190626_01",
        "user_id": "student_demo_2",
        "student_id": "Student_VRSAMPLE_190626_01_002",
        "status": "active"
      },
      {
        "batch_id": "VRSAMPLE_190626_01",
        "user_id": "student_demo_3",
        "student_id": "Student_VRSAMPLE_190626_01_003",
        "status": "active"
      }
    ]
  }
}
```

### Test 1C: Add Student to Batch
```bash
curl -X POST http://localhost:5000/api/admin/batches/$BATCH_ID/students \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "student_demo_4"}'

# Expected Response (200):
{
  "success": "Student added to batch",
  "member": {
    "batch_id": "VRSAMPLE_190626_01",
    "user_id": "student_demo_4",
    "student_id": "Student_VRSAMPLE_190626_01_004",
    "status": "active"
  }
}
```

### Test 1D: Remove Student from Batch
```bash
curl -X DELETE http://localhost:5000/api/admin/batches/$BATCH_ID/students/student_demo_4 \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected Response (200):
{
  "success": "Student removed from batch"
}
```

### Test 1E: Update Batch Teacher
```bash
curl -X PUT http://localhost:5000/api/admin/batches/$BATCH_ID/teacher \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"teacherId": "teacher_new_456"}'

# Expected Response (200):
{
  "success": "Teacher updated for batch",
  "batch": {
    "primary_teacher_id": "teacher_new_456"
  }
}
```

### Test 1F: List Batches
```bash
curl "http://localhost:5000/api/admin/batches?page=1&courseId=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected Response (200):
{
  "batches": {
    "data": [
      {
        "unique_id": "VRSAMPLE_190626_01",
        "course_id": 1,
        "memberCount": 3,
        "status": "active"
      }
    ],
    "total": 1,
    "per_page": 20,
    "current_page": 1,
    "last_page": 1
  }
}
```

---

## 🧪 Testing Phase 2: Student Access Control

### Test 2A: Get Student's Batches
```bash
# Use student_demo_1's token
curl http://localhost:5000/api/public/batches/my \
  -H "Authorization: Bearer $STUDENT_TOKEN"

# Expected Response (200):
{
  "success": true,
  "batches": [
    {
      "unique_id": "VRSAMPLE_190626_01",
      "display_name": "VRSAMPLE_190626_01",
      "primary_teacher_id": "teacher_new_456",
      "course_id": 1,
      "course": {
        "id": 1,
        "title": "VR Sample Course"
      },
      "student_id": "Student_VRSAMPLE_190626_01_001",
      "status": "active"
    }
  ]
}
```

### Test 2B: Get Student's Courses
```bash
curl http://localhost:5000/api/public/courses/my \
  -H "Authorization: Bearer $STUDENT_TOKEN"

# Expected Response (200):
{
  "success": true,
  "courses": [
    {
      "id": 1,
      "title": "VR Sample Course",
      "description": "...",
      "featured_image": "..."
    }
  ]
}
```

### Test 2C: Get Course Details (WITH ACCESS)
```bash
curl http://localhost:5000/api/public/courses/1 \
  -H "Authorization: Bearer $STUDENT_TOKEN"

# Expected Response (200):
{
  "success": true,
  "course": {
    "id": 1,
    "title": "VR Sample Course",
    "description": "...",
    "level": "Beginner",
    "score_max": 100,
    "lectures_label": "2 Hours/Week",
    "total_hours": "40h"
  }
}
```

### Test 2D: Get Course Details (DENIED ACCESS)
```bash
# Use a different student who's not in this batch
# Create another batch and test with student from different batch

curl http://localhost:5000/api/public/courses/1 \
  -H "Authorization: Bearer $OTHER_STUDENT_TOKEN"

# Expected Response (403):
{
  "error": "Access denied to this course"
}
```

### Test 2E: Get Courses (NO BATCH)
```bash
# Use a student token that's not in any batch
curl http://localhost:5000/api/public/courses/my \
  -H "Authorization: Bearer $NEW_STUDENT_TOKEN"

# Expected Response (200):
{
  "success": true,
  "courses": []
}
```

---

## 🧪 Testing Phase 3: Frontend Components

### Start Frontend Dev Server
```bash
cd frontend
npm run dev
# Should start on http://localhost:5173 or similar
```

### Test 3A: My Courses Component
```
1. Login as student_demo_1
2. Navigate to Student Dashboard
3. Click "My Courses" tab
4. Verify:
   ✓ Loading spinner appears briefly
   ✓ Batches fetched successfully
   ✓ Batch selector shows (if multiple batches)
   ✓ Only courses from student's batches displayed
   ✓ Course cards show: title, description, lessons, category
   ✓ "Continue Learning" button visible
```

### Test 3B: Course Details Page
```
1. Click on a course in My Courses
2. Verify navigation to /courses/{courseId}
3. Check CourseDetails page loads:
   ✓ Course title displays
   ✓ Batch name shows
   ✓ Progress bar visible
   ✓ Overview tab shows:
     - Level, Sections, Lessons, Hours
     - Language, Certificate status
   ✓ Curriculum tab shows lessons
   ✓ Right sidebar shows:
     - Duration: Lifetime
     - Total Hours
     - Score: 0 / 100
     - Lectures per week
     - Class Rank
   ✓ "Buy this course" button visible
   ✓ "Enter Full Screen" button visible
   ✓ Responsive on mobile
```

### Test 3C: Access Control in Frontend
```
1. As student_demo_1, access /courses/1 (their course)
   ✓ Page loads successfully

2. Logout and login as unauthorized student
3. Try to access /courses/1
   ✓ Backend returns 403
   ✓ Frontend shows error message

4. Try direct URL access without login
   ✓ Redirected to login page
```

### Test 3D: Multiple Batches
```
1. Create 2 batches for same student:
   - Batch 1: Course 1 (VR Sample)
   - Batch 2: Course 2 (Scratch Level 1)

2. Login as student in both batches
3. My Courses page:
   ✓ Shows batch selector dropdown
   ✓ Both courses visible (unique)
   ✓ Can switch between batches
   ✓ Courses filtered correctly

4. Verify: Student sees both courses
```

---

## ✅ Complete Test Checklist

### Backend Tests
- [ ] Create batch (1 course, 1 teacher, multiple students)
- [ ] Get batch details with members
- [ ] Add student to batch
- [ ] Remove student from batch
- [ ] Update batch teacher
- [ ] List batches with pagination
- [ ] Get student batches (/api/public/batches/my)
- [ ] Get student courses (/api/public/courses/my)
- [ ] Get course details (with access check)
- [ ] 403 error when accessing unauthorized course
- [ ] 200 empty array for students with no batches

### Frontend Tests
- [ ] My Courses loads batches and courses
- [ ] Batch selector appears for multiple batches
- [ ] Courses display correctly
- [ ] Click course navigates to details page
- [ ] CourseDetails page renders all sections
- [ ] Overview tab shows course info
- [ ] Curriculum tab shows lessons
- [ ] Right sidebar shows stats
- [ ] Responsive on mobile devices
- [ ] Access control works (403 error in frontend)
- [ ] Logout redirects to login

### Database Tests
- [ ] Migrations applied successfully
- [ ] course_id in batches table
- [ ] user_id in batch_members table
- [ ] Unique constraint (batch_id, user_id)
- [ ] Indexes created and working
- [ ] No orphaned batch_members records

### Error Handling Tests
- [ ] Invalid courseId → 404
- [ ] Invalid teacherId → validation error
- [ ] Duplicate student in batch → 422
- [ ] Non-existent student remove → 404
- [ ] Unauthenticated request → 401
- [ ] Unauthorized course access → 403

---

## 🚀 Production Deployment

### 1. Backup Database
```bash
pg_dump lms_admin > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Run Migrations
```bash
npm run migrate
# Or manually run migration files
```

### 3. Deploy Backend
```bash
git push origin main
# CI/CD pipeline should:
# - Run tests
# - Build Docker image
# - Deploy to production
```

### 4. Deploy Frontend
```bash
npm run build
# Deploy dist/ folder to Cloudflare Workers or similar
```

### 5. Verify Production
```bash
# Test key endpoints in production
curl https://api.vr-robotics.com/api/public/batches/my \
  -H "Authorization: Bearer $PROD_STUDENT_TOKEN"

# Check logs for errors
tail -f /var/log/admin-service.log
```

---

## 📊 Monitoring & Health Checks

### Key Metrics to Monitor
```
1. Batch creation success rate
2. Student enrollment success rate
3. Course access denied errors (403)
4. Database query performance (batch lookups)
5. API response times
6. Number of active batches
7. Average students per batch
8. Storage usage
```

### Debugging Common Issues

**Issue: Students can't see their courses**
```
1. Check user_id is correct in JWT token
2. Verify BatchMember exists with correct user_id
3. Verify Batch has correct course_id
4. Check batch status = 'active'
5. Check BatchMember status = 'active' (not 'removed')
```

**Issue: Course access returns 403**
```
1. Verify student is in at least one batch
2. Verify batch has course_id = requested_courseId
3. Verify student's BatchMember.status = 'active'
4. Check JWT token is valid and not expired
```

**Issue: Batch not created**
```
1. Verify courseId exists in courses table
2. Verify teacherId exists in users table
3. Check for duplicate batch ID (same course + date)
4. Verify student IDs are valid user IDs
5. Check database constraints
```

---

## ✨ Success Indicators

System is working correctly when:
- ✅ Admin can create batches with 1 course + 1 teacher + many students
- ✅ Students see only courses from their batches
- ✅ Course Details page loads with full information
- ✅ Unauthorized students get 403 error
- ✅ Soft deletes preserve audit trail
- ✅ API responses under 200ms
- ✅ No database errors in logs
- ✅ All tests passing in CI/CD

---

**Status: Ready for Deployment** 🚀
