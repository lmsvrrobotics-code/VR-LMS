const { FeedbackForm, FeedbackResponse } = require('../models');
const { HttpError } = require('../middlewares/error');
const { resolveUserNames, resolveCourseTitles } = require('../helpers/scheduleResolve');
const teachingSvc = require('./TeachingAssignmentService');

// Teacher-authored dynamic feedback forms. Teachers build the questions and
// enable a form; enabling snapshots the teacher's assigned roster as the
// audience. Each audience student submits exactly once (DB-enforced). Admin
// reads per-question aggregates + individual records.

const TYPES = ['rating', 'text', 'mcq', 'yesno'];

// Validate + normalise the teacher-authored questions array. Each question gets
// a stable string id (q1, q2, …) so responses key off it even if labels change.
const normaliseQuestions = (raw) => {
    const arr = Array.isArray(raw) ? raw : [];
    if (!arr.length) throw new HttpError(422, 'Add at least one question.');
    const out = [];
    arr.forEach((q, i) => {
        const type = String(q?.type || '').trim();
        const label = String(q?.label || '').trim();
        if (!TYPES.includes(type)) throw new HttpError(422, `Question ${i + 1}: invalid type.`);
        if (!label) throw new HttpError(422, `Question ${i + 1}: label is required.`);
        const item = { id: q?.id ? String(q.id) : `q${i + 1}`, type, label };
        if (type === 'mcq') {
            const options = (Array.isArray(q?.options) ? q.options : [])
                .map((o) => String(o).trim()).filter(Boolean);
            if (options.length < 2) throw new HttpError(422, `Question ${i + 1}: add at least two options.`);
            item.options = options;
        }
        out.push(item);
    });
    return out;
};

const shapeForm = (f, responseCount) => ({
    id: f.id,
    teacher_id: f.teacher_id,
    title: f.title,
    description: f.description || '',
    course_id: f.course_id || null,
    questions: f.questions || [],
    enabled: !!f.enabled,
    enabled_at: f.enabled_at,
    audience_count: Array.isArray(f.audience_student_ids) ? f.audience_student_ids.length : 0,
    response_count: responseCount ?? undefined,
    created_at: f.created_at,
});

// Map of form_id → response count for a set of form ids.
const countResponses = async (formIds) => {
    if (!formIds.length) return {};
    const rows = await FeedbackResponse.findAll({
        where: { form_id: formIds },
        attributes: ['form_id'],
        raw: true,
    });
    const m = {};
    rows.forEach((r) => { m[r.form_id] = (m[r.form_id] || 0) + 1; });
    return m;
};

// ---- Teacher operations (owner-scoped) ----

const listForTeacher = async (teacherId) => {
    const tid = String(teacherId || '').trim();
    if (!tid) return { forms: [] };
    const forms = await FeedbackForm.findAll({ where: { teacher_id: tid }, order: [['id', 'DESC']], raw: true });
    const counts = await countResponses(forms.map((f) => f.id));
    return { forms: forms.map((f) => shapeForm(f, counts[f.id] || 0)) };
};

const createForm = async (teacherId, { title, description, courseId, questions }) => {
    const tid = String(teacherId || '').trim();
    if (!tid) throw new HttpError(401, 'Sign in as a teacher.');
    if (!String(title || '').trim()) throw new HttpError(422, 'Title is required.');
    const form = await FeedbackForm.create({
        teacher_id: tid,
        title: String(title).trim(),
        description: description ? String(description).trim() : null,
        course_id: courseId ? String(courseId) : null,
        questions: normaliseQuestions(questions),
        enabled: false,
    });
    return { success: 'Form created', form: shapeForm(form, 0) };
};

// Owner-only fetch helper.
const ownForm = async (id, teacherId) => {
    const form = await FeedbackForm.findByPk(Number(id));
    if (!form) throw new HttpError(404, 'Form not found.');
    if (String(form.teacher_id) !== String(teacherId)) throw new HttpError(403, 'Not your form.');
    return form;
};

