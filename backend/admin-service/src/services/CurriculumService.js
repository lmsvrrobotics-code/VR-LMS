const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const sectionRepo = require('../repositories/SectionRepository');
const lessonRepo = require('../repositories/LessonRepository');
const questionRepo = require('../repositories/QuestionRepository');
const submissionRepo = require('../repositories/QuizSubmissionRepository');
const courseRepo = require('../repositories/CourseRepository');
const { upload, removeFile } = require('../helpers/fileUploader');
const bunny = require('./BunnyStream');
const { HttpError } = require('../middlewares/error');
const { normalizeText, normalizeDifficulty, sessionPatch } = require('../lib/curriculumFields');

// Per-course R2 key prefix — every asset for a course (thumbnail/banner/preview
// from CourseService + lesson attachments + lesson videos via Bunny collection)
// lives under one folder, mirroring the Udemy/Teachable layout.
const courseFolder = (course_id) => `uploads/courses/${course_id}/lessons`;

// Session cover images live beside the lesson assets, under the same course
// folder, so deleting a course still sweeps up everything it owns.
const sessionFolder = (course_id) => `uploads/courses/${course_id}/sessions`;

// Look up the course's Bunny Stream collection (one collection = one folder
// per course in Bunny). Created lazily on first video upload so courses with
// no system-video lessons never spawn an empty collection. Returns null if
// the course row is missing or the create call fails — callers fall back to
// uploading without a collection (videos still land in the library, just
// ungrouped) rather than blocking the lesson save.
async function ensureCourseCollection(course_id) {
    if (!course_id) return null;
    try {
        const course = await courseRepo.findById(course_id);
        if (!course) return null;
        if (course.bunny_collection_id) return course.bunny_collection_id;
        const created = await bunny.createCollection(course.title || `Course ${course_id}`);
        const guid = created?.guid;
        if (!guid) return null;
        await course.update({ bunny_collection_id: guid });
        return guid;
    } catch (e) {
        console.warn('[curriculum] bunny collection ensure failed:', e.message);
        return null;
    }
}

const PUBLIC_ROOT = path.join(__dirname, '..', '..');

const pad2 = (n) => String(n).padStart(2, '0');
const formatDuration = (d) => {
    if (!d) return '00:00:00';
    const p = String(d).split(':');
    if (p.length !== 3) return '00:00:00';
    return `${pad2(p[0])}:${pad2(p[1])}:${pad2(p[2])}`;
};

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

const randomToken = (len = 4) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
};

const fileExt = (filename) => {
    const i = filename.lastIndexOf('.');
    return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
};

const uniqueName = (originalname) => `${Math.floor(Date.now() / 1000)}${randomToken(4)}.${fileExt(originalname)}`;

const removeDir = (relPath) => {
    if (!relPath) return;
    const full = path.join(PUBLIC_ROOT, relPath);
    if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
};

const handleScormUpload = (file) => {
    const dir = 'uploads/lesson_file/scorm_content';
    const fullDir = path.join(PUBLIC_ROOT, dir);
    ensureDir(fullDir);
    const fileName = uniqueName(file.originalname);
    const zipPath = path.join(fullDir, fileName);
    fs.renameSync(file.path, zipPath);
    const folderName = fileName.replace(/\.[^.]+$/, '');
    const extractPath = path.join(fullDir, folderName);
    try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractPath, true);
        fs.unlinkSync(zipPath);
        return folderName;
    } catch (_e) {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        throw new HttpError(500, 'Failed to extract the SCORM file.');
    }
};

const pickFile = (files, key) => files && files[key] && files[key][0];

// ===== Sections =====

const listByCourse = async (course_id) => {
    const sections = await sectionRepo.findByCourse(course_id);
    const ids = sections.map((s) => s.id);
    const lessons = await lessonRepo.findBySectionIds(ids);
    const grouped = sections.map((s) => ({
        ...s.toJSON(),
        lessons: lessons.filter((l) => l.section_id === s.id).map((l) => l.toJSON()),
    }));
    return { sections: grouped };
};

