/**
 * Tests for the `/dashboard` alias resolution.
 *
 * `/dashboard` is a generic "send them home" target used from ~7 places
 * (post-signup, pre/post-assessment, program pages). It was wired as a static
 * redirect to `/courses/browse` — the PUBLIC course catalog — so a student who
 * signed up, or finished an assessment, was dropped on the marketing site
 * instead of their dashboard. It now resolves against the signed-in role —
 * students to /student/dashboard, teachers to /teacher, admins to the admin
 * shell.
 *
 * Run: node --test src/lib/dashboardAlias.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "roleRouting.ts"), "utf8");
const js = source
  .replace(/^export type [\s\S]*?;$/gm, "")
  .replace(/: Record<[^>]*>/g, "")
  .replace(/: CanonicalRole \| null/g, "")
  .replace(/: unknown/g, "")
  .replace(/: string \| string\[\]/g, "")
  .replace(/: string(?=[),])/g, "")
  .replace(/\): boolean/g, ")")
  .replace(/\): string/g, ")")
  .replace(/\.filter\(\(r\)[^)]*=> r !== null\)/, ".filter((r) => r !== null)");
const { getLandingRoute, UNKNOWN_ROLE_HOME } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

// Mirrors DashboardRedirect's final decision.
const resolveDashboard = ({ hasToken, role }) =>
  !hasToken ? UNKNOWN_ROLE_HOME : getLandingRoute(role);

test("a signed-in student resolves /dashboard to the student dashboard", () => {
  // Students land on their own dashboard shell, not the marketing home.
  assert.equal(resolveDashboard({ hasToken: true, role: "student" }), "/student/dashboard");
});

test("/dashboard never resolves to the raw course catalog", () => {
  // The old alias hard-redirected everyone to /courses/browse.
  for (const role of ["student", "teacher", "admin", "root_admin"]) {
    assert.notEqual(
      resolveDashboard({ hasToken: true, role }),
      "/courses/browse",
      `${role} must not be dumped on the catalog`,
    );
  }
  // Staff must still never land on the student destination.
  for (const role of ["teacher", "admin", "root_admin"]) {
    assert.notEqual(resolveDashboard({ hasToken: true, role }), "/student/dashboard", `${role} must not land on the student dashboard`);
  }
});

test("each role resolves to its own dashboard", () => {
  assert.equal(resolveDashboard({ hasToken: true, role: "teacher" }), "/teacher");
  assert.equal(resolveDashboard({ hasToken: true, role: "admin" }), "/admin/dashboard");
  assert.equal(resolveDashboard({ hasToken: true, role: "root" }), "/admin/dashboard");
});

test("a visitor with no token goes to the auth screen", () => {
  assert.equal(resolveDashboard({ hasToken: false, role: null }), "/auth");
  // Even if a stale role somehow lingers, no token means not signed in.
  assert.equal(resolveDashboard({ hasToken: false, role: "student" }), "/auth");
});

test("a signed-in user with an unknown role fails closed to /auth", () => {
  assert.equal(resolveDashboard({ hasToken: true, role: "wizard" }), "/auth");
  assert.equal(resolveDashboard({ hasToken: true, role: null }), "/auth");
  assert.equal(resolveDashboard({ hasToken: true, role: undefined }), "/auth");
});

test("post-signup lands a new student on their dashboard", () => {
  // RegisterForm now routes on the role the backend reported. Public signup
  // creates students.
  assert.equal(getLandingRoute("student"), "/student/dashboard");
});

test("the alias is stable across role aliases the backends emit", () => {
  assert.equal(resolveDashboard({ hasToken: true, role: "STUDENT" }), "/student/dashboard");
  assert.equal(resolveDashboard({ hasToken: true, role: " student " }), "/student/dashboard");
  assert.equal(resolveDashboard({ hasToken: true, role: "learner" }), "/student/dashboard");
});
