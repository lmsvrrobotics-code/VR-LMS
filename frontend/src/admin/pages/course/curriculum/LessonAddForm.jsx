import { useState } from 'react';
import { toast } from 'react-toastify';
import { storeLesson } from '../../../api/curriculum';
import { detectVideoDuration } from './videoDuration';
import BunnyVideoUploader from './BunnyVideoUploader';
import ClassMetaFields from './ClassMetaFields';

// Maps picker value -> backend lesson_type / lesson_provider / label
const TYPE_MAP = {
    youtube:            { lesson_type: 'video-url',     lesson_provider: 'youtube',            label: 'Youtube Video' },
    vimeo:              { lesson_type: 'vimeo-url',     lesson_provider: 'vimeo',              label: 'Vimeo Video' },
    html5:              { lesson_type: 'html5',         lesson_provider: 'html5',              label: 'Video url [.mp4]' },
    google_drive_video: { lesson_type: 'google_drive',  lesson_provider: 'google_drive_video', label: 'Google drive video' },
    text:               { lesson_type: 'text',          lesson_provider: 'text',               label: 'Text' },
    iframe:             { lesson_type: 'iframe',        lesson_provider: 'iframe',             label: 'Iframe embed' },
    video:              { lesson_type: 'system-video',  lesson_provider: 'system-video',       label: 'Video file' },
    document:           { lesson_type: 'document_type', lesson_provider: 'document',           label: 'Document file' },
    image:              { lesson_type: 'image',         lesson_provider: 'image',              label: 'Image' },
    scorm:              { lesson_type: 'scorm',         lesson_provider: 'scorm',              label: 'Scorm Content' },
    // A challenge sends the student to an EXTERNAL site and takes a link
    // back. The URL rides in lesson_src, exactly like a video URL does, so
    // no new column was needed on `lessons` (see migration 27).
    challenge:          { lesson_type: 'challenge',     lesson_provider: 'challenge',          label: 'Challenge' },
};

const isUrlType = (t) => ['youtube', 'vimeo', 'html5', 'google_drive_video'].includes(t);
const isFileType = (t) => ['video', 'document', 'image', 'scorm'].includes(t);

const DOC_PROVIDERS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
const SCORM_PROVIDERS = ['scorm 1.2', 'scorm 2004'];

