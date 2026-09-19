import axios from "axios";

/**
 * Student-facing founder-meeting client.
 *
 * Backed by the public route `GET /api/public/founder-meeting/mine` (optional
 * auth via attachVerifiedId): the server matches the signed-in student by their
 * verified id, falling back to their account email, and returns the meetings
 * they registered for plus upcoming ones they can still join. The Authorization
 * header is what lets the server identify the student, so it is always sent.
 */

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

const authHeaders = (): Record<string, string> => {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/** A founder meeting as the public payload exposes it (no join link). */
export interface FounderMeeting {
  id: number;
  title: string;
  description: string;
  scheduled_at: string | null;
  duration_mins: number;
  video_url: string | null;
  poster_url: string | null;
  state: "unscheduled" | "upcoming" | "live" | "past";
  can_register: boolean;
  capacity: number | null;
  /** Present only on registered meetings. */
  registration_status?: string;
  /** The join link — released only on the student's OWN registered meetings,
   *  and only while the session is still joinable (null once it's past). */
  meeting_link?: string | null;
}

export interface MyFounderMeetings {
  registered: FounderMeeting[];
  upcoming: FounderMeeting[];
}

/** The signed-in student's founder meetings (registered + upcoming). */
export async function getMyFounderMeetings(): Promise<MyFounderMeetings> {
  const { data } = await axios.get<MyFounderMeetings>(
    `${ADMIN_BASE}/api/public/founder-meeting/mine`,
    { headers: authHeaders() },
  );
  return {
    registered: Array.isArray(data?.registered) ? data.registered : [],
    upcoming: Array.isArray(data?.upcoming) ? data.upcoming : [],
  };
}

/**
 * Register the signed-in student for a meeting. Returns the join link, which
 * the server releases only on successful registration.
 */
export async function registerForFounderMeeting(
  id: number,
  body: { name: string; email: string; phone?: string; message?: string },
): Promise<{ success?: string; meeting_link?: string | null; already_registered?: boolean }> {
  const { data } = await axios.post(
    `${ADMIN_BASE}/api/public/founder-meeting/${id}/register`,
    body,
    { headers: { ...authHeaders(), "Content-Type": "application/json" } },
  );
  return data;
}