const updateForm = async (id, teacherId, { title, description, courseId, questions, enabled }) => {
    const form = await ownForm(id, teacherId);

    // Toggling enabled is handled here too so the teacher UI can PATCH a single
    // field. Enabling snapshots the current roster as the audience.
    if (enabled !== undefined) {
        const want = !!enabled;
        if (want && !form.enabled) {
            const roster = await teachingSvc.studentsByTeacher(form.teacher_id);
            form.audience_student_ids = roster.map((s) => String(s.id));
            form.enabled = true;
            form.enabled_at = new Date();
        } else if (!want && form.enabled) {
            form.enabled = false;
        }
    }

    if (title !== undefined) form.title = String(title).trim() || form.title;
    if (description !== undefined) form.description = description ? String(description).trim() : null;
    if (courseId !== undefined) form.course_id = courseId ? String(courseId) : null;

    // Questions can only change while no one has answered (keeps stats coherent).
    if (questions !== undefined) {
        const responded = await FeedbackResponse.count({ where: { form_id: form.id } });
        if (responded > 0) throw new HttpError(409, 'Cannot edit questions after students have responded.');
        form.questions = normaliseQuestions(questions);
    }

    await form.save();
    const count = await FeedbackResponse.count({ where: { form_id: form.id } });
    return { success: 'Form updated', form: shapeForm(form, count) };
};

const deleteForm = async (id, teacherId) => {
    const form = await ownForm(id, teacherId);
    await FeedbackResponse.destroy({ where: { form_id: form.id } });
    await form.destroy();
    return { success: 'Form deleted' };
};

// ---- Student operations ----

// Enabled forms addressed to this student that they haven't answered yet.
const listForStudent = async (studentId) => {
    const sid = String(studentId || '').trim();
    if (!sid) return { forms: [] };
    const enabled = await FeedbackForm.findAll({ where: { enabled: true }, order: [['id', 'DESC']], raw: true });
    const mine = enabled.filter((f) => (f.audience_student_ids || []).map(String).includes(sid));
    if (!mine.length) return { forms: [] };

    const answered = await FeedbackResponse.findAll({
        where: { student_id: sid, form_id: mine.map((f) => f.id) },
        attributes: ['form_id'],
        raw: true,
    });
    const answeredIds = new Set(answered.map((r) => r.form_id));
    const pending = mine.filter((f) => !answeredIds.has(f.id));

    const titles = await resolveCourseTitles(pending.map((f) => f.course_id));
    const names = await resolveUserNames(pending.map((f) => f.teacher_id));
    return {
        forms: pending.map((f) => ({
            id: f.id,
            title: f.title,
            description: f.description || '',
            questions: f.questions || [],
            teacher_name: names[String(f.teacher_id)] || null,
            course_title: f.course_id ? (titles[String(f.course_id)] || null) : null,
            enabled_at: f.enabled_at,
        })),
    };
};

// Coerce + validate one answer against its question definition.
const cleanAnswer = (q, raw) => {
    if (q.type === 'rating') {
        const n = Math.round(Number(raw));
        return n >= 1 && n <= 5 ? n : null;
    }
    if (q.type === 'text') {
        const s = String(raw ?? '').trim();
        return s || null;
    }
    if (q.type === 'mcq') {
        const s = String(raw ?? '').trim();
        return (q.options || []).includes(s) ? s : null;
    }
    if (q.type === 'yesno') {
        if (raw === true || raw === 'yes' || raw === 'true') return true;
        if (raw === false || raw === 'no' || raw === 'false') return false;
        return null;
    }
    return null;
};

