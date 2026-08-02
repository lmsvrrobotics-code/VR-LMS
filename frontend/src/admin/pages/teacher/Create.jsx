import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import TeacherForm from './TeacherForm';
import { createTeacher } from '../../api/teacher';

export default function TeacherCreate() {
    const nav = useNavigate();

    const onSubmit = async (fd) => {
        try {
            await createTeacher(fd);
            toast.success('Teacher add successfully');
            nav('/admin/teachers');
        } catch (e) {
            console.error('Create teacher failed:', e);
            // uiMessage is set by the api client and names the offending field(s)
            // on a validation failure — far more useful than a bare status line.
            const message = e.uiMessage || e.response?.data?.error || e.response?.data?.message || e.message || 'Failed';
            toast.error(message);
        }
    };

    return (
        <div>
            <div className="ol-card">
                <div className="ol-card-body py-3 px-5 my-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h4 className="text-[16px] font-semibold text-dark">Create Teacher</h4>
                        <Link to="/admin/teachers" className="ol-btn-outline-secondary">← Back</Link>
                    </div>
                </div>
            </div>
            <div className="ol-card p-4">
                <h4 className="text-[16px] font-semibold text-dark mb-5">Teacher Info</h4>
                <div className="ol-card-body">
                    <TeacherForm onSubmit={onSubmit} submitLabel="Create Teacher" />
                </div>
            </div>
        </div>
    );
}
