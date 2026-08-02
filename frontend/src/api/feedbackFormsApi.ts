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

/** A batch the teacher can send a form to. */
export interface SendableBatch {
  id: string;
  name: string;
  student_count: number;
}

/** Batches this teacher teaches, for the Send dialog. */
export async function listSendableBatches(teacherId: string): Promise<SendableBatch[]> {
  const { data } = await axios.get(`${ADMIN_BASE}/api/public/feedback-forms/batches/${teacherId}`, {
    params: { t: Date.now() },
    headers: { "Cache-Control": "no-cache", ...authHeaders() },
    timeout: 30000,
  });
  return Array.isArray((data as { batches?: SendableBatch[] })?.batches)
    ? (data as { batches: SendableBatch[] }).batches
    : [];
}

/**
 * Send a form to the chosen batches. Enables the form and adds those students
 * to its audience, so it appears in their Feedback tab.
 */
export async function sendForm(
  id: number,
  teacherId: string,
  batchIds: string[],
): Promise<{ sent_to: number; newly_added: number }> {
  const { data } = await axios.post(
    `${ADMIN_BASE}/api/public/feedback-forms/${id}/send`,
    { teacherId, batchIds },
    { headers: authHeaders(), timeout: 30000 },
  );
  const d = data as { sent_to?: number; newly_added?: number };
  return { sent_to: d?.sent_to ?? 0, newly_added: d?.newly_added ?? 0 };
}

/** Per-question aggregate for one form (teacher + admin see the same shape). */
export interface FormQuestionStat {
  id: string;
  type: QuestionType;
  label: string;
  answered: number;
  average?: number;
  counts?: { option: string; count: number }[];
  yes?: number;
  no?: number;
  answers?: string[];
}

export interface FormStats {
  form: { id: number; title: string; description: string };
  total_responses: number;
  audience_count: number;
  questions: FormQuestionStat[];
}

/** One submission, attributed to the student who sent it. */
export interface FormResponse {
  id: number;
  student_id: string;
  student_name: string;
  answers: Record<string, number | string | boolean>;
  created_at: string;
}

export interface FormResponses {
  form: { id: number; title: string; questions: FormQuestion[] };
  responses: FormResponse[];
}

/** Aggregated results for one of the teacher's own forms. */
export async function getFormStats(id: number, teacherId: string): Promise<FormStats> {
  const { data } = await axios.get(`${ADMIN_BASE}/api/public/feedback-forms/${id}/stats`, {
    params: { teacherId, t: Date.now() },
    headers: { "Cache-Control": "no-cache", ...authHeaders() },
    timeout: 30000,
  });
  return data as FormStats;
}

/** Individual (anonymous) responses to one of the teacher's own forms. */
export async function getFormResponses(id: number, teacherId: string): Promise<FormResponses> {
  const { data } = await axios.get(`${ADMIN_BASE}/api/public/feedback-forms/${id}/responses`, {
    params: { teacherId, t: Date.now() },
    headers: { "Cache-Control": "no-cache", ...authHeaders() },
    timeout: 30000,
  });
  return data as FormResponses;
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
