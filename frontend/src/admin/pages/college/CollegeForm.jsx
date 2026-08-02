import { useState } from 'react';

// Shared form for Create and Edit. On Edit the parent passes `college`
// (existing record); on Create it's null. `clgId` is editable only in Create
// mode — it is the primary key and is auto-generated server-side when blank.
export default function CollegeForm({ college, onSubmit, submitLabel = 'Save' }) {
    const isEdit = Boolean(college);
    const [form, setForm] = useState({
        clgName: college?.clgName || '',
        clgId: college?.clgId || '',
        clgAddress: college?.clgAddress || '',
    });
    const [submitting, setSubmitting] = useState(false);

    const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            const payload = {
                clgName: form.clgName.trim(),
                clgAddress: form.clgAddress.trim() || undefined,
            };
            // Only forward clgId on Create (empty == auto-generate). It is the
            // primary key on Edit and must not be sent in the update body.
            if (!isEdit && form.clgId.trim()) {
                payload.clgId = form.clgId.trim();
            }
            await onSubmit(payload);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6">
                <label className="ol-form-label">School Name<span className="text-danger"> *</span></label>
                <input
                    className="ol-form-control w-full"
                    name="clgName"
                    value={form.clgName}
                    onChange={onChange}
                    required
                />
            </div>
            <div className="col-span-12 md:col-span-6">
                <label className="ol-form-label">School ID</label>
                <input
                    className="ol-form-control w-full"
                    name="clgId"
                    value={form.clgId}
                    onChange={onChange}
                    disabled={isEdit}
                    placeholder={isEdit ? '' : 'Leave blank to auto-generate'}
                />
                {isEdit && (
                    <p className="text-[12px] text-gray mt-1">School ID is fixed once created.</p>
                )}
            </div>
            <div className="col-span-12">
                <label className="ol-form-label">Address</label>
                <textarea
                    className="ol-form-control w-full"
                    name="clgAddress"
                    rows={3}
                    value={form.clgAddress}
                    onChange={onChange}
                />
            </div>
            <div className="col-span-12 mt-2 flex justify-end border-t border-ebordermuted pt-4">
                <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-ol-8 bg-skin px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-skin-dark disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={submitting}
                >
                    {submitting ? 'Saving…' : submitLabel}
                </button>
            </div>
        </form>
    );
}
