import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

/**
 * Manage Programs — admin CRUD for educational programs.
 * This page will allow admins to create, view, edit, and delete programs.
 */

export default function ProgramIndex() {
    const [programs, setPrograms] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(false);
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-skin rounded-full animate-spin mb-3" />
                <p className="text-[14px]">Loading programs…</p>
            </div>
        );
    }

    return (
        <div>
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body py-12px px-20px my-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h4 className="text-[16px] font-semibold text-dark m-0">Programs</h4>
                        <button
                            type="button"
                            className="ol-btn-outline-secondary flex items-center gap-10px"
                        >
                            <span className="fi-rr-plus" />
                            <span>Add Program</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="ol-card">
                <div className="ol-card-body p-3">
                    <div className="py-12 text-center border border-dashed border-border rounded-ol-8">
                        <p className="text-[16px] font-semibold text-dark mb-1">No programs yet</p>
                        <p className="text-[13px] text-gray">Click "Add Program" to create the first one.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
