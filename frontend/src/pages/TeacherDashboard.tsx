import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/hooks/useAuth";
import { updateProfile, changePassword } from "@/api/authApi";
import { uploadStudentPhoto } from "@/api/leadApi";
import { toast } from "react-toastify";
// REMOVED: TeachingAssignmentsIndex (teaching assignment feature removed)
// Replaced by Batch Management System
import ScheduleCalendar, { type ScheduleEvent } from "@/components/schedule/ScheduleCalendar";
import FeedbackFormsView from "@/components/teacher/FeedbackFormsView";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useDashboardTheme } from "@/hooks/useDashboardTheme";
import {
  Menu,
  X,
  Video,
  Calendar,
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  MonitorPlay,
  Users,
  Library,
  Contact,
  Megaphone,
  IndianRupee,
  ClipboardList,
  ClipboardCheck,
  Power,
  Info,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

/**
 * VR Robotics Academy — Teacher (Mentor) Dashboard.
 * Standalone dashboard view (its own sidebar; rendered outside the marketing
 * Layout). New addition only — does not change any existing functionality.
 */

// Only sections wired to real admin data. Dashboard(earnings), Referral, Payout,
// Tasks were placeholders ("coming soon" / unbuilt earnings) → removed until
// the earning rules are defined.
// Slots + Free Schedule removed from the teacher sidebar by request. Their
// view components (SlotsView / FreeScheduleView) and the render branches below
// are left intact but unreachable, so the feature can be restored by re-adding
// the nav entries.
const navItems = [
  { name: "My Courses", icon: MonitorPlay },
  { name: "Demos", icon: MessageSquare },
  { name: "Classes", icon: MonitorPlay },
  { name: "Calendar", icon: CalendarDays },
  { name: "Students", icon: Users },
  { name: "Feedback Forms", icon: ClipboardList },
  { name: "Resources", icon: Library },
  { name: "Profile", icon: Contact },
];

/**
 * TODO(backend): replace this static placeholder with live data.
 * Suggested API: GET /api/teacher/earnings?month=YYYY-MM  (auth: teacher)
 * returning a payload shaped exactly like `DashboardData` below, so wiring is a
 * drop-in. See the commented useEffect in the component for the fetch scaffold.
 */
type DashboardData = {
  month: string;
  earnings: { demos: string; classes: string; other: string };
  penalties: { penalizedClasses: string; disputedSessions: string };
  demos: { successful: string; unsuccessful: string; conversions: string };
  classes: { paid: string; unsuccessful: string; cancelled: string; punctuality: string };
};

const PLACEHOLDER_DATA: DashboardData = {
  month: "May 2026",
  earnings: { demos: "₹0", classes: "₹0", other: "₹0" },
  penalties: { penalizedClasses: "—", disputedSessions: "—" },
  demos: { successful: "0", unsuccessful: "0", conversions: "—" },
  classes: { paid: "0", unsuccessful: "0", cancelled: "0", punctuality: "0%" },
};

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="flex-1 min-w-[140px] rounded-xl bg-muted/60 px-5 py-4">
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
  </div>
);

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

// The /by-teacher endpoints are now gated (verified teacher self / admin) — send
// the auth token so the teacher can read their OWN data.
const teacherAuthHeaders = (): Record<string, string> => {
  const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface TeacherSlot {
  id: number;
  name: string;
  course_title: string | null;
  start_at: string | null;
  end_at: string | null;
  meeting_link: string | null;
  students: { id: string; name: string }[];
}

// All times shown to teachers are in India Standard Time (Asia/Kolkata),
// 12-hour, regardless of the viewer's device timezone.
const IST = "Asia/Kolkata";

const fmtSlot = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST,
  });
};

