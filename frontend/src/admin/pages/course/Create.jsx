import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { storeCourse } from '../../api/course';
import { listLanguages } from '../../api/language';

const STATUS_RADIOS = [
    { id: 'status_active', value: 'active', label: 'Active', color: 'text-success', ring: 'focus:ring-success' },
    { id: 'status_private', value: 'private', label: 'Private', color: 'text-skin', ring: 'focus:ring-skin' },
    { id: 'status_upcoming', value: 'upcoming', label: 'Upcoming', color: 'text-sky-500', ring: 'focus:ring-sky-500' },
    { id: 'status_pending', value: 'pending', label: 'Pending', color: 'text-danger', ring: 'focus:ring-danger' },
    { id: 'status_draft', value: 'draft', label: 'Draft', color: 'text-gray', ring: 'focus:ring-gray' },
    { id: 'status_inactive', value: 'inactive', label: 'Inactive', color: 'text-dark', ring: 'focus:ring-dark' },
];

function Radio({ id, name, value, checked, onChange, label }) {
    return (
        <label htmlFor={id} className="inline-flex items-center gap-2 cursor-pointer">
            <input
                id={id}
                name={name}
                type="radio"
                value={value}
                checked={checked}
                onChange={onChange}
                className="w-4 h-4 accent-skin cursor-pointer"
            />
            <span className="text-[14px] text-dark">{label}</span>
        </label>
    );
}