export default function LessonAddForm({ course, sections, lessonType, onDone }) {
    const map = TYPE_MAP[lessonType];
    const [title, setTitle] = useState('');
    const [sectionId, setSectionId] = useState(sections[0]?.id || '');
    const [summary, setSummary] = useState('');
    const [free, setFree] = useState(false);
    const [lessonSrc, setLessonSrc] = useState('');
    const [iframeSource, setIframeSource] = useState('');
    const [textDescription, setTextDescription] = useState('');
    const [duration, setDuration] = useState('00:00:00');
    const [attachment, setAttachment] = useState(null);
    const [attachmentType, setAttachmentType] = useState(DOC_PROVIDERS[0]);
    const [scormFile, setScormFile] = useState(null);
    const [scormProvider, setScormProvider] = useState(SCORM_PROVIDERS[0]);
    const [saving, setSaving] = useState(false);
    const [detectingDuration, setDetectingDuration] = useState(false);
    // Class metadata: cover image, long-form description, difficulty level.
    const [thumbnail, setThumbnail] = useState(null);
    const [description, setDescription] = useState('');
    // CHALLENGE only — the "Expected output" tab. Either an uploaded file or a
    // pasted URL; `outputMode` decides which is sent, so an admin switching
    // between them cannot accidentally submit both.
    const [outputMode, setOutputMode] = useState('upload');
    const [outputFile, setOutputFile] = useState(null);
    const [outputUrl, setOutputUrl] = useState('');
    const [difficulty, setDifficulty] = useState('');

    // Best-effort duration detection. If we can determine it, prefill the field;
    // otherwise leave whatever the user typed alone.
    const handleUrlChange = (value) => {
        setLessonSrc(value);
        const trimmed = value.trim();
        if (!trimmed) return;
        setDetectingDuration(true);
        detectVideoDuration(trimmed)
            .then((d) => { if (d) setDuration(d); })
            .finally(() => setDetectingDuration(false));
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!map) return;

        // Explicit, meaningful validation BEFORE any work (and before a video
        // upload has already run) — each message names the specific field and
        // what's expected, instead of relying on the browser's generic prompt
        // or a bare "Failed" toast.
        const cleanTitle = title.trim();
        if (!cleanTitle) { toast.error('Enter a lesson name.'); return; }
        if (cleanTitle.length < 3) { toast.error('Lesson name must be at least 3 characters.'); return; }
        if (!sectionId) { toast.error('Choose a session for this lesson.'); return; }

        // Duration applies to timed lesson types; HH:MM:SS with valid ranges.
        const durationTypes = isUrlType(lessonType) || lessonType === 'video';
        if (durationTypes && duration && duration !== '00:00:00') {
            const m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(duration.trim());
            if (!m) { toast.error('Duration must be in HH:MM:SS format, e.g. 01:05:30.'); return; }
        }

        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('course_id', course.id);
            fd.append('section_id', sectionId);
            fd.append('title', cleanTitle);
            fd.append('summary', summary || '');
            fd.append('free_lesson', free ? 1 : 0);
            fd.append('lesson_type', map.lesson_type);
            fd.append('lesson_provider', map.lesson_provider);
            fd.append('description', description || '');
            fd.append('difficulty', difficulty || '');
            if (thumbnail) fd.append('thumbnail', thumbnail);

            if (isUrlType(lessonType)) {
                if (!lessonSrc || !lessonSrc.trim()) { toast.error('Enter the video URL.'); setSaving(false); return; }
                fd.append('lesson_src', lessonSrc.trim());
                fd.append('duration', duration || '00:00:00');
            } else if (lessonType === 'iframe') {
                if (!iframeSource || !iframeSource.trim()) { toast.error('Paste the embed / iframe code.'); setSaving(false); return; }
                fd.append('iframe_source', iframeSource);
            } else if (lessonType === 'text') {
                if (!textDescription || !textDescription.trim()) { toast.error('Add the lesson text content.'); setSaving(false); return; }
                fd.append('text_description', textDescription);
            } else if (lessonType === 'video') {
                if (!lessonSrc) { toast.error('Please upload a video and wait for it to finish'); setSaving(false); return; }
                fd.append('lesson_src', lessonSrc);
                fd.append('duration', duration || '00:00:00');
            } else if (lessonType === 'document') {
                if (!attachment) { toast.error('Please choose a document'); setSaving(false); return; }
                fd.append('attachment', attachment);
                fd.append('attachment_type', attachmentType);
            } else if (lessonType === 'image') {
                if (!attachment) { toast.error('Please choose an image'); setSaving(false); return; }
                fd.append('attachment', attachment);
            } else if (lessonType === 'scorm') {
                if (!scormFile) { toast.error('Please choose a SCORM zip'); setSaving(false); return; }
                fd.append('scorm_file', scormFile);
                fd.append('scorm_provider', scormProvider);
            } else if (lessonType === 'challenge') {
                const url = (lessonSrc || '').trim();
                if (!url) { toast.error('Enter the challenge link.'); setSaving(false); return; }
                // Validate here as well as server-side: catching it before the
                // request means the admin keeps everything they typed instead
                // of bouncing off a 422 with a half-filled form.
                let parsed;
                try { parsed = new URL(url); } catch {
                    toast.error('Enter a valid link, including https://'); setSaving(false); return;
                }
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                    toast.error('Only http:// and https:// links are allowed'); setSaving(false); return;
                }
                fd.append('lesson_src', url);
                // Expected output is OPTIONAL — a challenge can be purely
                // written instructions — so neither field is required.
                if (outputMode === 'upload' && outputFile) {
                    fd.append('attachment', outputFile);
                } else if (outputMode === 'url' && outputUrl.trim()) {
                    const ref = outputUrl.trim();
                    let okRef;
                    try { okRef = new URL(ref); } catch {
                        toast.error('Enter a valid output link, including https://'); setSaving(false); return;
                    }
                    if (okRef.protocol !== 'http:' && okRef.protocol !== 'https:') {
                        toast.error('Only http:// and https:// output links are allowed'); setSaving(false); return;
                    }
                    fd.append('expected_output_url', ref);
                }
            }

            await storeLesson(fd);
            toast.success('Lesson saved.');
            onDone();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not save the lesson. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (!map) return <div className="text-[14px] text-gray">Unknown lesson type.</div>;

    return (
        <form onSubmit={submit}>
            <div className="bg-lightgreen/60 border border-softgreen/70 rounded-ol-8 p-3 mb-3 flex items-center justify-between">
                <p className="text-[14px] text-dark m-0"><span className="text-gray">Lesson type:</span> <strong>{map.label}</strong></p>
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Lesson name</label>
                <input className="ol-form-control" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
            </div>

            <div className="mb-3">
                <label className="ol-form-label">Session</label>
                <select className="ol-form-control" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
                    {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
            </div>

            {isUrlType(lessonType) && (
                <>
                    <div className="mb-3">
                        <label className="ol-form-label">Video url</label>
                        <input
                            className="ol-form-control"
                            value={lessonSrc}
                            onChange={(e) => handleUrlChange(e.target.value)}
                            onPaste={(e) => handleUrlChange(e.clipboardData.getData('text'))}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label className="ol-form-label">
                            Duration (HH:MM:SS)
                            {detectingDuration && <span className="ml-2 text-[12px] text-gray">Detecting…</span>}
                        </label>
                        <input className="ol-form-control" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="00:00:00" />
                    </div>
                </>
            )}

            {lessonType === 'challenge' && (
                <div className="mb-3">
                    <label className="ol-form-label">Challenge link</label>
                    <input
                        className="ol-form-control"
                        type="url"
                        value={lessonSrc}
                        onChange={(e) => setLessonSrc(e.target.value)}
                        placeholder="https://scratch.mit.edu/projects/..."
                        required
                    />
                    <p className="text-[12px] text-gray mt-1">
                        Where the student does the work — a Scratch project, a Code.org level, a
                        GitHub task. It opens in a new tab. When they are finished they submit a
                        link to their own result on this class, and you approve it or send it back.
                    </p>
                    <p className="text-[12px] text-gray mt-1">
                        The student sees two tabs before this opens:
                        <strong> Instructions</strong> (the Description field above) and
                        <strong> Expected output</strong> (below).
                    </p>

                    <label className="ol-form-label mt-4">Expected output <span className="text-gray font-normal">(optional)</span></label>
                    <p className="text-[12px] text-gray mb-2">
                        Show them what &ldquo;done&rdquo; looks like — a screenshot of the finished
                        project, or a short clip of it running.
                    </p>
                    <div className="flex items-center gap-4 mb-2">
                        <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                            <input
                                type="radio"
                                name="output_mode"
                                value="upload"
                                checked={outputMode === 'upload'}
                                onChange={() => setOutputMode('upload')}
                                className="accent-skin"
                            />
                            Upload image or video
                        </label>
                        <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                            <input
                                type="radio"
                                name="output_mode"
                                value="url"
                                checked={outputMode === 'url'}
                                onChange={() => setOutputMode('url')}
                                className="accent-skin"
                            />
                            Paste a link
                        </label>
                    </div>
                    {outputMode === 'upload' ? (
                        <input
                            className="ol-form-control"
                            type="file"
                            accept="image/*,video/*"
                            onChange={(e) => setOutputFile(e.target.files[0])}
                        />
                    ) : (
                        <input
                            className="ol-form-control"
                            type="url"
                            value={outputUrl}
                            onChange={(e) => setOutputUrl(e.target.value)}
                            placeholder="https://youtu.be/... or a link to an image"
                        />
                    )}
                </div>
            )}

            {lessonType === 'iframe' && (
                <div className="mb-3">
                    <label className="ol-form-label">Iframe source</label>
                    <textarea className="ol-form-control" rows="3" value={iframeSource} onChange={(e) => setIframeSource(e.target.value)} required />
                </div>
            )}

            {lessonType === 'text' && (
                <div className="mb-3">
                    <label className="ol-form-label">Text description</label>
                    <textarea className="ol-form-control" rows="6" value={textDescription} onChange={(e) => setTextDescription(e.target.value)} placeholder="HTML allowed" />
                </div>
            )}

            {lessonType === 'video' && (
                <>
                    <BunnyVideoUploader
                        title={title}
                        onUploaded={(hlsUrl) => setLessonSrc(hlsUrl)}
                        onDuration={(d) => setDuration(d)}
                    />
                    <div className="mb-3">
                        <label className="ol-form-label">
                            Duration (HH:MM:SS)
                            {detectingDuration && <span className="ml-2 text-[12px] text-gray">Detecting…</span>}
                        </label>
                        <input className="ol-form-control" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="00:00:00" />
                    </div>
                </>
            )}

            {lessonType === 'document' && (
                <>
                    <div className="mb-3">
                        <label className="ol-form-label">Document file</label>
                        <input type="file" className="ol-form-control" onChange={(e) => setAttachment(e.target.files?.[0] || null)} required />
                    </div>
                    <div className="mb-3">
                        <label className="ol-form-label">Document type</label>
                        <select className="ol-form-control" value={attachmentType} onChange={(e) => setAttachmentType(e.target.value)}>
                            {DOC_PROVIDERS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                        </select>
                    </div>
                </>
            )}

            {lessonType === 'image' && (
                <div className="mb-3">
                    <label className="ol-form-label">Image file</label>
                    <input type="file" className="ol-form-control" accept="image/*" onChange={(e) => setAttachment(e.target.files?.[0] || null)} required />
                </div>
            )}

            {lessonType === 'scorm' && (
                <>
                    <div className="mb-3">
                        <label className="ol-form-label">SCORM zip file</label>
                        <input type="file" className="ol-form-control" accept=".zip" onChange={(e) => setScormFile(e.target.files?.[0] || null)} required />
                    </div>
                    <div className="mb-3">
                        <label className="ol-form-label">SCORM version</label>
                        <select className="ol-form-control" value={scormProvider} onChange={(e) => setScormProvider(e.target.value)}>
                            {SCORM_PROVIDERS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                        </select>
                    </div>
                </>
            )}

            <ClassMetaFields
                image={thumbnail}
                onImageChange={setThumbnail}
                description={description}
                onDescriptionChange={setDescription}
                difficulty={difficulty}
                onDifficultyChange={setDifficulty}
                descriptionLabel={lessonType === 'challenge' ? 'Instructions' : 'Class description'}
                descriptionHint={lessonType === 'challenge'
                    ? 'Shown to the student as the Instructions tab, before they open the task.'
                    : ''}
            />

            <div className="mb-3">
                <label className="ol-form-label">Summary</label>
                <textarea className="ol-form-control" rows="3" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>

            <div className="mb-3 flex items-center gap-2">
                <input id="free_lesson" type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
                <label htmlFor="free_lesson" className="text-[14px] text-dark">Mark as free lesson</label>
            </div>

            <div className="text-center">
                <button className="ol-btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Add lesson'}</button>
            </div>
        </form>
    );
}