// A session (section in the DB) carries a title, an optional cover image and
// an optional description. The image arrives as multipart under `image`; the
// other two are plain text fields.
const createSection = async ({ body, files }) => {
    const b = body || {};
    const patch = sessionPatch(b);
    if (!patch.title) throw new HttpError(422, 'Title is required');
    if (!b.course_id) throw new HttpError(422, 'course_id is required');

    const last = await sectionRepo.findLastSort(b.course_id);
    const f = pickFile(files, 'image');
    if (f) {
        const dest = `${sessionFolder(b.course_id)}/${uniqueName(f.originalname)}`;
        patch.image = await upload(f, dest, 640, 360);
    }

    const section = await sectionRepo.create({
        ...patch,
        course_id: b.course_id,
        user_id: b.user_id || null,
        sort: (last ? last.sort : 0) + 1,
    });
    return { message: 'Session added successfully', section };
};

const updateSection = async ({ body, files }) => {
    const b = body || {};
    const s = await sectionRepo.findById(b.section_id);
    if (!s) throw new HttpError(404, 'Session not found');

    // `up_title` is the legacy key the old admin form posted; keep accepting it
    // so an un-refreshed browser tab does not start blanking session titles.
    const patch = sessionPatch(
        { ...b, title: b.title !== undefined ? b.title : b.up_title },
        { partial: true },
    );

    const f = pickFile(files, 'image');
    if (f) {
        const dest = `${sessionFolder(s.course_id)}/${uniqueName(f.originalname)}`;
        patch.image = await upload(f, dest, 640, 360);
        if (s.image) await removeFile(s.image);
    } else if (normalizeText(b.remove_image)) {
        // Explicit "clear the cover" from the edit form.
        if (s.image) await removeFile(s.image);
        patch.image = null;
    }

    await s.update(patch);
    return { message: 'update successfully', section: s };
};

const deleteSection = async (id) => {
    const s = await sectionRepo.findById(id);
    if (!s) throw new HttpError(404, 'Session not found');
    if (s.image) await removeFile(s.image);
    await s.destroy();
    return { message: 'Delete successfully' };
};

const sortSections = async (rawIds) => {
    const arr = Array.isArray(rawIds) ? rawIds : JSON.parse(rawIds);
    for (let i = 0; i < arr.length; i++) {
        await sectionRepo.updateSort(arr[i], i + 1);
    }
    return { message: 'Sections sorted successfully' };
};

// ===== Lessons =====

const buildLessonData = async (b, files) => {
    const difficulty = normalizeDifficulty(b.difficulty);
    if (!difficulty.ok) throw new HttpError(422, difficulty.error);

    const data = {
        title: b.title,
        user_id: b.user_id || null,
        course_id: b.course_id,
        section_id: b.section_id,
        is_free: b.free_lesson ? 1 : 0,
        lesson_type: b.lesson_type,
        summary: b.summary || null,
        // Class authoring fields (migration 23). `description` is the long-form
        // blurb; `summary` stays the short one-liner it always was.
        description: normalizeText(b.description),
        difficulty: difficulty.value,
    };

    // Class cover image. Separate from `attachment`: for an image-type lesson
    // the attachment is the lesson content itself, while the thumbnail is the
    // card art shown in the curriculum list.
    const thumb = pickFile(files, 'thumbnail');
    if (thumb) {
        const dest = `${courseFolder(b.course_id)}/${uniqueName(thumb.originalname)}`;
        data.thumbnail = await upload(thumb, dest, 640, 360);
    }

    switch (b.lesson_type) {
        case 'text':
            data.attachment = b.text_description;
            data.attachment_type = b.lesson_provider;
            break;
        case 'video-url':
        case 'html5':
        case 'vimeo-url':
        case 'google_drive':
            data.video_type = b.lesson_provider;
            data.lesson_src = b.lesson_src;
            data.duration = formatDuration(b.duration);
            break;
        case 'iframe':
            data.lesson_src = b.iframe_source;
            break;
        case 'document_type': {
            const f = pickFile(files, 'attachment');
            if (f) {
                const dest = `${courseFolder(b.course_id)}/${uniqueName(f.originalname)}`;
                data.attachment = await upload(f, dest);
                data.attachment_type = b.attachment_type;
            }
            break;
        }
        case 'image': {
            const f = pickFile(files, 'attachment');
            if (f) {
                const dest = `${courseFolder(b.course_id)}/${uniqueName(f.originalname)}`;
                data.attachment = await upload(f, dest);
                data.attachment_type = fileExt(f.originalname);
            }
            break;
        }
        case 'scorm': {
            const f = pickFile(files, 'scorm_file');
            if (f) {
                data.attachment = handleScormUpload(f);
                data.attachment_type = b.scorm_provider;
            }
            break;
        }
        case 'system-video': {
            // Three input shapes the admin form can send, all converge on a
            // Bunny-hosted lesson URL in lesson_src so playback is uniform:
            //   1. file upload (`system_video_file`) — server-side relay to Bunny.
            //   2. lesson_src is an external URL — ingest into Bunny via the
            //      /fetch API so the admin doesn't have to upload to Bunny
            //      dashboard manually.
            //   3. lesson_src is already a Bunny URL (e.g. from the browser's
            //      direct-TUS upload) — keep as-is.
            // All three drop the video into the course's Bunny collection so
            // every video for a course is grouped together.
            const collectionId = await ensureCourseCollection(b.course_id);
            const f = pickFile(files, 'system_video_file');
            if (f) {
                const up = await bunny.uploadVideoForTitle(
                    b.title || 'Lesson Video',
                    f,
                    { collectionId },
                );
                data.lesson_src = up.hlsUrl;
            } else if (b.lesson_src) {
                if (bunny.isExternalImportableUrl(b.lesson_src)) {
                    const up = await bunny.importVideoFromUrl(
                        b.lesson_src,
                        b.title || 'Lesson Video',
                        { collectionId },
                    );
                    data.lesson_src = up.hlsUrl;
                } else {
                    data.lesson_src = b.lesson_src;
                }
            }
            data.video_type = b.lesson_provider || 'system-video';
            data.duration = formatDuration(b.duration);
            break;
        }
        default:
            throw new HttpError(400, `Unknown lesson type '${b.lesson_type}'`);
    }
    return data;
};

