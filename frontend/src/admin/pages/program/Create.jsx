import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

/**
 * Create Program — admin form to create a new educational program.
 */

export default function ProgramCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: '',
        description: '',
        duration: '',
        status: '1',
    });
    const [submitting, setSubmitting] = useState(false);

    const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // API call would go here
            toast.success('Program created successfully');
            navigate('/admin/programs');
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to create program');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body py-12px px-20px my-3">
                    <h4 className="text-[16px] font-semibold text-dark m-0">Create Program</h4>
                </div>
            </div>

            <div className="ol-card">
                <div className="ol-card-body p-6">
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="ol-form-label">Program Name<span className="text-danger ms-1">*</span></label>
                            <input
                                className="ol-form-control"
                                type="text"
                                required
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                placeholder="e.g. Robotics Fundamentals"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="ol-form-label">Description</label>
                            <textarea
                                className="ol-form-control"
                                rows="4"
                                value={form.description}
                                onChange={(e) => set('description', e.target.value)}
                                placeholder="Program description and objectives"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="ol-form-label">Duration (weeks)</label>
                            <input
                                className="ol-form-control"
                                type="number"
                                value={form.duration}
                                onChange={(e) => set('duration', e.target.value)}
                                placeholder="e.g. 12"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="ol-form-label">Status</label>
                            <select
                                className="ol-form-control"
                                value={form.status}
                                onChange={(e) => set('status', e.target.value)}
                            >
                                <option value="1">Active</option>
                                <option value="0">Inactive</option>
                            </select>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                className="ol-btn-outline-secondary"
                                onClick={() => navigate('/admin/programs')}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="ol-btn-primary"
                                disabled={submitting}
                            >
                                {submitting ? 'Creating…' : 'Create Program'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
