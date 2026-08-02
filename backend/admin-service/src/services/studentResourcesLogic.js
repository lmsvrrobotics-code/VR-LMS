// Pure shaping logic for the student-facing Materials list. No DB, no network —
// the caller (ResourceService.listForStudent) does the queries and hands the
// rows here. Kept separate so the rules that decide what a student may see are
// unit-testable without a database.

// A student reaches a resource only through a course they are enrolled in or
// delegated to. Resources with no course_id are library/teacher-only rows (the
// Resources feature predates course scoping — see Resource model), so they are
// NOT student-visible: there is no enrollment relationship to authorise them.
// Inactive rows (status !== 1) are hidden exactly as they are for teachers.
const isVisibleToStudent = (resource, courseIdSet) => {
    if (!resource) return false;
    if (Number(resource.status) !== 1) return false;
    const courseId = Number(resource.course_id);
    if (!Number.isInteger(courseId) || courseId <= 0) return false;
    return courseIdSet.has(courseId);
};

// Drop the fields a student has no business seeing. teacher_ids in particular
// names every teacher the resource is assigned to — internal routing data, not
// student content. status/sort_order are admin bookkeeping.
const sanitizeForStudent = (r, { categoryName = null, courseTitle = null } = {}) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    // [{ name, url }] — R2 public PDF links.
    files: Array.isArray(r.files) ? r.files : [],
    course_id: r.course_id ?? null,
    course_title: courseTitle,
    resource_category_id: r.resource_category_id ?? null,
    category_name: categoryName,
    section: r.section || null,
});

// Same ordering the teacher dashboard uses (sort_order, then newest first) so a
// resource occupies the same relative position for both audiences.
const bySortOrder = (a, b) => {
    const sa = Number(a.sort_order) || 0;
    const sb = Number(b.sort_order) || 0;
    if (sa !== sb) return sa - sb;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
};

// Group into the section headers the student sees. Resources with no section
// fall under a catch-all rather than being dropped — the same defensive choice
// groupCurriculum makes for lessons with a missing section.
const UNSECTIONED = 'Course Materials';

const groupBySection = (resources) => {
    const bucket = new Map();
    for (const r of resources) {
        const key = r.section || UNSECTIONED;
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key).push(r);
    }
    return [...bucket.entries()].map(([section, items]) => ({ section, resources: items }));
};

// Full pipeline: filter by what the student may see, order, shape, group.
const buildStudentResources = (rows, courseIds, { categoryNames = new Map(), courseTitles = new Map() } = {}) => {
    const courseIdSet = new Set((courseIds || []).map(Number).filter((n) => Number.isInteger(n)));
    const visible = (rows || [])
        .filter((r) => isVisibleToStudent(r, courseIdSet))
        .sort(bySortOrder)
        .map((r) => sanitizeForStudent(r, {
            categoryName: r.resource_category_id ? (categoryNames.get(r.resource_category_id) ?? null) : null,
            courseTitle: r.course_id ? (courseTitles.get(Number(r.course_id)) ?? null) : null,
        }));
    return { resources: visible, sections: groupBySection(visible) };
};

module.exports = {
    isVisibleToStudent,
    sanitizeForStudent,
    bySortOrder,
    groupBySection,
    buildStudentResources,
    UNSECTIONED,
};