const createLesson = async ({ body, files }) => {
    const b = body;
    if (!b.title) throw new HttpError(422, 'Title is required');
    if (!b.course_id || !b.section_id) throw new HttpError(422, 'course_id and section_id required');

    const last = await lessonRepo.findLastSortInCourse(b.course_id);
    const data = await buildLessonData(b, files);
    data.sort = (last ? last.sort : 0) + 1;

    const lesson = await lessonRepo.create(data);
    return { message: 'lesson added successfully', lesson };
};

const updateLesson = async ({ body, files }) => {
    const b = body;
    const lesson = await lessonRepo.findById(b.id);
    if (!lesson) throw new HttpError(404, 'Lesson not found');

    const difficulty = normalizeDifficulty(b.difficulty);
    if (!difficulty.ok) throw new HttpError(422, difficulty.error);

    const data = {
        title: b.title,
        section_id: b.section_id,
        summary: b.summary,
        description: normalizeText(b.description),
        difficulty: difficulty.value,
    };

    // Class cover image. On update the course id comes from the stored row —
    // the edit form does not resend course_id — and the previous file is
    // swept only after the replacement uploads successfully.
    const thumb = pickFile(files, 'thumbnail');
    if (thumb) {
        const dest = `${courseFolder(lesson.course_id)}/${uniqueName(thumb.originalname)}`;
        data.thumbnail = await upload(thumb, dest, 640, 360);
        if (lesson.thumbnail) await removeFile(lesson.thumbnail);
    } else if (normalizeText(b.remove_thumbnail)) {
        if (lesson.thumbnail) await removeFile(lesson.thumbnail);
        data.thumbnail = null;
    }

    switch (b.lesson_type) {
        case 'text':
            data.attachment = b.text_description;
            break;
        case 'video-url':
        case 'html5':
        case 'vimeo-url':
        case 'google_drive':
            data.lesson_src = b.lesson_src;
            data.duration = formatDuration(b.duration);
            break;
        case 'iframe':
            data.lesson_src = b.iframe_source;
            break;
        case 'document_type': {
            const f = pickFile(files, 'attachment');
            if (f) {
                if (lesson.attachment) await removeFile(lesson.attachment);
                const dest = `${courseFolder(lesson.course_id)}/${uniqueName(f.originalname)}`;
                data.attachment = await upload(f, dest);
                data.attachment_type = b.attachment_type;
            }
            break;
        }
        case 'image': {
            const f = pickFile(files, 'attachment');
            if (f) {
                if (lesson.attachment) await removeFile(lesson.attachment);
                const dest = `${courseFolder(lesson.course_id)}/${uniqueName(f.originalname)}`;
                data.attachment = await upload(f, dest);
                data.attachment_type = fileExt(f.originalname);
            }
            break;
        }
        case 'scorm': {
            const f = pickFile(files, 'scorm_file');
            if (f) {
                if (lesson.attachment) removeDir(`uploads/lesson_file/scorm_content/${lesson.attachment}`);
                data.attachment = handleScormUpload(f);
                data.attachment_type = b.scorm_provider;
            }
            break;
        }
        case 'system-video': {
            // Mirror the create-path behaviour: route file uploads, external
            // URL paste-ins, and pre-uploaded Bunny URLs all through Bunny,
            // grouped into the course's Bunny collection. Any previous video
            // gets cleaned up before the new one is recorded.
            const collectionId = await ensureCourseCollection(lesson.course_id);
            const f = pickFile(files, 'system_video_file');
            if (f) {
                if (lesson.lesson_src) await removeFile(lesson.lesson_src);
                const up = await bunny.uploadVideoForTitle(
                    b.title || lesson.title || 'Lesson Video',
                    f,
                    { collectionId },
                );
                data.lesson_src = up.hlsUrl;
            } else if (b.lesson_src && b.lesson_src !== lesson.lesson_src) {
                if (lesson.lesson_src) await removeFile(lesson.lesson_src);
                if (bunny.isExternalImportableUrl(b.lesson_src)) {
                    const up = await bunny.importVideoFromUrl(
                        b.lesson_src,
                        b.title || lesson.title || 'Lesson Video',
                        { collectionId },
                    );
                    data.lesson_src = up.hlsUrl;
                } else {
                    data.lesson_src = b.lesson_src;
                }
            }
            data.duration = formatDuration(b.duration);
            break;
        }
        default:
            throw new HttpError(400, `Unknown lesson type '${b.lesson_type}'`);
    }

    await lesson.update(data);
    return { message: 'lesson update successfully', lesson };
};

