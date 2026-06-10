import axios from "axios";

// Client for the dynamic feedback-form endpoints (teacher author + student
// recipient). Admin reads live in admin/api/feedbackForms.js. All calls carry
// the Supabase access token so the server can verify teacher/student identity.
const ADMIN_BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

const authHeaders = (): Record<string, string> => {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export type QuestionType = "rating" | "text" | "mcq" | "yesno";

export interface FormQuestion {
  id: string;
  type: QuestionType;
  label: string;
  options?: string[];
}

export interface FeedbackFormSummary {
  id: number;
  teacher_id: string;
  title: string;
  description: string;
  course_id: string | null;
  questions: FormQuestion[];
  enabled: boolean;
  enabled_at: string | null;
  audience_count: number;
  response_count?: number;
  created_at: string;
}

export interface PendingForm {
  id: number;
  title: string;
  description: string;
  questions: FormQuestion[];
  teacher_name: string | null;
  course_title: string | null;
  enabled_at: string | null;
}

// ---- Teacher ----

export async function listTeacherForms(teacherId: string): Promise<FeedbackFormSummary[]> {
  const { data } = await axios.get(`${ADMIN_BASE}/api/public/feedback-forms/by-teacher/${teacherId}`, {
    params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...authHeaders() }, timeout: 30000,
  });
  return Array.isArray(data?.forms) ? data.forms : [];
}

export async function createForm(teacherId: string, body: {
  title: string; description?: string; courseId?: string; questions: FormQuestion[];
}): Promise<FeedbackFormSummary> {
  const { data } = await axios.post(`${ADMIN_BASE}/api/public/feedback-forms`,
    { teacherId, ...body }, { headers: authHeaders() });
  return data.form;
}

export async function updateForm(id: number, teacherId: string, body: Record<string, unknown>): Promise<FeedbackFormSummary> {
  const { data } = await axios.patch(`${ADMIN_BASE}/api/public/feedback-forms/${id}`,
    { teacherId, ...body }, { headers: authHeaders() });
  return data.form;
}

export async function setFormEnabled(id: number, teacherId: string, enabled: boolean): Promise<FeedbackFormSummary> {
  return updateForm(id, teacherId, { enabled });
}

export async function deleteForm(id: number, teacherId: string): Promise<void> {
  await axios.delete(`${ADMIN_BASE}/api/public/feedback-forms/${id}`, { params: { teacherId }, headers: authHeaders() });
}

// ---- Student ----

export async function listPendingForms(): Promise<PendingForm[]> {
  const { data } = await axios.get(`${ADMIN_BASE}/api/public/feedback-forms/for-student`, {
    params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...authHeaders() }, timeout: 30000,
  });
  return Array.isArray(data?.forms) ? data.forms : [];
}

export async function submitForm(id: number, answers: Record<string, number | string | boolean>): Promise<void> {
  await axios.post(`${ADMIN_BASE}/api/public/feedback-forms/${id}/submit`, { answers }, { headers: authHeaders() });
}
