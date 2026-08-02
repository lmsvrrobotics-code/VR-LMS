import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, School } from 'lucide-react';
import CollegeForm from './CollegeForm';
import { createCollege } from '../../api/college';

export default function CollegeCreate() {
    const nav = useNavigate();

    const onSubmit = async (body) => {
        try {
            await createCollege(body);
            toast.success('School added successfully');
            nav('/admin/colleges');
        } catch (e) {
            const message = e.uiMessage || e.response?.data?.error || e.response?.data?.message || e.message || 'Failed';
            toast.error(message);
        }
    };

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            {/* Toolbar — matches the Schools list header pattern. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <School className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Add School</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray">Register a new partner school on the platform.</p>
                    </div>
                </div>
                <Link to="/admin/colleges" className="inline-flex items-center gap-1.5 rounded-ol-8 border border-ebordermuted px-3.5 py-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-skin hover:text-skin">
                    <ArrowLeft className="h-4 w-4" /> Back
                </Link>
            </div>

            <div className="rounded-ol-12 border border-ebordermuted bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <h4 className="mb-4 text-[15px] font-semibold text-dark">School Info</h4>
                <CollegeForm onSubmit={onSubmit} submitLabel="Create School" />
            </div>
        </div>
    );
}
