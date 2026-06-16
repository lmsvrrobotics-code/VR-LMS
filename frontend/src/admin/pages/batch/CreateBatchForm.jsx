import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';

const API_BASE = (import.meta.env.VITE_ADMIN_API_URL as string) || 'http://localhost:5000';

// New batch creation form:
// - Select Course (from active courses)
// - Select Teacher (from available teachers)
// - Select Students (multi-select from eligible students)
// - Shows auto-generated Batch ID: CourseName_DDMMYY_Count
// - Can add description (optional)
export default function CreateBatchForm({ onBatchCreated }) {
    const [courseId, setCourseId] = useState('');
    const [teacherId, setTeacherId] = useState('');
    const [selectedStudentIds, setSelectedStudentIds] = useState([]);
    const [description, setDescription] = useState('');
    const [searchStudent, setSearchStudent] = useState('');

    const [courses, setCourses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [generatedBatchId, setGeneratedBatchId] = useState('');

    // Load courses, teachers, students on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [coursesRes, teachersRes, studentsRes] = await Promise.all([
                    axios.get(`${API_BASE}/api/admin/courses`, { params: { per_page: 100 } }),
                    axios.get(`${API_BASE}/api/admin/teachers`, { params: { per_page: 100 } }),
                    axios.get(`${API_BASE}/api/admin/students`, { params: { per_page: 200 } }),
                ]);

                setCourses(coursesRes.data?.courses?.data || []);
                setTeachers(teachersRes.data?.teachers?.data || []);
                setStudents(studentsRes.data?.students?.data || []);
            } catch (e) {
                toast.error('Failed to load data');
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Generate batch ID when course changes
    useEffect(() => {
        if (courseId) {
            const course = courses.find((c) => c.id === Number(courseId));
            if (course) {
                // Format: CourseName_DDMMYY_Count
                const now = new Date();
                const dd = String(now.getDate()).padStart(2, '0');
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const yy = String(now.getFullYear()).slice(-2);
                // Course name (first 15 chars, alphanumeric only)
                const courseName = String(course.title || 'Course')
                    .substring(0, 15)
                    .replace(/[^a-zA-Z0-9]/g, '')
                    .toUpperCase();
                // Placeholder count (will be generated server-side)
                setGeneratedBatchId(`${courseName}_${dd}${mm}${yy}_##`);
            }
        }
    }, [courseId, courses]);

    // Filter students by search
    const filteredStudents = useMemo(() => {
        const q = searchStudent.trim().toLowerCase();
        if (!q) return students;
        return students.filter((s) =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q)
        );
    }, [students, searchStudent]);

    const toggleStudent = (id) => {
        const sid = String(id);
        setSelectedStudentIds((cur) =>
            cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid]
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!courseId) return setError('Please select a course');
        if (!teacherId) return setError('Please select a teacher');
        if (selectedStudentIds.length === 0) return setError('Please select at least one student');

        setSubmitting(true);
        try {
            const response = await axios.post(`${API_BASE}/api/admin/batches`, {
                courseId: Number(courseId),
                teacherId: String(teacherId),
                studentIds: selectedStudentIds,
                description: description.trim() || null,
            });

            toast.success(`Batch created: ${response.data?.batch?.batch_id}`);

            // Reset form
            setCourseId('');
            setTeacherId('');
            setSelectedStudentIds([]);
            setDescription('');
            setSearchStudent('');
            setGeneratedBatchId('');

            onBatchCreated?.();
        } catch (e) {
            const msg = e?.response?.data?.error || 'Failed to create batch';
            setError(msg);
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="text-center py-8">Loading data...</div>;
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
            {/* Header */}
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-3 px-5 my-3">
                    <h4 className="text-[16px] font-semibold text-dark m-0 flex items-center gap-2">
                        <i className="fi-rr-plus" />
                        Create New Batch
                    </h4>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
                    {error}
                </div>
            )}

            {/* Course Selection */}
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-3 px-5">
                    <label className="block text-sm font-semibold text-dark mb-2">
                        <i className="fi-rr-book mr-1" /> Course *
                    </label>
                    <select
                        value={courseId}
                        onChange={(e) => setCourseId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    >
                        <option value="">-- Select Course --</option>
                        {courses.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.title}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Teacher Selection */}
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-3 px-5">
                    <label className="block text-sm font-semibold text-dark mb-2">
                        <i className="fi-rr-user mr-1" /> Teacher *
                    </label>
                    <select
                        value={teacherId}
                        onChange={(e) => setTeacherId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    >
                        <option value="">-- Select Teacher --</option>
                        {teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Batch ID Preview */}
            {generatedBatchId && (
                <div className="ol-card rounded-ol-8 bg-blue-50">
                    <div className="ol-card-body py-3 px-5">
                        <label className="block text-sm font-semibold text-dark mb-1">
                            Batch ID (Auto-generated)
                        </label>
                        <p className="text-base font-mono text-primary">
                            {generatedBatchId}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                            Final count will be assigned when batch is created
                        </p>
                    </div>
                </div>
            )}

            {/* Students Selection */}
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-3 px-5">
                    <label className="block text-sm font-semibold text-dark mb-2">
                        <i className="fi-rr-users-alt mr-1" /> Students ({selectedStudentIds.length}) *
                    </label>
                    <input
                        type="text"
                        placeholder="Search students by name or email..."
                        value={searchStudent}
                        onChange={(e) => setSearchStudent(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 focus:outline-none focus:border-primary"
                    />
                    <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                        {filteredStudents.length === 0 ? (
                            <div className="p-4 text-center text-gray-500">No students found</div>
                        ) : (
                            filteredStudents.map((s) => (
                                <label
                                    key={s.id}
                                    className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedStudentIds.includes(String(s.id))}
                                        onChange={() => toggleStudent(s.id)}
                                        className="w-4 h-4 cursor-pointer"
                                    />
                                    <div>
                                        <div className="font-medium text-sm text-dark">{s.name}</div>
                                        <div className="text-xs text-gray-500">{s.email}</div>
                                    </div>
                                </label>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Description */}
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-3 px-5">
                    <label className="block text-sm font-semibold text-dark mb-2">
                        <i className="fi-rr-notepad mr-1" /> Description (Optional)
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add notes about this batch..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                    />
                </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
                <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-6 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 transition"
                >
                    {submitting ? 'Creating...' : 'Create Batch'}
                </button>
            </div>
        </form>
    );
}
