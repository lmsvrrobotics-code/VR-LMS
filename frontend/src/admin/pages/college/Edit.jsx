import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft, School } from 'lucide-react';
import CollegeForm from './CollegeForm';
import { getCollege, updateCollege } from '../../api/college';

export default function CollegeEdit() {
    const { id } = useParams();
    const nav = useNavigate();
    const [college, setCollege] = useState(null);
    const [loadError, setLoadError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        getCollege(id)
            .then((r) => { if (!cancelled) setCollege(r.college); })
            .catch((e) => {
                if (cancelled) return;
                setLoadError(e.response?.data?.error || e.message || 'Failed to load');
            });
        return () => { cancelled = true; };
    }, [id]);

    const onSubmit = async (body) => {
        try {
            await updateCollege(id, body);
            toast.success('School updated successfully');
            nav('/admin/colleges');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
        }
    };

    if (loadError) {
        return (
            <div className="ol-card rounded-ol-8">
                <div className="ol-card-body py-10 px-6 text-center">
                    <p className="text-[16px] font-semibold text-danger mb-2">Couldn’t load school</p>
                    <p className="text-[13px] text-gray mb-4">{loadError}</p>
                    <Link to="/admin/colleges" className="ol-btn-outline-secondary">← Back</Link>
                </div>
            </div>
        );
    }

    if (!college) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading school…</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            {/* Toolbar — matches the Schools list header pattern. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lightgreen text-skin">
                        <School className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                        <h1 className="m-0 text-[18px] font-bold text-dark">Edit School</h1>
                        <p className="m-0 mt-0.5 text-[12px] text-gray truncate">{college.clgName}</p>
                    </div>
                </div>
                <Link to="/admin/colleges" className="inline-flex items-center gap-1.5 rounded-ol-8 border border-ebordermuted px-3.5 py-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-skin hover:text-skin">
                    <ArrowLeft className="h-4 w-4" /> Back
                </Link>
            </div>

            <div className="rounded-ol-12 border border-ebordermuted bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <h4 className="mb-4 text-[15px] font-semibold text-dark">School Info</h4>
                <CollegeForm college={college} onSubmit={onSubmit} submitLabel="Update School" />
            </div>
        </div>
    );
}
