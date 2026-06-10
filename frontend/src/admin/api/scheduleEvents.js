// Tiny pub/sub so any schedule mutation (class / demo / slot add, edit, delete,
// status toggle) tells the open calendar to re-pull. The admin calendar listens
// for the `schedule:changed` window event and reloads, so a freshly added class
// or demo shows up without a manual refresh.
export const SCHEDULE_CHANGED = 'schedule:changed';

export function notifyScheduleChanged() {
  try {
    window.dispatchEvent(new Event(SCHEDULE_CHANGED));
  } catch {
    /* non-browser / SSR — no-op */
  }
}