const sortLessons = async (rawIds) => {
    const arr = Array.isArray(rawIds) ? rawIds : JSON.parse(rawIds);
    for (let i = 0; i < arr.length; i++) {
        await lessonRepo.updateSort(arr[i], i + 1);
    }
    return { message: 'Lessons sorted successfully' };
};

const deleteLesson = async (id) => {
    const lesson = await lessonRepo.findById(id);
    if (!lesson) throw new HttpError(404, 'Lesson not found');

    if (lesson.lesson_type === 'scorm' && lesson.attachment) {
        removeDir(`uploads/lesson_file/scorm_content/${lesson.attachment}`);
    } else if (lesson.attachment && (lesson.lesson_type === 'document_type' || lesson.lesson_type === 'image')) {
        await removeFile(lesson.attachment);
    }
    if (lesson.lesson_src && lesson.lesson_type === 'system-video') {
        removeFile(lesson.lesson_src);
    }
    // The class cover image is independent of lesson_type, so it is swept for
    // every kind of lesson rather than inside the branches above.
    if (lesson.thumbnail) await removeFile(lesson.thumbnail);

    if (lesson.lesson_type === 'quiz') {
        await questionRepo.destroyByQuiz(lesson.id);
        await submissionRepo.destroyByQuiz(lesson.id);
    }

    await lesson.destroy();
    return { message: 'Deleted successfully' };
};

const showLesson = async (id) => {
    const lesson = await lessonRepo.findById(id);
    if (!lesson) throw new HttpError(404, 'Lesson not found');
    return { lesson };
};

// --- Direct-to-Bunny video upload (used by the admin lesson form) ---------
// Step 1: register the video on Bunny (inside the course's collection so it
// stays grouped with the rest of the course's videos) and hand the browser a
// short-lived, presigned TUS upload ticket. The browser then streams the
// file straight to Bunny — it never touches this server.
const createVideoUpload = async (title, course_id) => {
    const collectionId = await ensureCourseCollection(course_id);
    return bunny.createDirectUpload(title || 'Lesson Video', { collectionId });
};

// Step 2 (polled by the UI): report Bunny's transcode progress so we can show
// "Processing… / Ready".
const getVideoStatus = (guid) => {
    if (!guid) throw new HttpError(422, 'guid is required');
    return bunny.getStatus(guid);
};

module.exports = {
    listByCourse,
    createSection,
    updateSection,
    deleteSection,
    sortSections,
    createLesson,
    updateLesson,
    sortLessons,
    deleteLesson,
    showLesson,
    createVideoUpload,
    getVideoStatus,
};
