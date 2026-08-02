import axios from "axios";

/**
 * Student-facing assignment client.
 *
 * Backed by the assignment routes mounted at `/api/public` behind
 * `requireStudent` (see admin-service `server.js`), so every call MUST carry the
 * Supabase access token — the server derives the student from the verified JWT
 * and never from a body/query parameter.
 *
 * NOTE: this is deliberately separate from the older `assignmentApi.ts`, whose
 * URL template literals are corrupted (`\\/api/admin/assignments\`) and which
 * sends no Authorization header — it cannot work against these routes.
 */

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

const authHeaders = (): Record<string, string> => {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/** A submission the student has already made for an assignment. */
export interface AssignmentSubmission {
  id: number;
  status: "submitted" | "graded" | "not_submitted";
  submitted_date: string | null;
  score: number | null;
  feedback: string | null;
}

/**
 * One row of GET /api/public/my-assignments. `submissions` is the student's own
 * submission list (server filters by their student_id) — empty when unsubmitted.
 */
/** A link or uploaded file the teacher attached to the assignment. */
export interface AssignmentAttachment {
  kind: "file" | "link";
  url: string;
  name: string | null;
  mime: string | null;
}

export interface StudentAssignment {
  id: number;
  batch_id: string | null;
  course_id: number | null;
  title: string;
  description: string | null;
  instructions: string | null;
  due_date: string | null;
  max_score: number | null;
  status: "draft" | "published" | "closed";
  /** Reference material (PDFs, images, links). Null/absent when none. */
  attachments?: AssignmentAttachment[] | null;
  /** Teacher's heading for that material, e.g. "Read before class". */
  attachments_title?: string | null;
  submissions?: AssignmentSubmission[];
}

/** Every assignment across the student's active batches, newest due date first. */
export async function listMyAssignments(): Promise<StudentAssignment[]> {
  const { data } = await axios.get(`${ADMIN_BASE}/api/public/my-assignments`, {
    params: { t: Date.now() },
    headers: { "Cache-Control": "no-cache", ...authHeaders() },
    timeout: 30000,
  });
  return Array.isArray(data?.assignments) ? data.assignments : [];
}

/** A scheduled class session for one of the student's courses. */
export interface StudentClass {
  id: number;
  name: string;
  course_id: string | null;
  course_title: string | null;
  start_at: string | null;
  end_at: string | null;
  meeting_link: string | null;
  teacher_names: string[];
}

/**
 * Upcoming classes for the signed-in student, soonest first.
 * Server-scoped to the courses they have access to; still in progress classes
 * are included (the server filters on end_at, not start_at).
 */
export async function listMyClasses(limit = 20): Promise<StudentClass[]> {
  const { data } = await axios.get(`${ADMIN_BASE}/api/public/my-classes`, {
    params: { limit, t: Date.now() },
    headers: { "Cache-Control": "no-cache", ...authHeaders() },
    timeout: 30000,
  });
  return Array.isArray(data?.classes) ? data.classes : [];
}

/** One PDF attached to a resource. `url` is a public R2 link. */
export interface StudentMaterialFile {
  name: string;
  url: string;
}

/** One row of GET /api/public/my-resources. */
export interface StudentMaterial {
  id: number;
  title: string;
  description: string | null;
  files: StudentMaterialFile[];
  course_id: number | null;
  course_title: string | null;
  resource_category_id: number | null;
  category_name: string | null;
  section: string | null;
}

/** Materials grouped under the teacher's section header. */
export interface StudentMaterialSection {
  section: string;
  resources: StudentMaterial[];
}

/**
 * Course materials (PDFs) for the signed-in student.
 * Server-scoped to the courses they are enrolled in or delegated to — the
 * student id comes only from the verified JWT, never from a parameter.
 */
export async function listMyMaterials(): Promise<StudentMaterialSection[]> {
  const { data } = await axios.get(`${ADMIN_BASE}/api/public/my-resources`, {
    params: { t: Date.now() },
    headers: { "Cache-Control": "no-cache", ...authHeaders() },
    timeout: 30000,
  });
  return Array.isArray(data?.sections) ? data.sections : [];
}

/** Submit text and/or a file URL for one assignment. */
export async function submitAssignment(
  assignmentId: number,
  body: { submission_text?: string; file_url?: string },
): Promise<void> {
  await axios.post(
    `${ADMIN_BASE}/api/public/assignments/${assignmentId}/submit`,
    body,
    { headers: authHeaders(), timeout: 30000 },
  );
}
