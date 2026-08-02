/**
 * Unit tests for the role→route resolver.
 *
 * Run with:  node --test src/lib/roleRouting.test.mjs
 *
 * These use Node's built-in test runner (node:test) so they run with zero new
 * dependencies — the frontend has no test framework installed. The module under
 * test is intentionally pure (no React, no DOM, no network), which is what
 * makes that possible. A tiny loader strips the TypeScript type annotations so
 * the .ts source can be imported directly and stays the single source of truth.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "roleRouting.ts"), "utf8");

// Strip TS-only syntax (type aliases, annotations, generics on Record<>) so the
// runtime logic can be evaluated as plain JS. The resolver deliberately has no
// runtime dependency on the type layer, so this is a faithful representation.
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

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

const {
  normalizeRole,
  getLandingRoute,
  roleSatisfies,
  getDeniedRedirect,
  isAdminRole,
} = mod;

// ---------------------------------------------------------------------------
// The bug that started this: a teacher must never land on the student site.
// ---------------------------------------------------------------------------
test("teacher lands on the teacher dashboard, never the student site", () => {
  assert.equal(getLandingRoute("teacher"), "/teacher");
  // /student/dashboard is the STUDENT destination, so a teacher landing there
  // would be the original bug resurfacing.
  assert.notEqual(getLandingRoute("teacher"), "/student/dashboard");
});

test("each role lands on its own dashboard", () => {
  assert.equal(getLandingRoute("student"), "/student/dashboard");
  assert.equal(getLandingRoute("teacher"), "/teacher");
  assert.equal(getLandingRoute("admin"), "/admin/dashboard");
  assert.equal(getLandingRoute("root_admin"), "/admin/dashboard");
});

test("role strings are normalised (case, whitespace, separators)", () => {
  assert.equal(getLandingRoute("TEACHER"), "/teacher");
  assert.equal(getLandingRoute("  Teacher  "), "/teacher");
  assert.equal(getLandingRoute("Root Admin"), "/admin/dashboard");
  assert.equal(getLandingRoute("root-admin"), "/admin/dashboard");
});

test("backend role aliases map to the right dashboard", () => {
  assert.equal(getLandingRoute("root"), "/admin/dashboard");
  assert.equal(getLandingRoute("mentor"), "/teacher");
  assert.equal(getLandingRoute("instructor"), "/teacher");
  assert.equal(getLandingRoute("college_admin"), "/admin/dashboard");
  assert.equal(getLandingRoute("manager"), "/admin/dashboard");
});

// ---------------------------------------------------------------------------
// The dangerous default: unknown role must NOT become "student".
// ---------------------------------------------------------------------------
test("unknown or missing roles go to /auth, never to a dashboard", () => {
  for (const bad of [null, undefined, "", "   ", 42, {}, [], "wizard", "guest"]) {
    assert.equal(
      getLandingRoute(bad),
      "/auth",
      `expected /auth for ${JSON.stringify(bad)}`,
    );
  }
});

test("normalizeRole returns null for unrecognised input", () => {
  assert.equal(normalizeRole("wizard"), null);
  assert.equal(normalizeRole(null), null);
  assert.equal(normalizeRole(undefined), null);
  assert.equal(normalizeRole(123), null);
});

test("role matching is exact — no substring escalation", () => {
  // "not_an_admin" must not be treated as an admin.
  assert.equal(normalizeRole("not_an_admin"), null);
  assert.equal(roleSatisfies("not_an_admin", "admin"), false);
  assert.equal(isAdminRole("not_an_admin"), false);
  assert.equal(isAdminRole("xadmin"), false);
});

// ---------------------------------------------------------------------------
// Authorization checks
// ---------------------------------------------------------------------------
test("roleSatisfies enforces the required role", () => {
  assert.equal(roleSatisfies("teacher", "teacher"), true);
  assert.equal(roleSatisfies("student", "teacher"), false);
  assert.equal(roleSatisfies("teacher", "admin"), false);
  assert.equal(roleSatisfies("student", "admin"), false);
});

test("a student can never satisfy a teacher or admin route", () => {
  assert.equal(roleSatisfies("student", ["teacher", "admin"]), false);
  assert.equal(roleSatisfies("student", ["admin"]), false);
});

test("root_admin satisfies admin, but not teacher or student routes", () => {
  assert.equal(roleSatisfies("root", "admin"), true);
  assert.equal(roleSatisfies("root_admin", "admin"), true);
  assert.equal(roleSatisfies("root_admin", "teacher"), false);
  assert.equal(roleSatisfies("root_admin", "student"), false);
});

test("array requirements accept any listed role", () => {
  assert.equal(roleSatisfies("teacher", ["teacher", "admin"]), true);
  assert.equal(roleSatisfies("admin", ["teacher", "admin"]), true);
});

test("unknown role satisfies nothing", () => {
  assert.equal(roleSatisfies(null, "student"), false);
  assert.equal(roleSatisfies(undefined, ["admin", "teacher", "student"]), false);
  assert.equal(roleSatisfies("wizard", "student"), false);
});

test("an empty requirement list denies rather than allows", () => {
  assert.equal(roleSatisfies("admin", []), false);
});

// ---------------------------------------------------------------------------
// Denial redirects — the teacher-dumped-into-student-site regression.
// ---------------------------------------------------------------------------
test("denied users bounce to their own home, not the student site", () => {
  assert.equal(getDeniedRedirect("teacher"), "/teacher");
  assert.equal(getDeniedRedirect("admin"), "/admin/dashboard");
  assert.equal(getDeniedRedirect("student"), "/student/dashboard");
  assert.equal(getDeniedRedirect("wizard"), "/auth");
});

test("isAdminRole identifies only admin tiers", () => {
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("root"), true);
  assert.equal(isAdminRole("root_admin"), true);
  assert.equal(isAdminRole("teacher"), false);
  assert.equal(isAdminRole("student"), false);
  assert.equal(isAdminRole(null), false);
});
