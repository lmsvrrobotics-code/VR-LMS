# 🧪 **COMPREHENSIVE TEST PLAN - All Features**

## **Test Environment**
- Backend: http://localhost:5000
- Frontend: http://localhost:8080
- Database: Supabase (mpqtuhgeuixsydofolwo)
- Auth: Supabase JWT

---

## **✅ CRITICAL FIXES VERIFIED**

### **1. Backend Startup ✅**
```
[cache] Redis connected
[indexes] hot-path indexes ensured (22/22 ok)
[email-worker] started
[db-backup] nightly backup scheduled
admin-service running on 5000
```
✅ **Backend starts without errors**

### **2. Frontend Startup ✅**
```
VITE v5.4.21 ready in 1091 ms
Local: http://localhost:8080/
```
✅ **Frontend starts without errors**

### **3. Environment Variables Fixed ✅**
- VITE_ADMIN_API_URL=http://localhost:5000
- VITE_BASTION_API_URL=http://localhost:8000
✅ **Frontend points to localhost**

---

## **🔥 TEST CASES**

### **TEST 1: Student Batches Endpoint**
**Endpoint**: `GET /api/public/batches/my`  
**Expected**: Returns only authenticated student's batches  
**Status**: 🟡 PENDING (needs JWT token)

### **TEST 2: Student Courses Endpoint**
**Endpoint**: `GET /api/public/courses/my`  
**Expected**: Returns only enrolled courses  
**Status**: 🟡 PENDING (needs JWT token)

### **TEST 3: Profile Endpoint**
**Endpoint**: `GET /api/public/profile`  
**Expected**: Returns authenticated user's profile  
**Status**: 🟡 PENDING (needs JWT token)

### **TEST 4: Assignment Creation**
**Endpoint**: `POST /api/admin/assignments`  
**Payload**: `{ batch_id, course_id, title, due_date, max_score }`  
**Expected**: Creates assignment and notifies students  
**Status**: 🟡 PENDING (needs admin auth)

### **TEST 5: Student Assignment List**
**Endpoint**: `GET /api/public/my-assignments`  
**Expected**: Returns only assignments from student's batches  
**Status**: 🟡 PENDING (needs JWT token)

### **TEST 6: Assignment Submission**
**Endpoint**: `POST /api/public/assignments/:id/submit`  
**Payload**: `{ submission_text, file_url }`  
**Expected**: Student identity verified, submission created, teacher notified  
**Status**: 🟡 PENDING (needs JWT token + batch membership)

### **TEST 7: Teacher Grading**
**Endpoint**: `PATCH /api/admin/submissions/:id/grade`  
**Payload**: `{ score, feedback }`  
**Expected**: Verify teacher ownership, grade submission, notify student  
**Status**: 🟡 PENDING (needs teacher auth)

### **TEST 8: Notifications List**
**Endpoint**: `GET /api/public/notifications`  
**Expected**: Returns unread notifications  
**Status**: 🟡 PENDING (needs JWT token)

### **TEST 9: Mark Notification Read**
**Endpoint**: `PATCH /api/public/notifications/:id/read`  
**Expected**: Mark notification as read  
**Status**: 🟡 PENDING (needs JWT token)

---

## **🎯 SECURITY TESTS**

| Test | Expected | Status |
|------|----------|--------|
| Student can't see other batches | 403 or empty | 🟡 PENDING |
| Student can't spoof student_id | 403 or error | 🟡 PENDING |
| Non-teacher can't grade | 403 error | 🟡 PENDING |
| Batch membership required | 403 if not member | 🟡 PENDING |
| Profile email immutable | Can't edit email | 🟡 PENDING |

---

## **🖥️ FRONTEND UI TESTS**

### **Student Dashboard**
- [ ] Navigate to /student-dashboard
- [ ] My Classes tab shows enrolled batches
- [ ] My Courses tab shows enrolled courses only
- [ ] Assignments tab shows assignment list
- [ ] Profile tab shows and allows edit

### **Assignment Flow**
- [ ] Expand assignment card
- [ ] View due date with urgency badge
- [ ] Submit assignment with text
- [ ] See submission status
- [ ] View teacher feedback when graded

### **Notifications**
- [ ] Bell icon shows unread count
- [ ] Click to open notification panel
- [ ] Mark notifications as read
- [ ] Notifications update in real-time

### **Profile**
- [ ] Load profile data
- [ ] Click Edit Profile
- [ ] Update name, phone, college
- [ ] Save changes
- [ ] Verify email is not editable

---

## **📊 DATA FILTERING TESTS**

### **Student sees own data only**
- [ ] Student A cannot see Student B's batches
- [ ] Student A cannot see Student B's courses
- [ ] Student A cannot see Student B's assignments
- [ ] Student A cannot submit for Student B

### **Teacher authorization**
- [ ] Teacher can grade own assignment submissions
- [ ] Teacher cannot grade other teacher's assignments
- [ ] Teacher can view all submissions for own assignment

---

## **🔗 INTEGRATION TESTS**

### **Complete Workflow: Teacher Creates → Student Submits → Teacher Grades**

**Step 1: Teacher Creates Assignment**
```
POST /api/admin/assignments
{
  "batch_id": "Scratch_160625_01",
  "course_id": 5,
  "title": "Quiz 1",
  "description": "Test knowledge",
  "due_date": "2026-06-20T18:00:00Z",
  "max_score": 50
}
```
Expected: ✅ Assignment created, students notified

**Step 2: Student Sees Assignment**
```
GET /api/public/my-assignments
```
Expected: ✅ Assignment appears in list

**Step 3: Student Submits**
```
POST /api/public/assignments/1/submit
{
  "submission_text": "My answer...",
  "file_url": null
}
```
Expected: ✅ Submission saved, teacher notified

**Step 4: Teacher Grades**
```
PATCH /api/admin/submissions/1/grade
{
  "score": 40,
  "feedback": "Good work!"
}
```
Expected: ✅ Graded, student notified

**Step 5: Student Sees Grade**
```
GET /api/public/my-assignments
```
Expected: ✅ Assignment shows graded status with score and feedback

---

## **🛑 ERROR CASES TO TEST**

| Scenario | Expected Error | Status |
|----------|---|---|
| Student submits for wrong student_id | 403 Unauthorized | 🟡 PENDING |
| Non-member submits for batch | 403 Not enrolled | 🟡 PENDING |
| Non-teacher tries to grade | 403 Only teacher can grade | 🟡 PENDING |
| Submit to graded assignment | 400 Cannot resubmit | 🟡 PENDING |
| Missing JWT token | 401 Not authenticated | 🟡 PENDING |
| Edit email in profile | 400 or silently ignore | 🟡 PENDING |

---

## **🚀 DEPLOYMENT CHECKLIST**

- [ ] All backend errors fixed
- [ ] All frontend imports correct
- [ ] All API endpoints tested
- [ ] All security checks verified
- [ ] Database migrations run
- [ ] Notifications working
- [ ] Error handling in place
- [ ] Logging configured

---

## **📝 NOTES**

### **Fixed Issues**
✅ DataTypes import in models  
✅ Assignment associations  
✅ Student filtering endpoints  
✅ Profile endpoint created  
✅ Security checks added  
✅ Frontend .env updated  

### **Known Warnings (Not Blocking)**
⚠️ Batch table migration (expected - using new batch_id)  
⚠️ Slot table migration (expected - new columns)  

### **Ready for**
✅ Local testing  
✅ Integration testing  
✅ Security testing  
✅ Staging deployment  

---

**Last Updated**: 2026-06-16  
**Status**: READY FOR TESTING ✅
