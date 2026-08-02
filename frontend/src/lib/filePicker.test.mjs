/**
 * Unit tests for the assignment file-picker selection rules.
 *
 * Run: node --test src/lib/filePicker.test.mjs
 *
 * Same approach as assignmentStatus.test.mjs — the module under test is pure,
 * so a small loader strips the TypeScript annotations and the .ts source stays
 * the single source of truth.
 *
 * The regression these guard: the teacher's PDF never appeared as a chip in the
 * assignment form, so assignments saved with `attachments: null` and students
 * saw no reference material. Cause was ordering, not upload — the handler
 * cleared `e.target.value` before React ran the lazy `setFiles` updater, and
 * clearing a file input empties its FileList.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "filePicker.ts"), "utf8");

const js = source
  .replace(
    /export function mergePickedFiles<T>\([\s\S]*?\): T\[\] \{/m,
    "export function mergePickedFiles(existing, picked, max = MAX_ATTACHMENTS) {",
  )
  .replace(/export const MAX_ATTACHMENTS: number/, "export const MAX_ATTACHMENTS");

const { mergePickedFiles, MAX_ATTACHMENTS } = await import(
  `data:text/javascript,${encodeURIComponent(js)}`
);

/**
 * Minimal stand-in for a real file input: `value = ""` empties the FileList,
 * exactly as the HTML spec requires.
 */
function makeFileInput(files) {
  let current = [...files];
  return {
    get files() {
      return current;
    },
    set value(v) {
      if (v === "") current = [];
    },
  };
}

test("keeps the picked file when snapshotted before the input is cleared", () => {
  const input = makeFileInput(["einstein.pdf"]);

  // Correct order: snapshot, then clear, then merge.
  const picked = Array.from(input.files || []);
  input.value = "";
  const result = mergePickedFiles([], picked);

  assert.deepEqual(result, ["einstein.pdf"]);
});

test("REGRESSION: reading the input after clearing loses every file", () => {
  const input = makeFileInput(["einstein.pdf"]);

  // The old buggy order: clear first, then read inside the deferred updater.
  input.value = "";
  const lost = mergePickedFiles([], input.files);

  // This is what the teacher saw: no chip, and nothing sent to the server.
  assert.deepEqual(lost, [], "clearing first must be shown to drop the file");
});

test("appends across several picks so files can be added in batches", () => {
  const first = mergePickedFiles([], ["a.pdf"]);
  const second = mergePickedFiles(first, ["b.png", "c.docx"]);
  assert.deepEqual(second, ["a.pdf", "b.png", "c.docx"]);
});

test("cancelling the dialog keeps the already-chosen files", () => {
  assert.deepEqual(mergePickedFiles(["a.pdf"], null), ["a.pdf"]);
  assert.deepEqual(mergePickedFiles(["a.pdf"], undefined), ["a.pdf"]);
  assert.deepEqual(mergePickedFiles(["a.pdf"], []), ["a.pdf"]);
});

test("caps the selection at the server's multer limit", () => {
  const many = Array.from({ length: 25 }, (_, i) => `f${i}.pdf`);
  assert.equal(mergePickedFiles([], many).length, MAX_ATTACHMENTS);
  assert.equal(MAX_ATTACHMENTS, 20, "must match multer's files:20 limit");
});

test("cap counts existing files, not just the new ones", () => {
  const existing = Array.from({ length: 19 }, (_, i) => `old${i}.pdf`);
  const result = mergePickedFiles(existing, ["new1.pdf", "new2.pdf"]);
  assert.equal(result.length, 20);
  assert.equal(result[19], "new1.pdf");
});