const submit = async (studentId, formId, rawAnswers) => {
    const sid = String(studentId || '').trim();
    if (!sid) throw new HttpError(401, 'Sign in to submit feedback.');
    const form = await FeedbackForm.findByPk(Number(formId));
    if (!form || !form.enabled) throw new HttpError(404, 'Form not available.');
    if (!(form.audience_student_ids || []).map(String).includes(sid)) {
        throw new HttpError(403, 'This form was not shared with you.');
    }
    const already = await FeedbackResponse.findOne({ where: { form_id: form.id, student_id: sid } });
    if (already) throw new HttpError(409, 'You have already submitted this form.');

    const answers = {};
    (form.questions || []).forEach((q) => {
        const v = cleanAnswer(q, rawAnswers ? rawAnswers[q.id] : undefined);
        if (v !== null) answers[q.id] = v;
    });
    if (Object.keys(answers).length === 0) throw new HttpError(422, 'Please answer at least one question.');

    try {
        await FeedbackResponse.create({
            form_id: form.id,
            student_id: sid,
            teacher_id: form.teacher_id,
            answers,
        });
    } catch (e) {
        // Unique (form_id, student_id) → a concurrent double-submit.
        if (e?.name === 'SequelizeUniqueConstraintError') throw new HttpError(409, 'You have already submitted this form.');
        throw e;
    }
    return { success: 'Thanks for your feedback!' };
};

// ---- Admin reads ----

const adminForms = async () => {
    const forms = await FeedbackForm.findAll({ order: [['id', 'DESC']], raw: true });
    const counts = await countResponses(forms.map((f) => f.id));
    const names = await resolveUserNames(forms.map((f) => f.teacher_id));
    const titles = await resolveCourseTitles(forms.map((f) => f.course_id));
    return {
        forms: forms.map((f) => ({
            ...shapeForm(f, counts[f.id] || 0),
            teacher_name: names[String(f.teacher_id)] || `Teacher ${f.teacher_id}`,
            course_title: f.course_id ? (titles[String(f.course_id)] || null) : null,
        })),
    };
};

const round1 = (n) => Math.round(n * 10) / 10;

// Per-question aggregates for one form: rating → avg + count; mcq → counts per
// option; yesno → yes/no counts; text → list of answers.
const adminStats = async (formId) => {
    const form = await FeedbackForm.findByPk(Number(formId), { raw: true });
    if (!form) throw new HttpError(404, 'Form not found.');
    const rows = await FeedbackResponse.findAll({ where: { form_id: form.id }, raw: true });

    const questions = (form.questions || []).map((q) => {
        const vals = rows.map((r) => r.answers && r.answers[q.id]).filter((v) => v !== undefined && v !== null);
        const base = { id: q.id, type: q.type, label: q.label, answered: vals.length };
        if (q.type === 'rating') {
            const nums = vals.map(Number).filter((n) => n > 0);
            base.average = nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
        } else if (q.type === 'mcq') {
            base.counts = (q.options || []).map((opt) => ({ option: opt, count: vals.filter((v) => v === opt).length }));
        } else if (q.type === 'yesno') {
            base.yes = vals.filter((v) => v === true).length;
            base.no = vals.filter((v) => v === false).length;
        } else if (q.type === 'text') {
            base.answers = vals.map((v) => String(v));
        }
        return base;
    });

    return {
        form: { id: form.id, title: form.title, description: form.description || '' },
        total_responses: rows.length,
        audience_count: Array.isArray(form.audience_student_ids) ? form.audience_student_ids.length : 0,
        questions,
    };
};

// Individual records for one form (newest first), student names resolved.
const adminResponses = async (formId) => {
    const form = await FeedbackForm.findByPk(Number(formId), { raw: true });
    if (!form) throw new HttpError(404, 'Form not found.');
    const rows = await FeedbackResponse.findAll({ where: { form_id: form.id }, order: [['id', 'DESC']], raw: true });
    const names = await resolveUserNames(rows.map((r) => r.student_id));
    return {
        form: { id: form.id, title: form.title, questions: form.questions || [] },
        responses: rows.map((r) => ({
            id: r.id,
            student_id: r.student_id,
            student_name: names[String(r.student_id)] || `Student ${r.student_id}`,
            answers: r.answers || {},
            created_at: r.created_at,
        })),
    };
};

module.exports = {
    listForTeacher, createForm, updateForm, deleteForm,
    listForStudent, submit,
    adminForms, adminStats, adminResponses,
};
