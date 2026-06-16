import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';

const API_BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || 'http://localhost:5000';

export default function CreateSlotForm({ batchId, onSlotCreated }) {
    const [formData, setFormData] = useState({
        batchId: batchId || '',
        courseId: '',
        slotDate: '',
        startTime: '08:00',
        endTime: '09:00',
        capacity: 30,
        topic: '',
        meetingLink: '',
        notes: '',
    });

    const [courses, setCourses] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Load courses
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const res = await axios.get(\\/api/admin/courses\, { params: { per_page: 100 } });
                setCourses(res.data?.courses?.data || []);
            } catch (e) {
                console.error('Failed to load courses');
            }
        };
        fetchCourses();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.batchId || !formData.courseId || !formData.slotDate || !formData.startTime || !formData.endTime) {
            return setError('Please fill all required fields');
        }

        if (formData.startTime >= formData.endTime) {
            return setError('Start time must be before end time');
        }

        setSubmitting(true);
        try {
            await axios.post(\\/api/admin/slots\, {
                batchId: Number(formData.batchId),
                courseId: Number(formData.courseId),
                slotDate: formData.slotDate,
                startTime: formData.startTime,
                endTime: formData.endTime,
                capacity: Number(formData.capacity),
                topic: formData.topic || null,
                meetingLink: formData.meetingLink || null,
                notes: formData.notes || null,
            });

            toast.success('Slot created successfully');
            setFormData({
                batchId: batchId || '',
                courseId: '',
                slotDate: '',
                startTime: '08:00',
                endTime: '09:00',
                capacity: 30,
                topic: '',
                meetingLink: '',
                notes: '',
            });
            onSlotCreated?.();
        } catch (e) {
            const msg = e?.response?.data?.error || 'Failed to create slot';
            setError(msg);
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Create Slot</h3>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-red-800 text-sm">
                    {error}
                </div>
            )}

            {/* Batch ID */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Batch ID *
                </label>
                <input
                    type="text"
                    name="batchId"
                    value={formData.batchId}
                    onChange={handleChange}
                    placeholder="Scratch_160625_01"
                    disabled={!!batchId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* Course */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Course *
                </label>
                <select
                    name="courseId"
                    value={formData.courseId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                >
                    <option value="">-- Select Course --</option>
                    {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                </select>
            </div>

            {/* Date */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Slot Date *
                </label>
                <input
                    type="date"
                    name="slotDate"
                    value={formData.slotDate}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* Time Range */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Time *
                    </label>
                    <input
                        type="time"
                        name="startTime"
                        value={formData.startTime}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Time *
                    </label>
                    <input
                        type="time"
                        name="endTime"
                        value={formData.endTime}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                </div>
            </div>

            {/* Capacity */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Capacity
                </label>
                <input
                    type="number"
                    name="capacity"
                    value={formData.capacity}
                    onChange={handleChange}
                    min="1"
                    max="200"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* Topic */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Topic (Optional)
                </label>
                <input
                    type="text"
                    name="topic"
                    value={formData.topic}
                    onChange={handleChange}
                    placeholder="e.g., Introduction to Basics"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* Meeting Link */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting Link (Optional)
                </label>
                <input
                    type="url"
                    name="meetingLink"
                    value={formData.meetingLink}
                    onChange={handleChange}
                    placeholder="https://zoom.us/..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* Notes */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (Optional)
                </label>
                <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows="3"
                    placeholder="Add any notes..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
            </div>

            <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
                {submitting ? 'Creating...' : 'Create Slot'}
            </button>
        </form>
    );
}
