/**
 * File-picker selection rules for multi-file upload inputs.
 *
 * Extracted from TeacherDashboard's assignment form so the ordering rule below
 * is unit-testable without React or a DOM.
 *
 * THE ORDERING RULE: an `<input type="file">` handler that wants to allow
 * re-picking the same file must reset `input.value`, but resetting empties the
 * element's FileList (HTML spec). So the picked files MUST be snapshotted into
 * a plain array BEFORE the reset — and in particular before handing them to a
 * lazy state updater (`setFiles(prev => …)`), which React runs after the event
 * handler has already returned. Reading `e.target.files` inside that updater
 * reads an input that has been cleared, silently dropping every file.
 */

/** Maximum attachments per assignment — mirrors the server's multer limit. */
export const MAX_ATTACHMENTS = 20;

/**
 * Merge a freshly-picked FileList into the already-chosen files.
 *
 * `picked` must be a snapshot taken before the input was reset. Selecting
 * nothing (the teacher cancelled the dialog) leaves the existing list intact
 * rather than clearing it.
 */
export function mergePickedFiles<T>(
  existing: readonly T[],
  picked: ArrayLike<T> | null | undefined,
  max: number = MAX_ATTACHMENTS,
): T[] {
  return [...existing, ...Array.from(picked || [])].slice(0, max);
}
