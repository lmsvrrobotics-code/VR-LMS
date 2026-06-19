import { useState } from 'react';

export default function BasicTab({ course, onSave, formId }) {
    const [f, setF] = useState({
        title: course.title || '',
        short_description: course.short_description || '',
        description: course.description || '',
        // category_id removed — see CollegeMultiSelect below.
        level: course.level || 'beginner',
        // Course category/track: general | engineering | freshers.
        course_type: course.course_type || 'general',
        language: course.language || 'english',
        // Class-access range (Class 1–12). '' = open to all classes.
        class_from: course.class_from == null ? '' : String(course.class_from),
        class_to: course.class_to == null ? '' : String(course.class_to),
        // The screenshot offers only Active / Private. Treat everything else as the closer of the two.
        status: course.status === 'private' ? 'private' : 'active',
        // Whether completing the course issues a certificate. Defaults to
        // true for new courses and for legacy rows where the column was
        // missing (the backend payload normalises null to true).
        has_certificate: course.has_certificate === undefined || course.has_certificate === null
            ? true
            : !!course.has_certificate,
        // Show on homepage — only courses with this enabled appear in the home preview
        show_on_home: !!course.show_on_home,
    });
    const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

    const submit = (e) => {
        e.preventDefault();
        const fd = new FormData();
        Object.entries(f).forEach(([k, v]) => {
            // FormData stringifies booleans to 'true'/'false'; send '1'/'0'
            // so the backend's toBool() reads them as numbers consistently
            // with the other on/off flags (is_paid etc.).
            if (typeof v === 'boolean') fd.append(k, v ? '1' : '0');
            else fd.append(k, v);
        });
        onSave(fd);
    };

    return (
        <form id={formId} onSubmit={submit}>
            <Row label="Course title" required>
                <input
                    className="ol-form-control w-full"
                    value={f.title}
                    onChange={(e) => set('title', e.target.value)}
                    required
                />
            </Row>

            <Row label="Short Description">
                <textarea
                    className="ol-form-control w-full"
                    rows="3"
                    value={f.short_description}
                    onChange={(e) => set('short_description', e.target.value)}
                />
            </Row>

            <Row label="Description">
                <textarea
                    className="ol-form-control w-full"
                    rows="8"
                    value={f.description}
                    onChange={(e) => set('description', e.target.value)}
                />
            </Row>


            <Row label="Course level" required>
                <select
                    className="ol-form-control w-full"
                    value={f.level}
                    onChange={(e) => set('level', e.target.value)}
                    required
                >
                    <option value="everyone">Everyone</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                </select>
            </Row>

            {/* Combined access selector: the class ranges and the former
                "Category" options (For Engineering / For Freshers) share one
                dropdown. A `type:` value sets course_type and clears the numeric
                range; a numeric range sets class_from/to and resets course_type
                to general. Both fields still go to the backend. */}
            <Row label="Class access range">
                <select
                    className="ol-form-control w-full"
                    value={
                        f.course_type && f.course_type !== 'general'
                            ? `type:${f.course_type}`
                            : f.class_from && f.class_to
                                ? `${f.class_from}-${f.class_to}`
                                : ''
                    }
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith('type:')) {
                            set('course_type', v.slice(5));
                            set('class_from', '');
                            set('class_to', '');
                        } else {
                            const [cf, ct] = v.split('-');
                            set('class_from', cf || '');
                            set('class_to', ct || '');
                            set('course_type', 'general');
                        }
                    }}
                >
                    <option value="">All classes</option>
                    <option value="8-12">Class 8 – 12</option>
                    <option value="12-18">Class 12 – 18</option>
                    <option value="type:engineering">For Engineering</option>
                    <option value="type:freshers">For Freshers</option>
                    {f.course_type === 'general' && f.class_from && f.class_to &&
                        !['8-12', '12-18'].includes(`${f.class_from}-${f.class_to}`) && (
                        <option value={`${f.class_from}-${f.class_to}`}>
                            Class {f.class_from} – {f.class_to}
                        </option>
                    )}
                </select>
                <div className="text-[12px] text-gray mt-1">
                    Pick the class group or audience this course is for. "All classes" makes it open to everyone; "For Engineering / For Freshers" also tags it for the matching menu.
                </div>
            </Row>

            <Row label="Made in" required>
                <select
                    className="ol-form-control w-full"
                    value={f.language}
                    onChange={(e) => set('language', e.target.value)}
                    required
                >
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="telugu">Telugu</option>
                    <option value="tamil">Tamil</option>
                    <option value="spanish">Spanish</option>
                    <option value="french">French</option>
                    <option value="german">German</option>
                </select>
            </Row>


            <Row label="Create as" required>
                <div className="flex items-center gap-6 pt-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="status"
                            value="active"
                            checked={f.status === 'active'}
                            onChange={() => set('status', 'active')}
                            className="accent-skin"
                        />
                        <span className="text-[14px]">Active</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="status"
                            value="private"
                            checked={f.status === 'private'}
                            onChange={() => set('status', 'private')}
                            className="accent-skin"
                        />
                        <span className="text-[14px]">Private</span>
                    </label>
                </div>
            </Row>

            <Row label="Provides certificate">
                <div className="flex items-center gap-6 pt-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="has_certificate"
                            checked={f.has_certificate === true}
                            onChange={() => set('has_certificate', true)}
                            className="accent-skin"
                        />
                        <span className="text-[14px]">Yes</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="has_certificate"
                            checked={f.has_certificate === false}
                            onChange={() => set('has_certificate', false)}
                            className="accent-skin"
                        />
                        <span className="text-[14px]">No</span>
                    </label>
                </div>
            </Row>

            <Row label="Show on homepage">
                <div className="flex items-center gap-6 pt-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={f.show_on_home === true}
                            onChange={(e) => set('show_on_home', e.target.checked)}
                            className="accent-skin"
                        />
                        <span className="text-[14px]">Display this course on the homepage preview</span>
                    </label>
                </div>
                <div className="text-[12px] text-gray mt-1">
                    Only courses checked here will appear in the "Our Courses" section on the home page.
                </div>
            </Row>

        </form>
    );
}

function Row({ label, required, children }) {
    return (
        <div className="grid grid-cols-12 gap-4 mb-4 items-start">
            <label className="col-span-12 md:col-span-3 ol-form-label pt-2">
                {label}
                {required && <span className="text-danger ml-1">*</span>}
            </label>
            <div className="col-span-12 md:col-span-9">
                {children}
            </div>
        </div>
    );
}
