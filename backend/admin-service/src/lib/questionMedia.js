// Per-question media rules for quiz questions.
//
// A question may carry an image, a video, or both, so a teacher can ask about
// a circuit photo or a clip of a robot misbehaving instead of text alone.
// Everything here is pure: deciding WHICH file to store, WHERE it goes and
// WHETHER the old one should be swept up. The actual upload/delete is left to
// QuizService so this stays unit-testable with no R2, Bunny or DB.

// Questions are addressed by quiz, not by course, because the admin question
// form only ever knows its quiz. Keeping every asset for one quiz under one
// prefix means deleting a quiz can sweep the whole folder later.
const questionFolder = (quizId) => `uploads/quizzes/${quizId}/questions`;

// Same shape multer hands CurriculumService: files is an object of arrays.
const pickFile = (files, key) => (files && files[key] && files[key][0]) || null;

// Accept only what we can actually render back to the student. The browser
// reports `application/octet-stream` for files whose extension has no
// registered association on Windows, so fall back to the extension — the same
// lesson the assignment attachment filter already learned.
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'];
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'ogv'];

const extOf = (name) => {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
};

const isImageFile = (file) => {
    if (!file) return false;
    if (String(file.mimetype || '').startsWith('image/')) return true;
    return IMAGE_EXTS.includes(extOf(file.originalname));
};

const isVideoFile = (file) => {
    if (!file) return false;
    if (String(file.mimetype || '').startsWith('video/')) return true;
    return VIDEO_EXTS.includes(extOf(file.originalname));
};

// An admin form posts multipart, so every scalar arrives as a string. "Remove
// the image" is a checkbox, which means it can arrive as "1", "true", "on" —
// or as the literal "false"/"0" when the form always sends the field.
const isTruthyFlag = (v) => {
    if (v === true) return true;
    if (v === undefined || v === null) return false;
    const s = String(v).trim().toLowerCase();
    return s !== '' && s !== '0' && s !== 'false' && s !== 'off' && s !== 'null' && s !== 'undefined';
};

// Decide what should happen to ONE media slot on an update.
//   { action: 'replace', file }  → upload `file`, then delete `current`
//   { action: 'clear' }          → delete `current`, store null
//   { action: 'keep' }           → leave the column untouched
//
// A new file always wins over the remove flag: a teacher who ticks "remove"
// and then picks a replacement means replace, not delete-then-nothing.
const planMediaSlot = ({ file, removeFlag, current }) => {
    if (file) return { action: 'replace', file };
    if (isTruthyFlag(removeFlag) && current) return { action: 'clear' };
    return { action: 'keep' };
};

module.exports = {
    questionFolder,
    pickFile,
    isImageFile,
    isVideoFile,
    isTruthyFlag,
    planMediaSlot,
};