// Split helpers for the table views (Date / Day / Time columns).
const fmtDate = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: IST });
};
const fmtDay = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { weekday: "short", timeZone: IST });
};
const fmtTime = (raw: string | null) => {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST });
};
// "HH:MM" clock strings (timetable / free slots) -> "h:MM AM/PM". These are
// already wall-clock (no timezone), so just reformat to 12-hour.
const hhmmTo12 = (raw: string | null) => {
  if (!raw) return "—";
  const [hRaw, mRaw] = String(raw).split(":");
  const h = Number(hRaw);
  if (Number.isNaN(h)) return raw;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(mRaw ?? "00").padStart(2, "0")} ${ampm}`;
};

/**
 * Slots assigned to the logged-in teacher. Mirrors the admin Slots feature:
 * whatever the super admin assigns to this teacher (by name) shows up here,
 * with course, time window, the Google Meet link, and the student roster.
 */
const SlotsView = ({ teacherId }: { teacherId?: string }) => {
  const [slots, setSlots] = useState<TeacherSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) { setSlots([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/slots/by-teacher/${teacherId}`, {
        params: { t: Date.now() },
        headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() },
        timeout: 30000,
      })
      .then(({ data }) => { if (!cancelled) setSlots(Array.isArray(data?.slots) ? data.slots : []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId]);

  if (!teacherId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Slots</h1>
        <p className="text-muted-foreground">Sign in as a teacher to see your assigned slots.</p>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm p-6">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Calendar className="w-6 h-6 text-primary" /> My Slots
      </h1>
      {loading ? (
        <p className="text-muted-foreground py-8 text-center">Loading slots…</p>
      ) : slots.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          No slots assigned to you yet. Slots created for you in admin will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Slot Date</th>
                <th className="py-2 pr-4">Day</th>
                <th className="py-2 pr-4">Slot Time</th>
                <th className="py-2 pr-4">Course</th>
                <th className="py-2 pr-4">Students</th>
                <th className="py-2 pr-4">Session</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="py-3 pr-4 whitespace-nowrap">{fmtDate(s.start_at)}</td>
                  <td className="py-3 pr-4">{fmtDay(s.start_at)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{fmtTime(s.start_at)} – {fmtTime(s.end_at)}</td>
                  <td className="py-3 pr-4">{s.course_title || s.name || "—"}</td>
                  <td className="py-3 pr-4">{s.students.length}</td>
                  <td className="py-3 pr-4">
                    {s.meeting_link
                      ? <a href={s.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-gradient-hero text-white text-xs font-semibold px-3 py-1.5"><Video className="w-3.5 h-3.5" /> Join</a>
                      : <span className="text-muted-foreground text-xs">NA</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

// Generic fetch for a teacher-scoped public endpoint. Returns the array under
// `key` (e.g. demos/classes/entries/resources). Live (no-cache) so admin
// additions show without stale data.
function useTeacherList<T>(teacherId: string | undefined, path: string, key: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!teacherId) { setItems([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/${path}/by-teacher/${teacherId}`, {
        params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000,
      })
      .then(({ data }) => { if (!cancelled) setItems(Array.isArray(data?.[key]) ? data[key] : []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId, path, key]);
  return { items, loading };
}

const Panel = ({ title, icon: Icon, children }: { title: string; icon: typeof Calendar; children: ReactNode }) => (
  <section className="bg-white rounded-2xl shadow-sm p-6">
    <h1 className="text-2xl font-bold mb-4 flex items-center gap-2"><Icon className="w-6 h-6 text-primary" /> {title}</h1>
    {children}
  </section>
);

const Empty = ({ text }: { text: string }) => <p className="text-muted-foreground py-8 text-center">{text}</p>;

const DemosView = ({ teacherId }: { teacherId?: string }) => {
  const { items, loading } = useTeacherList<{ id: number; title: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null }>(teacherId, "demos", "demos");
  return (
    <Panel title="My Demos" icon={MessageSquare}>
      {loading ? <Empty text="Loading demos…" /> : items.length === 0 ? <Empty text="No demos assigned to you yet." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4">Demo</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Day</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Course</th>
                <th className="py-2 pr-4">Meeting</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-b">
                  <td className="py-3 pr-4 font-medium">{d.title}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{fmtDate(d.start_at)}</td>
                  <td className="py-3 pr-4">{fmtDay(d.start_at)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{fmtTime(d.start_at)} – {fmtTime(d.end_at)}</td>
                  <td className="py-3 pr-4">{d.course_title || "—"}</td>
                  <td className="py-3 pr-4">
                    {d.meeting_link
                      ? <a href={d.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"><Video className="w-4 h-4" /> Join</a>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

const ClassesView = ({ teacherId }: { teacherId?: string }) => {
  const { items, loading } = useTeacherList<{ id: number; name: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null; course_student_count?: number }>(teacherId, "classes", "classes");
  return (
    <Panel title="My Classes" icon={MonitorPlay}>
      {loading ? <Empty text="Loading classes…" /> : items.length === 0 ? <Empty text="No classes assigned to you yet." /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl border border-border p-4 flex flex-col gap-2">
              <div className="font-semibold text-lg">{c.name}</div>
              {c.course_title && <div className="text-sm text-muted-foreground">{c.course_title}</div>}
              <div className="text-sm"><span className="font-medium">{fmtSlot(c.start_at)}</span><span className="text-muted-foreground"> → {fmtSlot(c.end_at)}</span></div>
              <div className="text-xs text-muted-foreground">{c.course_student_count ?? 0} student{(c.course_student_count ?? 0) === 1 ? "" : "s"} assigned to this course</div>
              {c.meeting_link
                ? <a href={c.meeting_link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-hero text-white text-sm font-semibold px-3 py-2"><Video className="w-4 h-4" /> Join class</a>
                : <span className="text-xs text-muted-foreground mt-1">No meeting link</span>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};

// Teacher Calendar — visualises the teacher's own Demos + Classes (whatever an
// admin scheduled with this teacher in teacher_ids) on a month/week/day grid.
// Reuses the same by-teacher endpoints the Demos/Classes tabs use.
const TeacherCalendarView = ({ teacherId }: { teacherId?: string }) => {
  const { items: demos, loading: demosLoading } = useTeacherList<{ id: number; title: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null }>(teacherId, "demos", "demos");
  const { items: classes, loading: classesLoading } = useTeacherList<{ id: number; name: string; course_title: string | null; start_at: string | null; end_at: string | null; meeting_link: string | null }>(teacherId, "classes", "classes");

  const events: ScheduleEvent[] = useMemo(() => {
    const out: ScheduleEvent[] = [];
    for (const d of demos) {
      if (!d.start_at) continue;
      out.push({ id: `demo-${d.id}`, title: d.title || "Demo", start: new Date(d.start_at), end: new Date(d.end_at || d.start_at), type: "demo", courseTitle: d.course_title, meetingLink: d.meeting_link });
    }
    for (const c of classes) {
      if (!c.start_at) continue;
      out.push({ id: `class-${c.id}`, title: c.name || "Class", start: new Date(c.start_at), end: new Date(c.end_at || c.start_at), type: "class", courseTitle: c.course_title, meetingLink: c.meeting_link });
    }
    return out;
  }, [demos, classes]);

  return (
    <Panel title="My Calendar" icon={CalendarDays}>
      <ScheduleCalendar events={events} loading={demosLoading || classesLoading} />
    </Panel>
  );
};

interface TeacherResource {
  id: number;
  title: string;
  description: string | null;
  files: { name: string; url: string }[];
  resource_category_id: number | null;
  category_name: string | null;
  course_id: number | null;
  course_title: string | null;
  section: string | null;
}

const ResourcesView = ({ teacherId }: { teacherId?: string }) => {
  const { items, loading } = useTeacherList<TeacherResource>(teacherId, "resources", "resources");
  const [cat, setCat] = useState<string>("all");
  const [course, setCourse] = useState<string>("all");

  // Distinct categories among the teacher's assigned resources (radio filter).
  const categories = Array.from(
    new Map(
      items.filter((r) => r.resource_category_id).map((r) => [String(r.resource_category_id), r.category_name || "Category"]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  // Courses available within the selected category (dropdown filter).
  const courses = Array.from(
    new Map(
      items
        .filter((r) => cat === "all" || String(r.resource_category_id) === cat)
        .filter((r) => r.course_id)
        .map((r) => [String(r.course_id), r.course_title || `Course ${r.course_id}`]),
    ).entries(),
  ).map(([id, title]) => ({ id, title }));

  const filtered = items.filter(
    (r) =>
      (cat === "all" || String(r.resource_category_id) === cat) &&
      (course === "all" || String(r.course_id) === course),
  );

  // Group the filtered resources' PDFs under their section header.
  const sectionMap = new Map<string, { name: string; url: string }[]>();
  filtered.forEach((r) => {
    const key = r.section || "Resources";
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    (r.files || []).forEach((f) => sectionMap.get(key)!.push(f));
  });
  const sections = Array.from(sectionMap.entries())
    .map(([name, files]) => ({ name, files }))
    .filter((s) => s.files.length > 0);

  return (
    <Panel title="Resources" icon={Library}>
      {loading ? (
        <Empty text="Loading resources…" />
      ) : items.length === 0 ? (
        <Empty text="No resources shared with you yet." />
      ) : (
        <>
          {/* Filters: category radios + course dropdown */}
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-4 mb-6">
            <div className="rounded-xl border border-border p-4 flex-1">
              <p className="text-sm font-semibold text-muted-foreground mb-2">Select Category</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" name="res-cat" checked={cat === "all"} onChange={() => { setCat("all"); setCourse("all"); }} className="accent-primary" /> All
                </label>
                {categories.map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-2 cursor-pointer text-sm">
                    <input type="radio" name="res-cat" checked={cat === c.id} onChange={() => { setCat(c.id); setCourse("all"); }} className="accent-primary" /> {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border p-4 lg:w-72">
              <p className="text-sm font-semibold text-muted-foreground mb-2">Select Course</p>
              <select value={course} onChange={(e) => setCourse(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-white">
                <option value="all">All courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sections of PDF cards */}
          {sections.length === 0 ? (
            <Empty text="No resources match this filter." />
          ) : (
            <div className="space-y-6">
              {sections.map((s) => (
                <div key={s.name} className="rounded-xl border border-border overflow-hidden">
                  <div className="bg-primary/5 px-5 py-3 font-semibold text-primary">{s.name}</div>
                  <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {s.files.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors p-3"
                      >
                        <span className="shrink-0 w-10 h-10 rounded bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">PDF</span>
                        <span className="text-sm font-medium leading-snug line-clamp-2">{f.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
};

// Teacher profile — built from the auth-service profile in the auth context,
// with inline editing (Edit profile) that PUTs to /auth/profile/update.
const ProfileView = ({ user }: { user: Record<string, unknown> | null }) => {
  const seed = (k: string) => {
    const v = user?.[k];
    return v === undefined || v === null ? "" : String(v);
  };
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Local copy so saved edits show immediately without a full auth refetch.
  const [data, setData] = useState({
    name: seed("name"), bio: seed("bio"), expertise: seed("expertise"),
    yearsOfExperience: seed("yearsOfExperience"), linkedinUrl: seed("linkedinUrl"),
    phone: seed("phone"), email: seed("email"),
  });
  const [form, setForm] = useState(data);
  const set = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));

  // Profile photo — uploaded via the shared self-service endpoint
  // (/api/public/profile/photo). It's stored on the user row and also feeds the
  // instructor avatar on the public course pages (teacherPhoto ∪ studentPhoto).
  const [photo, setPhoto] = useState<string>(seed("teacherPhoto") || seed("studentPhoto"));
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoUrl = photo ? `${ADMIN_BASE}/${photo}` : "";
  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const res = await uploadStudentPhoto(file);
      setPhoto(res.photo);
      toast.success("Profile photo updated");
    } catch {
      toast.error("Failed to upload photo. Try a smaller JPG/PNG.");
    } finally {
      setPhotoUploading(false);
    }
  };

  if (!user) return <Empty text="Sign in as a teacher to see your profile." />;

  const name = data.name || data.email || "Teacher";
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const years = data.yearsOfExperience;
  const expertise = data.expertise.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

  const startEdit = () => { setForm(data); setEditing(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        name: form.name, phone: form.phone, bio: form.bio, expertise: form.expertise,
        yearsOfExperience: form.yearsOfExperience, linkedinUrl: form.linkedinUrl,
      } as unknown as Parameters<typeof updateProfile>[0]);
      setData(form);
      setEditing(false);
      toast.success("Profile updated");
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Failed to update profile");
    } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <Panel title="Edit Profile" icon={Contact}>
        <form onSubmit={save} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium mb-1">Profile photo</label>
            <div className="flex items-center gap-4">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border border-border" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-hero text-white text-2xl font-bold flex items-center justify-center">{initials || "T"}</div>
              )}
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoUploading}
                  className="rounded-lg border border-border text-sm font-semibold px-4 py-2 disabled:opacity-60"
                >
                  {photoUploading ? "Uploading…" : "Upload / change photo"}
                </button>
                <p className="text-xs text-muted-foreground mt-1">JPG or PNG. The photo saves immediately.</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">About me</label>
            <textarea rows={4} className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Tell students and parents about your teaching…" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Expertise <span className="text-muted-foreground font-normal">(comma-separated)</span></label>
              <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.expertise} onChange={(e) => set("expertise", e.target.value)} placeholder="Scratch, Python, Robotics" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Years of experience</label>
              <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.yearsOfExperience} onChange={(e) => set("yearsOfExperience", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">LinkedIn URL</label>
              <input className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-5 py-2">{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border text-sm font-semibold px-5 py-2">Cancel</button>
          </div>
        </form>
      </Panel>
    );
  }

  return (
    <>
    <Panel title="My Profile" icon={Contact}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-5">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-hero text-white text-2xl font-bold flex items-center justify-center shrink-0">{initials || "T"}</div>
          )}
          <div>
            <h2 className="text-2xl font-bold">{name}</h2>
            <p className="text-muted-foreground text-sm mt-1">{years ? `Teaching experience: ${years} year${years === "1" ? "" : "s"}` : "Teacher"}</p>
          </div>
        </div>
        <button type="button" onClick={startEdit} className="rounded-lg border border-border text-sm font-semibold px-4 py-2 hover:bg-muted">Edit profile ✎</button>
      </div>

      {data.bio && (
        <div className="mb-6">
          <h3 className="font-semibold mb-1">Get to know me</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">{data.bio}</p>
        </div>
      )}

      {expertise.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold mb-2">High expertise in</h3>
          <div className="flex flex-wrap gap-2">
            {expertise.map((e) => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
                <span className="text-primary">★</span> {e}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-semibold mb-2">Contact</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {data.email && <div><span className="text-muted-foreground">Email: </span>{data.email}</div>}
          {data.phone && <div><span className="text-muted-foreground">Phone: </span>{data.phone}</div>}
          {data.linkedinUrl && (
            <div>
              <span className="text-muted-foreground">LinkedIn: </span>
              <a href={data.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{data.linkedinUrl}</a>
            </div>
          )}
        </div>
      </div>
    </Panel>
    <TeacherChangePassword />
    </>
  );
};

function TeacherChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) return setMsg({ ok: false, text: "New password must be at least 8 characters." });
    if (next !== confirm) return setMsg({ ok: false, text: "New passwords do not match." });
    setBusy(true);
    try {
      await changePassword({ currentPassword: cur, newPassword: next });
      setMsg({ ok: true, text: "Password changed successfully." });
      setCur(""); setNext(""); setConfirm("");
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Could not change password.";
      setMsg({ ok: false, text });
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-6">
      <Panel title="Change Password" icon={Contact}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-4 items-end max-w-3xl">
          <div>
            <label className="block text-sm font-medium mb-1">Current password</label>
            <input type="password" className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={cur} onChange={(e) => setCur(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New password</label>
            <input type="password" className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm new password</label>
            <input type="password" className="w-full rounded-lg border border-border px-3 py-2 text-sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button type="submit" disabled={busy} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-5 py-2">{busy ? "Saving…" : "Update password"}</button>
            {msg && <span className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
          </div>
        </form>
      </Panel>
    </div>
  );
}

const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
interface FreeSlot { id: number; day_of_week: number; start_time: string; end_time: string }

// Teacher-authored weekly availability. The teacher adds/removes free slots per
// day; persisted via the public free-schedule endpoints keyed by teacherId.
const FreeScheduleView = ({ teacherId }: { teacherId?: string }) => {
  const [items, setItems] = useState<FreeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!teacherId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/free-schedule/by-teacher/${teacherId}`, { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 })
      .then(({ data }) => setItems(Array.isArray(data?.schedule) ? data.schedule : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [teacherId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || !start || !end) return;
    setSaving(true);
    try {
      await axios.post(`${ADMIN_BASE}/api/public/free-schedule`, { teacherId, day_of_week: day, start_time: start, end_time: end }, { headers: teacherAuthHeaders() });
      setStart(""); setEnd(""); load();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    try { await axios.delete(`${ADMIN_BASE}/api/public/free-schedule/${id}`, { params: { teacherId }, headers: teacherAuthHeaders() }); load(); } catch { /* ignore */ }
  };

  if (!teacherId) return <Panel title="Free Schedule" icon={CalendarDays}><Empty text="Sign in as a teacher to manage your free schedule." /></Panel>;

  return (
    <Panel title="Free Schedule" icon={CalendarDays}>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 mb-6 rounded-xl border border-border p-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Day</label>
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="rounded-lg border border-border px-3 py-2 text-sm bg-white">
            {WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">From</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">To</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border border-border px-3 py-2 text-sm" required />
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4 py-2">{saving ? "Adding…" : "+ Add Schedule"}</button>
      </form>

      {loading ? <Empty text="Loading…" /> : (
        <div className="space-y-4">
          {WEEK.map((dname, di) => {
            const daySlots = items.filter((s) => s.day_of_week === di).sort((a, b) => a.start_time.localeCompare(b.start_time));
            return (
              <div key={di} className="rounded-xl border border-border p-4">
                <h3 className="font-semibold mb-3">{dname}</h3>
                {daySlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No slots.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                        {hhmmTo12(s.start_time)} – {hhmmTo12(s.end_time)}
                        <button type="button" onClick={() => remove(s.id)} className="text-muted-foreground hover:text-red-600 font-bold leading-none" aria-label="Remove">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};

const BADGES = [
  { key: "homework_hero", label: "Homework Hero" },
  { key: "quick_learner", label: "Quick Learner" },
  { key: "never_gives_up", label: "Never Gives Up" },
  { key: "future_leader", label: "Future Leader" },
  { key: "always_on_time", label: "Always on Time" },
];
interface StudentRec { id: number; kind: string; data: Record<string, unknown> }

// Post-class performance evaluation attributes (1-5 stars each). Mirrors the
// Moonpreneur-style evaluation form; surfaced as admin dashboard stats.
const EVAL_ATTRS = [
  { key: "curiosity", label: "Curiosity Level" },
  { key: "participation", label: "Participation Level" },
  { key: "attentiveness", label: "Attentiveness / Focus" },
  { key: "attention", label: "Attention / Tardy" },
  { key: "creativity", label: "Creativity Level" },
  { key: "camera", label: "Camera" },
];

// Click-to-set 1-5 star rating; clicking the current value clears it.
const StarRating = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => onChange(n === value ? 0 : n)}
        aria-label={`${n} star${n > 1 ? "s" : ""}`}
        className={`text-xl leading-none transition-transform hover:scale-110 ${n <= value ? "text-yellow-400" : "text-gray-300 dark:text-white/25"}`}
      >
        ★
      </button>
    ))}
  </div>
);

// Read-only star display for a 0-5 value.
const Stars = ({ value }: { value: number }) => {
  const v = Math.round(value || 0);
  return (
    <span className="tracking-tight">
      <span className="text-yellow-400">{"★".repeat(v)}</span>
      <span className="text-gray-300 dark:text-white/25">{"★".repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
};

// Per-student detail: goals, badges, SPR notes, school marks and projects.
// All persisted via the flexible /student-records endpoints (kind + data).
const StudentDetail = ({ teacherId, student }: { teacherId: string; student: { id: string; name: string; classes: number; slots: number } }) => {
  const [records, setRecords] = useState<StudentRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [primary, setPrimary] = useState("");
  const [acad, setAcad] = useState({ subject: "", grade: "", goal: "" });
  const [spr, setSpr] = useState("");
  const [mark, setMark] = useState({ subject: "", score: "", total: "" });
  const [project, setProject] = useState({ title: "", type: "mini" });
  // Post-class performance evaluation form.
  const [evalRatings, setEvalRatings] = useState<Record<string, number>>({});
  const [evalFeedback, setEvalFeedback] = useState("");
  const [evalSession, setEvalSession] = useState("");
  const [evalStage, setEvalStage] = useState("");
  const [savingEval, setSavingEval] = useState(false);
  // Per-course progress for this student across the teacher's courses (read-only).
  const [progress, setProgress] = useState<{ course_id: string; course_title: string; completed: number; total: number; percent: number }[]>([]);
  const [progressLoading, setProgressLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setProgressLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/teaching/student-progress/${teacherId}/${student.id}`, { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 })
      .then(({ data }) => { if (!cancelled) setProgress(Array.isArray(data?.courses) ? data.courses : []); })
      .catch(() => { if (!cancelled) setProgress([]); })
      .finally(() => { if (!cancelled) setProgressLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId, student.id]);

  const load = () => {
    setLoading(true);
    axios
      .get(`${ADMIN_BASE}/api/public/student-records/by-teacher/${teacherId}`, { params: { studentId: student.id, t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 })
      .then(({ data }) => setRecords(Array.isArray(data?.records) ? data.records : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [teacherId, student.id]);

  const post = async (kind: string, data: Record<string, unknown>) => {
    try { await axios.post(`${ADMIN_BASE}/api/public/student-records`, { teacherId, studentId: student.id, kind, data }, { headers: teacherAuthHeaders() }); load(); }
    catch { toast.error("Failed to save"); }
  };
  const del = async (id: number) => {
    try { await axios.delete(`${ADMIN_BASE}/api/public/student-records/${id}`, { params: { teacherId }, headers: teacherAuthHeaders() }); load(); }
    catch { toast.error("Failed to delete"); }
  };

  const submitEval = async (e: React.FormEvent) => {
    e.preventDefault();
    const rated = EVAL_ATTRS.map((a) => evalRatings[a.key]).filter((v) => v > 0);
    if (rated.length === 0) { toast.error("Give at least one rating before saving."); return; }
    const overall = Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10;
    setSavingEval(true);
    try {
      await axios.post(
        `${ADMIN_BASE}/api/public/student-records`,
        { teacherId, studentId: student.id, kind: "evaluation", data: { ratings: evalRatings, overall, feedback: evalFeedback.trim(), session: evalSession.trim(), stage: evalStage.trim() } },
        { headers: teacherAuthHeaders() },
      );
      setEvalRatings({}); setEvalFeedback(""); setEvalSession(""); setEvalStage("");
      toast.success("Evaluation saved");
      load();
    } catch { toast.error("Failed to save evaluation"); }
    finally { setSavingEval(false); }
  };

  const byKind = (k: string) => records.filter((r) => r.kind === k);
  const d = (r: StudentRec) => r.data as Record<string, string>;
  const badgeRow = records.find((r) => r.kind === "badge");
  const assigned = new Set<string>(Array.isArray((badgeRow?.data as { badges?: string[] })?.badges) ? (badgeRow!.data as { badges: string[] }).badges : []);

  const Row = ({ id, children }: { id: number; children: ReactNode }) => (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm mb-1">
      <span>{children}</span>
      <button type="button" onClick={() => del(id)} className="text-muted-foreground hover:text-red-600 font-bold leading-none">×</button>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 rounded-full bg-gradient-hero text-white text-lg font-bold flex items-center justify-center">{(student.name || "S").slice(0, 1).toUpperCase()}</div>
        <h2 className="text-xl font-bold">{student.name || student.id}</h2>
      </div>
      <div className="flex flex-wrap gap-4 mb-8">
        <Stat value={String(student.classes)} label="Classes" />
        <Stat value={String(student.slots)} label="Slots" />
        <Stat value={String(student.classes + student.slots)} label="Total sessions" />
      </div>

      {/* Course progress — how far this student is through each of the teacher's
          courses (completed vs released lessons). Read-only. */}
      <section className="mb-8">
        <h3 className="font-semibold mb-3">Course progress</h3>
        {progressLoading ? (
          <p className="text-sm text-muted-foreground">Loading progress…</p>
        ) : progress.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courses assigned to you for this student yet.</p>
        ) : (
          <div className="space-y-3">
            {progress.map((c) => (
              <div key={c.course_id}>
                <div className="flex items-center justify-between text-sm mb-1 gap-3">
                  <span className="font-medium truncate" title={c.course_title}>{c.course_title}</span>
                  <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                    {c.total ? `${c.completed}/${c.total} · ${c.percent}%` : "No lessons released"}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.percent}%`, backgroundColor: c.percent >= 100 ? "#12c093" : "#FF6A00" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {loading ? <Empty text="Loading…" /> : (
        <div className="space-y-8">
          {/* Post-class performance evaluation — rate the student on each
              attribute + leave written feedback. Feeds the admin dashboard. */}
          <section>
            <h3 className="font-semibold mb-3">Performance Evaluation <span className="text-muted-foreground font-normal text-sm">(after class)</span></h3>

            {byKind("evaluation").map((r) => {
              const ed = r.data as { ratings?: Record<string, number>; overall?: number; feedback?: string; session?: string; stage?: string };
              return (
                <div key={r.id} className="rounded-xl border border-border p-4 mb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {ed.session && <div className="font-medium text-sm truncate">{ed.session}</div>}
                      {ed.stage && <div className="text-xs text-muted-foreground truncate">{ed.stage}</div>}
                      {!ed.session && !ed.stage && <div className="text-sm font-medium">Evaluation</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Stars value={ed.overall || 0} />
                      <span className="text-xs text-muted-foreground tabular-nums">{(ed.overall || 0).toFixed(1)}</span>
                      <button type="button" onClick={() => del(r.id)} className="text-muted-foreground hover:text-red-600 font-bold leading-none ml-1">×</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">
                    {EVAL_ATTRS.map((a) => (
                      <div key={a.key} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{a.label}</span>
                        <Stars value={ed.ratings?.[a.key] || 0} />
                      </div>
                    ))}
                  </div>
                  {ed.feedback && <p className="text-sm mt-3 rounded-lg bg-muted/50 px-3 py-2">{ed.feedback}</p>}
                </div>
              );
            })}

            <form onSubmit={submitEval} className="rounded-xl border border-border p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-2">
                <input value={evalStage} onChange={(e) => setEvalStage(e.target.value)} placeholder="Stage / Program (optional)" className="rounded-lg border border-border px-3 py-2 text-sm" />
                <input value={evalSession} onChange={(e) => setEvalSession(e.target.value)} placeholder="Session (e.g. Blocks vs Text)" className="rounded-lg border border-border px-3 py-2 text-sm" />
              </div>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                {EVAL_ATTRS.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{a.label}</span>
                    <StarRating value={evalRatings[a.key] || 0} onChange={(n) => setEvalRatings((s) => ({ ...s, [a.key]: n }))} />
                  </div>
                ))}
              </div>
              <textarea value={evalFeedback} onChange={(e) => setEvalFeedback(e.target.value)} rows={3} placeholder="Feedback from the project guide…" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
              <button disabled={savingEval} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-5 py-2 disabled:opacity-60">
                {savingEval ? "Saving…" : "Save evaluation"}
              </button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Primary goal</h3>
            {byKind("goal_primary").map((r) => <Row key={r.id} id={r.id}>{d(r).goal}</Row>)}
            <form onSubmit={(e) => { e.preventDefault(); if (primary.trim()) { post("goal_primary", { goal: primary.trim() }); setPrimary(""); } }} className="flex gap-2 mt-1">
              <input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="Add a primary goal" className="flex-1 rounded-lg border border-border px-3 py-2 text-sm" />
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Academic goals</h3>
            {byKind("goal_academic").map((r) => <Row key={r.id} id={r.id}>{[d(r).subject, d(r).grade && `Grade ${d(r).grade}`, d(r).goal].filter(Boolean).join(" · ")}</Row>)}
            <form onSubmit={(e) => { e.preventDefault(); if (acad.goal.trim()) { post("goal_academic", { ...acad }); setAcad({ subject: "", grade: "", goal: "" }); } }} className="grid sm:grid-cols-4 gap-2 mt-1">
              <input value={acad.subject} onChange={(e) => setAcad((s) => ({ ...s, subject: e.target.value }))} placeholder="Subject" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <input value={acad.grade} onChange={(e) => setAcad((s) => ({ ...s, grade: e.target.value }))} placeholder="Grade" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <input value={acad.goal} onChange={(e) => setAcad((s) => ({ ...s, goal: e.target.value }))} placeholder="Goal" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Badges <span className="text-muted-foreground font-normal text-sm">({assigned.size} assigned)</span></h3>
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => {
                const on = assigned.has(b.key);
                return (
                  <button key={b.key} type="button" onClick={() => post("badge", { badge: b.key, status: on ? "unassigned" : "assigned" })} className={`rounded-full px-3 py-1.5 text-sm border ${on ? "bg-primary text-white border-primary" : "border-border hover:bg-muted"}`}>
                    {on ? "★" : "☆"} {b.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Student Progress Report</h3>
            {byKind("spr").map((r) => <Row key={r.id} id={r.id}>{d(r).note}</Row>)}
            {byKind("spr").length === 0 && <p className="text-sm text-muted-foreground mb-1">No SPR notes yet.</p>}
            <form onSubmit={(e) => { e.preventDefault(); if (spr.trim()) { post("spr", { note: spr.trim() }); setSpr(""); } }} className="flex gap-2 mt-1">
              <input value={spr} onChange={(e) => setSpr(e.target.value)} placeholder="Add a note" className="flex-1 rounded-lg border border-border px-3 py-2 text-sm" />
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">School Marks</h3>
            {byKind("mark").map((r) => <Row key={r.id} id={r.id}>{d(r).subject}: {d(r).score}{d(r).total ? ` / ${d(r).total}` : ""}</Row>)}
            <form onSubmit={(e) => { e.preventDefault(); if (mark.subject.trim() && mark.score.trim()) { post("mark", { ...mark }); setMark({ subject: "", score: "", total: "" }); } }} className="grid sm:grid-cols-4 gap-2 mt-1">
              <input value={mark.subject} onChange={(e) => setMark((s) => ({ ...s, subject: e.target.value }))} placeholder="Subject" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <input value={mark.score} onChange={(e) => setMark((s) => ({ ...s, score: e.target.value }))} placeholder="Score" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <input value={mark.total} onChange={(e) => setMark((s) => ({ ...s, total: e.target.value }))} placeholder="Out of" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold mb-2">Projects</h3>
            {byKind("project").map((r) => <Row key={r.id} id={r.id}>{d(r).title} <span className="text-muted-foreground">({d(r).type})</span></Row>)}
            <form onSubmit={(e) => { e.preventDefault(); if (project.title.trim()) { post("project", { ...project }); setProject({ title: "", type: "mini" }); } }} className="grid sm:grid-cols-3 gap-2 mt-1">
              <input value={project.title} onChange={(e) => setProject((s) => ({ ...s, title: e.target.value }))} placeholder="Project title" className="rounded-lg border border-border px-3 py-2 text-sm" />
              <select value={project.type} onChange={(e) => setProject((s) => ({ ...s, type: e.target.value }))} className="rounded-lg border border-border px-3 py-2 text-sm bg-white">
                <option value="mini">Mini</option><option value="major">Major</option><option value="final">Final</option>
              </select>
              <button className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4">Add</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

interface RosterSched { id: number; students: { id: string; name: string }[] }

// Students panel — step 1: the teacher's students, aggregated from the rosters
// of their classes + slots, with per-student session counts. (Goals, badges,
// SPR, marks, exercises, quizzes and projects are later steps.)
const StudentsView = ({ teacherId }: { teacherId?: string }) => {
  const [classes, setClasses] = useState<RosterSched[]>([]);
  const [slots, setSlots] = useState<RosterSched[]>([]);
  const [courseStudents, setCourseStudents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!teacherId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      axios.get(`${ADMIN_BASE}/api/public/classes/by-teacher/${teacherId}`, { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 }),
      axios.get(`${ADMIN_BASE}/api/public/slots/by-teacher/${teacherId}`, { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 }),
      // Students from the teacher's COURSE assignments (delegation roster).
      axios.get(`${ADMIN_BASE}/api/public/teaching/students-by-teacher/${teacherId}`, { params: { t: Date.now() }, headers: { "Cache-Control": "no-cache", ...teacherAuthHeaders() }, timeout: 30000 }),
    ])
      .then(([c, s, ts]) => {
        if (cancelled) return;
        setClasses(Array.isArray(c.data?.classes) ? c.data.classes : []);
        setSlots(Array.isArray(s.data?.slots) ? s.data.slots : []);
        setCourseStudents(Array.isArray(ts.data?.students) ? ts.data.students : []);
      })
      .catch(() => { if (!cancelled) { setClasses([]); setSlots([]); setCourseStudents([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teacherId]);

  const map = new Map<string, { id: string; name: string; classes: number; slots: number }>();
  const add = (entries: RosterSched[], key: "classes" | "slots") => {
    entries.forEach((e) => (e.students || []).forEach((st) => {
      const cur = map.get(st.id) || { id: st.id, name: st.name || "", classes: 0, slots: 0 };
      cur[key] += 1;
      if (st.name && !cur.name) cur.name = st.name;
      map.set(st.id, cur);
    }));
  };
  add(classes, "classes");
  add(slots, "slots");
  // Merge course-assignment (delegation) students so they show even with no
  // class/slot scheduled.
  courseStudents.forEach((st) => {
    const cur = map.get(st.id) || { id: st.id, name: st.name || "", classes: 0, slots: 0 };
    if (st.name && !cur.name) cur.name = st.name;
    map.set(st.id, cur);
  });
  let students = Array.from(map.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  if (q.trim()) students = students.filter((s) => (s.name || s.id).toLowerCase().includes(q.toLowerCase()));
  const sel = selected ? map.get(selected) : null;

  return (
    <Panel title="Students" icon={Users}>
      {!teacherId ? (
        <Empty text="Sign in as a teacher to see your students." />
      ) : loading ? (
        <Empty text="Loading students…" />
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          <div className="rounded-xl border border-border p-4">
            <h3 className="font-semibold mb-3">Your Students</h3>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" className="w-full rounded-lg border border-border px-3 py-2 text-sm mb-3" />
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students assigned to you yet (via courses, classes, or slots).</p>
            ) : (
              <ul className="space-y-1 max-h-[440px] overflow-y-auto">
                {students.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setSelected(s.id)} className={`w-full text-left rounded-lg px-3 py-2 text-sm ${selected === s.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                      {s.name || s.id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border p-6">
            {!sel ? (
              <Empty text="Select a student to see their details." />
            ) : (
              <StudentDetail teacherId={teacherId} student={sel} />
            )}
          </div>
        </div>
      )}
    </Panel>
  );
};

// After a class ends, nudge the teacher to evaluate their students. Derived
// from the teacher's own classes (end_at within the last 2 days = "recent"),
// so it appears right after a class and clears itself a couple of days later.
// Clicking it jumps to the Students tab where the evaluation form lives.
const RECENT_CLASS_MS = 2 * 24 * 60 * 60 * 1000;
const PendingFeedbackBanner = ({ teacherId, onGiveFeedback }: { teacherId?: string; onGiveFeedback: () => void }) => {
  const { items } = useTeacherList<{ id: number; name: string; start_at: string | null; end_at: string | null }>(teacherId, "classes", "classes");
  const now = Date.now();
  const recent = items.filter((c) => {
    const endMs = c.end_at ? new Date(c.end_at).getTime()
      : (c.start_at ? new Date(c.start_at).getTime() + 60 * 60 * 1000 : NaN);
    return !Number.isNaN(endMs) && endMs < now && now - endMs < RECENT_CLASS_MS;
  });
  if (recent.length === 0) return null;
  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 dark:bg-orange-500/10 dark:border-white/10 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-primary shrink-0" />
        <div>
          <p className="font-semibold text-sm m-0">{recent.length} recent class{recent.length === 1 ? "" : "es"} ended — share your feedback</p>
          <p className="text-xs text-muted-foreground m-0">Rate your students' performance from the class in the Students tab.</p>
        </div>
      </div>
      <button type="button" onClick={onGiveFeedback} className="rounded-lg bg-gradient-hero text-white text-sm font-semibold px-4 py-2">
        Give feedback
      </button>
    </div>
  );
};

const TeacherDashboard = () => {
  const [active, setActive] = useState("My Courses");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data] = useState<DashboardData>(PLACEHOLDER_DATA);
  const { user } = useAuth();
  const { isDark } = useDashboardTheme();

  // TODO(backend): connect to the teacher earnings API. Uncomment & adapt:
  // useEffect(() => {
  //   axios
  //     .get(`/api/teacher/earnings?month=2026-05`)
  //     .then((res) => setData(res.data))
  //     .catch(() => setData(PLACEHOLDER_DATA));
  // }, []);

  return (
    <div className={`min-h-screen flex bg-[#f4f4f5] dark:bg-[#0f0f14] ${isDark ? "dark teacher-dark" : ""}`}>
      {/* Mobile top bar with menu button */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-2 px-4 h-14 bg-white dark:bg-[#16161f] border-b border-orange-100 dark:border-white/10">
        <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="text-muted-foreground hover:text-primary">
          <Menu className="w-6 h-6" />
        </button>
        <span className="font-heading text-lg font-extrabold"><span className="text-gradient">VR</span> Robotics</span>
      </div>
      {/* Backdrop (mobile) */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      {/* Sidebar — drawer on mobile, static on desktop */}
      <aside className={`w-64 shrink-0 bg-gradient-to-b from-[#fff6ee] to-white dark:from-[#16161f] dark:to-[#101019] border-r border-orange-100 dark:border-white/10 flex flex-col h-screen
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-200
        lg:static lg:translate-x-0 lg:sticky lg:top-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden absolute top-4 right-4 text-muted-foreground hover:text-primary">
          <X className="w-6 h-6" />
        </button>
        <div className="flex items-center justify-between gap-2 px-6 h-20 border-b border-orange-100 dark:border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-hero shrink-0" />
            <span className="font-heading text-xl font-extrabold truncate">
              <span className="text-gradient">VR</span> Robotics
            </span>
          </div>
          <ThemeToggle />
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1">
          {navItems.map((item) => {
            const on = active === item.name;
            return (
              <button
                key={item.name}
                onClick={() => { setActive(item.name); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                  on
                    ? "bg-primary/10 text-primary border-r-4 border-primary"
                    : "text-muted-foreground hover:bg-orange-50 hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">{item.name}</span>
              </button>
            );
          })}
        </nav>

        <Link
          to="/"
          className="flex items-center gap-3 px-6 py-4 text-sm font-semibold text-red-500 border-t border-orange-100 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <Power className="w-5 h-5" /> Logout
        </Link>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-4 pt-[72px] lg:p-8 lg:pt-8 space-y-6">
        {/* Post-class nudge to evaluate students — shows on every tab. */}
        <PendingFeedbackBanner teacherId={user?.userId} onGiveFeedback={() => setActive("Students")} />

        {active === "Dashboard" ? (
          <>
            {/* Earnings card */}
            <section className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
              <h1 className="text-2xl font-bold">
                My earnings for <span className="text-blue-600">{data.month}</span>
              </h1>

              {/* Dispute banner */}
              <div className="rounded-xl bg-[#fff6ee] p-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="h-1.5 w-16 rounded bg-primary" />
                <div className="text-right">
                  <p className="text-sm text-muted-foreground flex items-center gap-1 justify-end">
                    Noticed an issue in your earnings or penalties? <Info className="w-4 h-4" />
                  </p>
                  <button className="text-blue-600 font-semibold inline-flex items-center gap-1">
                    Raise dispute <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Earnings summary */}
              <div className="rounded-xl bg-muted/40 p-5">
                <h2 className="font-semibold mb-4">Earnings summary</h2>
                <div className="flex flex-wrap gap-4">
                  <Stat value={data.earnings.demos} label="Earnings on demos" />
                  <Stat value={data.earnings.classes} label="Earnings on classes" />
                  <Stat value={data.earnings.other} label="Other earnings" />
                </div>
              </div>

              {/* Penalties summary */}
              <div className="rounded-xl bg-muted/40 p-5">
                <h2 className="font-semibold mb-4">Penalties summary</h2>
                <div className="flex flex-wrap gap-4">
                  <Stat value={data.penalties.penalizedClasses} label="Penalized classes" />
                  <Stat value={data.penalties.disputedSessions} label="Disputed sessions" />
                </div>
              </div>
            </section>

            {/* Demos */}
            <section className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Demos</h2>
                <button className="text-blue-600 font-semibold inline-flex items-center gap-1">
                  View details <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-4">
                <Stat value={data.demos.successful} label="Successful demos" />
                <Stat value={data.demos.unsuccessful} label="Unsuccessful demos" />
                <Stat value={data.demos.conversions} label="Conversions" />
              </div>
            </section>

            {/* Classes */}
            <section className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Classes</h2>
                <button className="text-blue-600 font-semibold inline-flex items-center gap-1">
                  View details <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-4">
                <Stat value={data.classes.paid} label="Paid" />
                <Stat value={data.classes.unsuccessful} label="Unsuccessful" />
                <Stat value={data.classes.cancelled} label="Cancelled" />
                <Stat value={data.classes.punctuality} label="Punctuality %" />
              </div>
            </section>

            {/* Other earnings */}
            <section className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-bold mb-2">Other earnings</h2>
              <p className="text-muted-foreground">No other earnings</p>
            </section>

            {/* Penalized classes */}
            <section className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  Penalized classes
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-sm">—</span>
                </h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Info className="w-4 h-4" /> Detailed breakdown available in 'View details' under 'Classes'
                </p>
              </div>
              <p className="text-muted-foreground">No penalized classes</p>
            </section>

            {/* Incentives banner */}
            <section className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-3">
                <button className="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 hover:bg-muted">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 grid md:grid-cols-2 gap-4 rounded-2xl bg-[#1e1e2a] text-white p-6">
                  <div>
                    <h3 className="text-xl font-bold mb-3">
                      Earn more <span className="text-primary">incentives</span> from every class
                    </h3>
                    <ul className="space-y-2 text-sm text-white/80">
                      <li className="bg-white/5 rounded-lg px-3 py-2"><span className="text-primary font-semibold">Earn ₹1250</span> by achieving 90+ mentor rating</li>
                      <li className="bg-white/5 rounded-lg px-3 py-2"><span className="text-primary font-semibold">Earn ₹750</span> by completing 24 classes with same student</li>
                      <li className="bg-white/5 rounded-lg px-3 py-2"><span className="text-primary font-semibold">Earn ₹1000</span> by completing 48 classes with same student</li>
                      <li className="bg-white/5 rounded-lg px-3 py-2"><span className="text-primary font-semibold">Earn ₹1000</span> by successfully upselling or cross-selling</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-3">
                      Refer. <span className="text-primary">Earn.</span> Repeat.
                    </h3>
                    <ul className="space-y-2 text-sm text-white/80">
                      <li className="bg-white/5 rounded-lg px-3 py-2"><span className="text-primary font-semibold">Earn ₹1000</span> by referring a mentor who completes 75 teaching hours</li>
                      <li className="bg-white/5 rounded-lg px-3 py-2"><span className="text-primary font-semibold">Earn up to ₹1800</span> (₹300 for demo + ₹1500 for enrollment) by referring a student</li>
                    </ul>
                  </div>
                </div>
                <button className="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 hover:bg-muted">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </section>
          </>
        ) : active === "Slots" ? (
          <SlotsView teacherId={user?.userId} />
        ) : active === "Demos" ? (
          <DemosView teacherId={user?.userId} />
        ) : active === "My Courses" ? (
          // Teaching assignment feature removed - replaced by Batch Management System
          <div className="p-6 text-center text-gray-500">
            <p>This feature is being transitioned to the new Batch Management System.</p>
            <p className="text-sm mt-2">Please contact admin for course assignments.</p>
          </div>
        ) : active === "Classes" ? (
          <ClassesView teacherId={user?.userId} />
        ) : active === "Calendar" ? (
          <TeacherCalendarView teacherId={user?.userId} />
        ) : active === "Free Schedule" ? (
          <FreeScheduleView teacherId={user?.userId} />
        ) : active === "Students" ? (
          <StudentsView teacherId={user?.userId} />
        ) : active === "Feedback Forms" ? (
          <FeedbackFormsView teacherId={user?.userId} />
        ) : active === "Resources" ? (
          <ResourcesView teacherId={user?.userId} />
        ) : active === "Profile" ? (
          <ProfileView user={user as unknown as Record<string, unknown> | null} />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
            <h1 className="text-2xl font-bold mb-2">{active}</h1>
            <p className="text-muted-foreground">This section is coming soon.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherDashboard;
