// Pure grouping logic for the student's own "my feedback, by teacher" view.
// No DB, no network — the caller supplies already-shaped feedback rows. Kept
// separate so the grouping rules are unit-testable without a database.

// Feedback whose course had no teacher (or no course at all) cannot be
// attributed. It is still the student's own submission, so it must be shown
// rather than dropped — it lands under this sentinel tab.
const UNATTRIBUTED = 'Unattributed';

const round1 = (n) => Math.round(n * 10) / 10;
const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

// Group a student's submissions into one entry per teacher, newest first
// within each group. Teachers are ordered by most-recent activity so the tab a
// student most likely wants sits first; the unattributed bucket always sorts
// last because it is a fallback, not a real teacher.
const groupByTeacher = (feedback) => {
    const map = new Map();
    for (const f of feedback || []) {
        const key = f.teacher_id ? String(f.teacher_id) : UNATTRIBUTED;
        if (!map.has(key)) {
            map.set(key, {
                teacher_id: f.teacher_id ? String(f.teacher_id) : null,
                teacher_name: f.teacher_id ? (f.teacher_name || `Teacher ${f.teacher_id}`) : UNATTRIBUTED,
                items: [],
            });
        }
        map.get(key).items.push(f);
    }

    const groups = [...map.values()].map((g) => {
        const overalls = g.items.map((i) => Number(i.overall)).filter((v) => v > 0);
        const times = g.items
            .map((i) => new Date(i.created_at).getTime())
            .filter((t) => !Number.isNaN(t));
        return {
            teacher_id: g.teacher_id,
            teacher_name: g.teacher_name,
            count: g.items.length,
            avg_overall: round1(avg(overalls)),
            latest_at: times.length ? new Date(Math.max(...times)).toISOString() : null,
            feedback: [...g.items].sort(byNewest),
        };
    });

    groups.sort((a, b) => {
        // Unattributed always last, regardless of recency.
        const au = a.teacher_id === null;
        const bu = b.teacher_id === null;
        if (au !== bu) return au ? 1 : -1;
        const at = a.latest_at ? new Date(a.latest_at).getTime() : 0;
        const bt = b.latest_at ? new Date(b.latest_at).getTime() : 0;
        return bt - at;
    });
    return groups;
};

// Newest submission first; a missing/invalid date sorts last rather than
// throwing the comparator off with NaN.
const byNewest = (a, b) => {
    const at = new Date(a.created_at).getTime();
    const bt = new Date(b.created_at).getTime();
    if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
    if (Number.isNaN(at)) return 1;
    if (Number.isNaN(bt)) return -1;
    return bt - at;
};

module.exports = { groupByTeacher, byNewest, UNATTRIBUTED };