export default function CourseCreate() {
    const nav = useNavigate();
    const [form, setForm] = useState({
        title: '',
        short_description: '',
        description: '',
        status: 'active',
        // category_id removed — courses are mapped to colleges via clg_ids.
        level: '',
        // Course category/track: general | engineering | freshers.
        course_type: 'general',
        language: '',
        // Class-access range (Class 1–12). Empty = open to all classes.
        class_from: '',
        class_to: '',
        is_paid: '1',
        price: '',
        discount_flag: '',
        discounted_price: '',
        expiry_period: 'lifetime',
        number_of_month: '',
        enable_drip_content: '0',
        // '1' when this course grants a certificate on completion, '0' when
        // it doesn't. Drives the "Certificate" badge on the public course
        // details page. Defaults to '1' to preserve the prior always-on UX.
        has_certificate: '1',
    });
    const [thumbnail, setThumbnail] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const [languages, setLanguages] = useState([]);
    const [languagesLoading, setLanguagesLoading] = useState(true);

    useEffect(() => {
        setLanguagesLoading(true);
        listLanguages()
            .then((r) => setLanguages(r?.languages || []))
            .catch(() => setLanguages([]))
            .finally(() => setLanguagesLoading(false));
    }, []);

    const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
            fd.append(k, v);
        });
        if (thumbnail) fd.append('thumbnail', thumbnail);

        try {
            const res = await storeCourse(fd);
            toast.success(res.success || 'Course created');
            nav(`/admin/course/edit/${res.course_id}`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} encType="multipart/form-data" className="mb-5">
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body py-12px px-20px my-3 py-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h4 className="text-[16px] font-semibold text-dark m-0 flex items-center gap-2">
                            <i className="fi-rr-settings-sliders" />
                            Add new Course
                        </h4>
                    </div>
                </div>
            </div>

            <div className="ol-card p-3">
                <div className="ol-card-body">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left column */}
                        <div>
                            <div className="mb-3">
                                <label className="ol-form-label" htmlFor="title">
                                    Title<span className="text-danger ml-1">*</span>
                                </label>
                                <input
                                    id="title"
                                    className="ol-form-control"
                                    name="title"
                                    type="text"
                                    placeholder="Enter Course Title"
                                    required
                                    value={form.title}
                                    onChange={(e) => set('title', e.target.value)}
                                />
                            </div>

                            <div className="mb-3">
                                <label className="ol-form-label" htmlFor="short_description">Short Description</label>
                                <textarea
                                    id="short_description"
                                    className="ol-form-control"
                                    name="short_description"
                                    rows="5"
                                    placeholder="Enter Short Description"
                                    value={form.short_description}
                                    onChange={(e) => set('short_description', e.target.value)}
                                />
                            </div>

                            <div className="mb-3">
                                <label className="ol-form-label" htmlFor="description">Description</label>
                                <textarea
                                    id="description"
                                    className="ol-form-control"
                                    name="description"
                                    rows="6"
                                    placeholder="Enter Description"
                                    value={form.description}
                                    onChange={(e) => set('description', e.target.value)}
                                />
                            </div>

                            <div className="mb-2">
                                <label className="ol-form-label">
                                    Create as<span className="text-danger ml-1">*</span>
                                </label>
                                <div className="flex flex-wrap gap-x-5 gap-y-2">
                                    {STATUS_RADIOS.map((r) => (
                                        <Radio
                                            key={r.id}
                                            id={r.id}
                                            name="status"
                                            value={r.value}
                                            checked={form.status === r.value}
                                            onChange={() => set('status', r.value)}
                                            label={r.label}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right column */}
                        <div>
                            <div className="mb-3">
                                <label className="ol-form-label" htmlFor="level">
                                    Course level<span className="text-danger ml-1">*</span>
                                </label>
                                <select
                                    id="level"
                                    className="ol-form-control"
                                    name="level"
                                    required
                                    value={form.level}
                                    onChange={(e) => set('level', e.target.value)}
                                >
                                    <option value="">Select your course level</option>
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                </select>
                            </div>

                            {/* Combined access selector: the class ranges and the
                                former "Category" options (For Engineering / For
                                Freshers) live in one dropdown. A `type:` value sets
                                course_type and clears the numeric range; a numeric
                                range sets class_from/to and resets course_type to
                                general. Both fields still go to the backend. */}
                            <div className="mb-3">
                                <label className="ol-form-label" htmlFor="class_range">
                                    Class access range
                                </label>
                                <select
                                    id="class_range"
                                    className="ol-form-control"
                                    value={
                                        form.course_type && form.course_type !== 'general'
                                            ? `type:${form.course_type}`
                                            : form.class_from && form.class_to
                                                ? `${form.class_from}-${form.class_to}`
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
                                </select>
                                <small className="text-muted">
                                    Pick the class group or audience this course is for. "All classes" makes it open to everyone; "For Engineering / For Freshers" also tags it for the matching menu.
                                </small>
                            </div>

                            <div className="mb-3">
                                <label className="ol-form-label" htmlFor="language">
                                    Made in<span className="text-danger ml-1">*</span>
                                </label>
                                <select
                                    id="language"
                                    className="ol-form-control"
                                    name="language"
                                    required
                                    disabled={languagesLoading}
                                    value={form.language}
                                    onChange={(e) => set('language', e.target.value)}
                                >
                                    <option value="">
                                        {languagesLoading
                                            ? 'Loading languages…'
                                            : languages.length === 0
                                                ? 'No languages — add one in Manage Language'
                                                : 'Select your course language'}
                                    </option>
                                    {languages.map((l) => (
                                        <option key={l.id} value={l.name.toLowerCase()} className="capitalize">
                                            {l.name}
                                        </option>
                                    ))}
                                </select>
                            </div>




                            <div className="mb-3">
                                <label className="ol-form-label">
                                    Pricing type<span className="text-danger ml-1">*</span>
                                </label>
                                <div className="flex flex-wrap gap-x-5 gap-y-2 mb-2">
                                    <Radio
                                        id="paid"
                                        name="is_paid"
                                        value="1"
                                        checked={form.is_paid === '1'}
                                        onChange={() => set('is_paid', '1')}
                                        label="Paid"
                                    />
                                    <Radio
                                        id="free"
                                        name="is_paid"
                                        value="0"
                                        checked={form.is_paid === '0'}
                                        onChange={() => set('is_paid', '0')}
                                        label="Free"
                                    />
                                </div>

                                {form.is_paid === '1' && (
                                    <div className="pt-1">
                                        <div className="mb-3">
                                            <label className="ol-form-label" htmlFor="price">
                                                Price <small className="text-gray">($)</small>
                                                <span className="text-danger ml-1">*</span>
                                            </label>
                                            <input
                                                id="price"
                                                className="ol-form-control"
                                                name="price"
                                                type="number"
                                                min="1"
                                                step="0.01"
                                                placeholder="Enter your course price ($)"
                                                value={form.price}
                                                onChange={(e) => set('price', e.target.value)}
                                            />
                                        </div>

                                        <div className="mb-3 flex items-center gap-2">
                                            <input
                                                id="discount_flag"
                                                type="checkbox"
                                                className="w-4 h-4 accent-skin cursor-pointer"
                                                checked={form.discount_flag === '1'}
                                                onChange={(e) => set('discount_flag', e.target.checked ? '1' : '')}
                                            />
                                            <label htmlFor="discount_flag" className="text-[14px] text-dark cursor-pointer">
                                                Check if this course has discount
                                            </label>
                                        </div>

                                        {form.discount_flag === '1' && (
                                            <div className="mb-3">
                                                <label className="ol-form-label" htmlFor="discounted_price">Discounted price</label>
                                                <input
                                                    id="discounted_price"
                                                    className="ol-form-control"
                                                    name="discounted_price"
                                                    type="number"
                                                    min="1"
                                                    step="0.01"
                                                    placeholder="Enter your discount price ($)"
                                                    value={form.discounted_price}
                                                    onChange={(e) => set('discounted_price', e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="mb-3">
                                <label className="ol-form-label">Expiry period</label>
                                <div className="flex flex-wrap gap-x-5 gap-y-2">
                                    <Radio
                                        id="lifetime_expiry_period"
                                        name="expiry_period"
                                        value="lifetime"
                                        checked={form.expiry_period === 'lifetime'}
                                        onChange={() => set('expiry_period', 'lifetime')}
                                        label="Lifetime"
                                    />
                                    <Radio
                                        id="limited_expiry_period"
                                        name="expiry_period"
                                        value="limited_time"
                                        checked={form.expiry_period === 'limited_time'}
                                        onChange={() => set('expiry_period', 'limited_time')}
                                        label="Limited time"
                                    />
                                </div>
                            </div>

                            {form.expiry_period === 'limited_time' && (
                                <div className="mb-3">
                                    <label className="ol-form-label" htmlFor="number_of_month">Number of month</label>
                                    <input
                                        id="number_of_month"
                                        className="ol-form-control"
                                        name="number_of_month"
                                        type="number"
                                        min="1"
                                        placeholder="After purchase, students can access the course until your selected month."
                                        value={form.number_of_month}
                                        onChange={(e) => set('number_of_month', e.target.value)}
                                    />
                                </div>
                            )}

                            <div className="mb-3">
                                <label className="ol-form-label">
                                    Enable drip content<span className="text-danger ml-1">*</span>
                                </label>
                                <div className="flex flex-wrap gap-x-5 gap-y-2">
                                    <Radio
                                        id="drip_off"
                                        name="enable_drip_content"
                                        value="0"
                                        checked={form.enable_drip_content === '0'}
                                        onChange={() => set('enable_drip_content', '0')}
                                        label="Off"
                                    />
                                    <Radio
                                        id="drip_on"
                                        name="enable_drip_content"
                                        value="1"
                                        checked={form.enable_drip_content === '1'}
                                        onChange={() => set('enable_drip_content', '1')}
                                        label="On"
                                    />
                                </div>
                            </div>

                            <div className="mb-3">
                                <label className="ol-form-label">
                                    Provides certificate
                                </label>
                                <div className="flex flex-wrap gap-x-5 gap-y-2">
                                    <Radio
                                        id="cert_yes"
                                        name="has_certificate"
                                        value="1"
                                        checked={form.has_certificate === '1'}
                                        onChange={() => set('has_certificate', '1')}
                                        label="Yes"
                                    />
                                    <Radio
                                        id="cert_no"
                                        name="has_certificate"
                                        value="0"
                                        checked={form.has_certificate === '0'}
                                        onChange={() => set('has_certificate', '0')}
                                        label="No"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="ol-form-label" htmlFor="thumbnail">Thumbnail</label>
                                <input
                                    id="thumbnail"
                                    className="ol-form-control"
                                    name="thumbnail"
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setThumbnail(e.target.files[0] || null)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button type="submit" className="ol-btn-primary" disabled={submitting}>
                            {submitting ? 'Submitting…' : 'Submit'}
                        </button>
                    </div>
                </div>
            </div>
        </form>
    );
}
