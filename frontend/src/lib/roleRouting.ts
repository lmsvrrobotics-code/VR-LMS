/**
 * Single source of truth for "which role lands on which dashboard".
 *
 * Why this file exists: role→destination logic used to be duplicated inline in
 * Auth.tsx, ProtectedRoute.tsx and App.tsx, and each copy had a different
 * catch-all. The worst of them treated an UNKNOWN role as a student and sent
 * teachers to the student site. Routing is an authorization-adjacent decision,
 * so it gets one implementation, exhaustively enumerated and unit-tested.
 *
 * Design rules (do not relax without thinking about the security impact):
 *  1. Roles are matched from an explicit allow-list. Anything not on the list
 *     is UNKNOWN — never silently downgraded to "student".
 *  2. An unknown/absent role NEVER lands on a real dashboard. It goes to the
 *     auth screen, because we could not establish who the user is.
 *  3. Normalisation is deliberate and narrow (trim + lowercase). We do not
 *     "guess" roles via substring matching — `substring` checks would make
 *     "not_an_admin" match "admin".
 */

/** Canonical roles understood by the app. */
export type CanonicalRole = "root_admin" | "admin" | "teacher" | "student";

/** Where each canonical role lands immediately after login. */
export const ROLE_HOME: Record<CanonicalRole, string> = {
  // Admin shell is a separate app mount; both admin tiers start on its dashboard.
  root_admin: "/admin/dashboard",
  admin: "/admin/dashboard",
  teacher: "/teacher",
  // Students land on their own dashboard shell (sidebar: Dashboard / My
  // Courses / My Assignments / Feedback), mirroring the teacher shell. This
  // replaced "/" — the marketing home — which gave a signed-in student nowhere
  // to land and made the profile menu's "Dashboard" item a no-op.
  student: "/student/dashboard",
};

/** Where to send someone whose role we could not establish. */
export const UNKNOWN_ROLE_HOME = "/auth";

/**
 * Aliases the various backends emit for the same canonical role.
 *
 * These are REAL values observed in this codebase, not speculative:
 *  - admin-service issues JWTs with role 'root' and a separate is_root_admin
 *    flag; auth-service's roles table uses 'root_admin'.
 *  - 'manager' / 'editor' were accepted by the old Auth.tsx admin branch, so
 *    they are preserved here to avoid regressing existing accounts.
 */
const ROLE_ALIASES: Record<string, CanonicalRole> = {
  root: "root_admin",
  root_admin: "root_admin",
  rootadmin: "root_admin",
  superadmin: "root_admin",

  admin: "admin",
  administrator: "admin",
  college_admin: "admin",
  collegeadmin: "admin",
  school_admin: "admin",
  manager: "admin",
  editor: "admin",

  teacher: "teacher",
  mentor: "teacher",
  instructor: "teacher",
  trainer: "teacher",
  faculty: "teacher",

  student: "student",
  learner: "student",
};

/**
 * Map any backend-supplied role string onto a canonical role.
 * Returns null when the role is absent or unrecognised — callers MUST treat
 * null as "identity not established", never as a default role.
 */
export function normalizeRole(raw: unknown): CanonicalRole | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return null;
  return ROLE_ALIASES[key] ?? null;
}

/**
 * The landing route for a freshly-authenticated user.
 * An unrecognised role deliberately returns the auth screen rather than any
 * dashboard, so a role-resolution failure can never expose the wrong app.
 */
export function getLandingRoute(raw: unknown): string {
  const role = normalizeRole(raw);
  return role ? ROLE_HOME[role] : UNKNOWN_ROLE_HOME;
}

/**
 * Does `raw` satisfy a route's `requiredRole`?
 * Both sides are normalised so that a route asking for "admin" is satisfied by
 * a backend that says "root" only when that is intended — see below: root_admin
 * is treated as a superset of admin, but NOT of teacher/student, because the
 * admin and teacher UIs are different apps with different data scopes.
 */
export function roleSatisfies(raw: unknown, required: string | string[]): boolean {
  const role = normalizeRole(raw);
  if (!role) return false;

  const allowed = (Array.isArray(required) ? required : [required])
    .map(normalizeRole)
    .filter((r): r is CanonicalRole => r !== null);

  if (allowed.length === 0) return false;
  if (allowed.includes(role)) return true;

  // root_admin implicitly satisfies an 'admin' requirement (it is strictly
  // more privileged). No other implicit widening exists.
  return role === "root_admin" && allowed.includes("admin");
}

/**
 * Where to bounce a user who is authenticated but NOT permitted on the route
 * they asked for: their own home, never a hard-coded student route.
 * This is what stopped teachers from being dumped into the student site when
 * they touched an admin-only page.
 */
export function getDeniedRedirect(raw: unknown): string {
  return getLandingRoute(raw);
}

/** True when the role belongs to the admin shell (`/admin/*`). */
export function isAdminRole(raw: unknown): boolean {
  const role = normalizeRole(raw);
  return role === "admin" || role === "root_admin";
}
