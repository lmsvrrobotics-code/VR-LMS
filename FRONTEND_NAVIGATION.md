# 🗺️ Frontend Navigation Guide

## 📍 Quick Links

### Home Base
- **Home Page:** http://localhost:8080/
- **Backend API:** http://localhost:5000

---

## 👤 **Authentication Routes**

### Login
```
URL: http://localhost:8080/auth
Steps:
1. Enter email
2. Enter password
3. Click "Login"
4. Get redirected to /student/dashboard
```

### Register
```
URL: http://localhost:8080/auth?tab=register
Steps:
1. Enter email
2. Enter name
3. Enter password
4. Select role (Student/Teacher/Admin)
5. Click "Register"
6. Get redirected to /student/dashboard
```

---

## 📚 **Student Dashboard Routes**

### Dashboard Home
```
URL: http://localhost:8080/student/dashboard
Tabs Available:
├─ My Classes        → /student/dashboard?tab=classes
├─ My Courses (NEW)  → /student/dashboard?tab=courses ✨
├─ Assignments       → /student/dashboard?tab=assignments
└─ Profile           → /student/dashboard?tab=profile
```

### My Courses (Batch-Filtered) ✨
```
URL: http://localhost:8080/student/dashboard?tab=courses

What You See:
├─ Batch selector (if in multiple batches)
├─ Course cards grid
│  └─ Each card is clickable
└─ Click any course → Course Details
```

---

## 🎓 **Course Routes**

### Course Details (NEW) ✨
```
URL: http://localhost:8080/courses/{courseId}
Examples:
- http://localhost:8080/courses/1
- http://localhost:8080/courses/5

What You See:
├─ Course title & batch name
├─ Progress bar
├─ Overview tab (course info)
├─ Curriculum tab (lessons)
├─ Right sidebar (stats)
└─ "Enter Full Screen" button

Actions:
├─ Click lesson → May go to player
├─ Click "Enter Full Screen" → Go to player
└─ Click back → Return to My Courses
```

### Course Player (Full Screen Learning)
```
URL: http://localhost:8080/courses/play/{courseId}/{lessonId}
Examples:
- http://localhost:8080/courses/play/1/1
- http://localhost:8080/courses/play/5/3

What You See:
├─ Video player (centered)
├─ Lesson sidebar (left)
├─ Controls & progress bar
├─ Mark complete button
└─ Next lesson button

Actions:
├─ Play/pause video
├─ Click lesson in sidebar → Switch lesson
├─ Click "Mark Complete" → Mark as done
└─ Click next → Go to next lesson
```

---

## 🔄 **Complete Navigation Flow**

### First Time User
```
1. http://localhost:8080/
   ↓ Click "Login"
2. http://localhost:8080/auth
   ↓ Enter credentials, click Login
3. http://localhost:8080/student/dashboard
   ↓ Dashboard loads automatically
```

### After Login
```
Dashboard Tab Options:
├─ My Classes → Shows enrolled classes
├─ My Courses → Shows batch courses ✨
│   └─ Click course
│       ↓
│       Course Details → /courses/5
│       ↓
│       Click "Enter Full Screen"
│       ↓
│       Course Player → /courses/play/5/1
│
├─ Assignments → Shows assignments
└─ Profile → Edit profile
```

### Batch-Filtered Course Flow
```
1. Go to Dashboard
   ↓
2. Click "My Courses" tab
   ↓
3. See courses from your batch(es) ONLY
   ↓
4. (Optional) Switch batch via selector
   ↓
5. Click on a course card
   ↓
6. See Course Details page
   ↓
7. Read overview or curriculum
   ↓
8. Click "Enter Full Screen"
   ↓
9. Watch video in Course Player
   ↓
10. Mark complete & move to next lesson
```

---

## 🧭 **URL Patterns**

| Route | URL Pattern | Example |
|-------|------------|---------|
| Home | `/` | http://localhost:8080/ |
| Auth | `/auth` | http://localhost:8080/auth |
| Dashboard | `/student/dashboard` | http://localhost:8080/student/dashboard |
| Course Details | `/courses/:id` | http://localhost:8080/courses/5 |
| Course Player | `/courses/play/:id/:lesson` | http://localhost:8080/courses/play/5/1 |

---

## 📋 **View Summary**

### 🏠 Home Page
- Landing page
- Marketing content
- Call to action
- No authentication required

### 🔐 Auth Page
- Login form
- Register form
- Password recovery
- After login → Dashboard

### 📊 Student Dashboard
- Main hub for students
- 4 tabs: Classes, Courses, Assignments, Profile
- **My Courses** is batch-filtered (NEW) ✨

### 🎓 Course Details (NEW) ✨
- Full course information
- Progress visualization
- Two tabs: Overview, Curriculum
- Stats in right sidebar
- Link to Course Player

### 🎬 Course Player
- Video player interface
- Lesson sidebar
- Progress tracking
- Mark complete button
- Full screen mode

---

## ✨ **New in This Update**

### Added Components
- ✅ Course Details Page (`CourseDetails.jsx`)
- ✅ Course Details Styling (`CourseDetails.css`)
- ✅ Student Batch API (`studentBatchApi.ts`)

### Updated Components
- ✅ My Courses (`MyCourses.jsx`) - Now batch-filtered
- ✅ Course Player - Integrated with batches

### Features
- ✅ Batch-filtered course view
- ✅ Course details page
- ✅ Progress bar visualization
- ✅ Course metadata display
- ✅ Curriculum browser
- ✅ Access control (403 on unauthorized)
- ✅ Responsive design

---

## 🚀 **Quick Test Checklist**

- [ ] Open http://localhost:8080
- [ ] Login with student credentials
- [ ] See Dashboard
- [ ] Click "My Courses" tab
- [ ] See courses from your batch
- [ ] (Optional) Switch batch via selector
- [ ] Click on a course
- [ ] See Course Details page
- [ ] Click "Overview" tab
- [ ] See course info (level, lessons, hours, etc.)
- [ ] Click "Curriculum" tab
- [ ] See lessons list
- [ ] Click "Enter Full Screen"
- [ ] See Course Player
- [ ] Play video
- [ ] Mark complete
- [ ] Click next lesson

---

## 🎯 **Key Features**

✅ **Batch System Integration**
- Students see ONLY their batch courses
- Batch selector for switching batches
- Batch name displayed on course page

✅ **Course Details**
- Professional UI design
- Progress visualization
- Course metadata
- Curriculum browser
- Responsive layout

✅ **Access Control**
- Batch verification
- 403 error on unauthorized access
- JWT token required

✅ **User Experience**
- Loading states
- Error handling
- Smooth navigation
- Mobile responsive

---

## 📞 **Need Help?**

### If My Courses doesn't load:
1. Check backend is running (port 5000)
2. Check student is in a batch
3. Check browser console for errors
4. Check network tab for API calls

### If Course Details shows 403:
1. Check you're in the batch with this course
2. Check batch has the course assigned
3. Check batch status = 'active'

### If Course Player doesn't load:
1. Check lesson ID is valid
2. Check course access is allowed
3. Check video URL is valid
4. Check browser console for errors

---

**All views are ready to explore!** 🎉

Start at: http://localhost:8080
