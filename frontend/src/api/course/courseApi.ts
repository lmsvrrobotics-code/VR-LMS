import axios from "axios";

const BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

const api = axios.create({
  baseURL: `${BASE}/api/public`,
  timeout: 15000,
});

// Tag every request with the current student so server-side per-user keying works.
// Without this, every browser falls into the controller's default user_id=99 bucket
// and progress gets shared across students.
api.interceptors.request.use((config) => {
  const id = localStorage.getItem("userId");
  if (id) config.headers.set("x-user-id", String(id));
  // Send the auth token too so the server can VERIFY who the student/admin is.
  // Release-gating (teacher-delegated courses) trusts the verified token id,
  // not the spoofable x-user-id header — without this, delegated lessons stay
  // locked for the logged-in student.
  // Check for both accessToken (student/teacher) and admin_token (admin preview).
  const token = localStorage.getItem("accessToken") || localStorage.getItem("admin_token");
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

export const listCourses = (params?: Record<string, unknown>) =>
  api.get("/courses", { params }).then((r) => r.data);

// Canonical "My Courses" (lms_admin): paid ∪ enrolled ∪ delegated, with progress.
export const getMyCourses = () =>
  api.get("/my-courses").then((r) => (r.data?.courses ?? []) as unknown[]);

// Student → teacher/class feedback. submit + read the student's own past ones.
export const submitTeacherFeedback = (payload: {
  courseId?: number | string;
  ratings: Record<string, number>;
  enjoyed?: string;
  suggestions?: string;
}) => api.post("/teacher-feedback", payload).then((r) => r.data);

export const getMyTeacherFeedback = () =>
  api.get("/teacher-feedback/mine").then((r) => (r.data?.feedback ?? []) as unknown[]);

/** One of the student's own feedback submissions. */
export interface MyFeedbackItem {
  id: number;
  course_id: string | null;
  course_title: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  ratings: Record<string, number>;
  overall: number;
  enjoyed: string;
  suggestions: string;
  created_at: string;
}

/** The student's submissions grouped into one entry per teacher they rated. */
export interface MyFeedbackByTeacher {
  teacher_id: string | null;
  teacher_name: string;
  count: number;
  avg_overall: number;
  latest_at: string | null;
  feedback: MyFeedbackItem[];
}

/**
 * The student's own past feedback, grouped by teacher — powers the teacher-wise
 * tabs on the student dashboard. Server derives the student from the JWT.
 */
export const getMyTeacherFeedbackByTeacher = () =>
  api
    .get("/teacher-feedback/mine")
    .then((r) => (r.data?.teachers ?? []) as MyFeedbackByTeacher[]);

// Feedback a teacher has RECEIVED about their classes (their own only —
// the server enforces self-or-admin). Student names are withheld server-side.
export interface ReceivedFeedbackItem {
  id: number;
  course_id?: string | null;
  course_title?: string | null;
  ratings: Record<string, number>;
  overall: number;
  enjoyed?: string;
  suggestions?: string;
  created_at?: string;
}
export interface ReceivedFeedback {
  stats: {
    total_feedback: number;
    overall_avg: number;
    per_attribute: Record<string, number>;
    attributes: { key: string; label: string }[];
  };
  feedback: ReceivedFeedbackItem[];
}
export const getFeedbackForTeacher = (teacherId: string) =>
  api
    .get(`/teacher-feedback/by-teacher/${encodeURIComponent(teacherId)}`)
    .then((r) => r.data as ReceivedFeedback);

// Student leaderboard. Pass a courseId for the per-course board; omit for overall.
export const getLeaderboard = (courseId?: number) =>
  api
    .get("/leaderboard", { params: courseId ? { course_id: courseId } : {} })
    .then((r) => r.data as {
      scope: string;
      course_id: number | null;
      total_ranked: number;
      leaderboard: { user_id: string; name: string; completed: number; quiz_points: number; score: number; rank: number }[];
      me: { user_id: string; name: string; completed: number; quiz_points: number; score: number; rank: number } | null;
    });

// Public course details — NO auth required. If server returns 401,
// it's a bug (endpoint should be public). Don't redirect on 401 here.
export const getCourseDetails = (slug: string) => {
  // Create a public-only axios instance that ignores auth tokens
  const publicApi = axios.create({
    baseURL: `${BASE}/api/public`,
    timeout: 15000,
  });
  return publicApi.get(`/course/${slug}`).then((r) => r.data);
};

export const getPlayer = (slug: string, lessonId?: number | string) =>
  api.get(`/player/${slug}`, { params: { lesson_id: lessonId } }).then((r) => r.data);

export const completeLesson = (courseId: number, lessonId: number) =>
  api.post("/player/complete", { course_id: courseId, lesson_id: lessonId }).then((r) => r.data);

// Persist a quiz attempt so the score/retry state survives page reloads.
// quizId is the quiz lesson's id. Returns the authoritative attempts count.
export const submitQuizAttempt = (
  quizId: number,
  score: number,
  total: number,
) =>
  api
    .post("/player/quiz-submit", { quiz_id: quizId, score, total })
    .then((r) => r.data as { attempts_used: number; persisted: boolean });

export type LessonProgressResult = {
  lesson_id: number;
  current_duration: number;
  watched_seconds: number;
  total_seconds: number;
  is_completed: 0 | 1;
};

export const updateLessonProgress = (
  courseId: number,
  lessonId: number,
  currentDuration: number,
) =>
  api
    .post("/player/progress", {
      course_id: courseId,
      lesson_id: lessonId,
      current_duration: currentDuration,
    })
    .then((r) => r.data as LessonProgressResult);

export type CourseProgressSummary = {
  user_id: number;
  max_progress: number;
  completed_any: boolean;
};

// Returns the user's highest course progress across all enrolled courses.
// Used by the Assessments tab to gate the Post-Assessment button.
export const getCourseProgressSummary = (userId?: number | string) =>
  api
    .get("/course-progress", { params: { user_id: userId } })
    .then((r) => r.data as CourseProgressSummary);

// ---- Certificate (student-side) ----

export type StudentCertificate = {
  id: number;
  user_id: number;
  course_id: number;
  identifier: string;
  issued_at?: string | null;
  created_at?: string;
};

// Returns the issued certificate for the current student + course pair, or
// null if the student hasn't completed the course yet. The x-user-id header
// is set by the request interceptor above.
export const findCourseCertificate = (courseId: number) =>
  api
    .get("/certificate/find", { params: { course_id: courseId } })
    .then((r) => r.data as { certificate: StudentCertificate | null });

// Idempotent: when progress < 100 the server rejects with a 400; when an
// (user_id, course_id) row already exists, returns it with created=false.
export const issueCourseCertificate = (courseId: number, progress = 100) =>
  api
    .post("/certificate/issue", { course_id: courseId, progress })
    .then((r) => r.data as { certificate: StudentCertificate; created: boolean });

// Returns every certificate the current student (x-user-id header) has earned,
// each with the joined course so the dashboard can show program title + date.
export type StudentCertificateWithCourse = StudentCertificate & {
  course?: { id: number; title?: string; slug?: string } | null;
};
export const listMyCertificates = () =>
  api
    .get("/certificate/mine")
    .then((r) => r.data as { certificates: StudentCertificateWithCourse[] });
