import { Pencil, Eye, EyeOff, Trash2 } from 'lucide-react';

/**
 * Interactive asset card for the admin Manage pages (Gallery, Projects,
 * Testimonials). Provides a hover-lift shell, a status pill, and a hover
 * overlay with round icon actions (Edit / Hide-Show / Delete). `cover` is the
 * top media area (image / video / avatar banner) supplied by each page;
 * `children` is the body content below it.
 */
export default function ManageCard({ cover, active, onEdit, onToggle, onDelete, children }) {
    return (
        <div className="group relative rounded-ol-12 border border-ebordermuted bg-white overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_-18px_rgba(0,0,0,0.32)]">
            <div className="relative h-44 overflow-hidden bg-gray-50">
                {cover}
                <span
                    className={`absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shadow-sm backdrop-blur ${
                        active ? 'bg-green-100/90 text-green-700' : 'bg-gray-200/90 text-gray-600'
                    }`}
                >
                    <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    {active ? 'Active' : 'Hidden'}
                </span>
                <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button type="button" title="Edit" onClick={onEdit}
                        className="w-9 h-9 rounded-full bg-white text-dark flex items-center justify-center hover:bg-skin hover:text-white transition-colors shadow">
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" title={active ? 'Hide' : 'Show'} onClick={onToggle}
                        className="w-9 h-9 rounded-full bg-white text-dark flex items-center justify-center hover:bg-skin hover:text-white transition-colors shadow">
                        {active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button type="button" title="Delete" onClick={onDelete}
                        className="w-9 h-9 rounded-full bg-white text-danger flex items-center justify-center hover:bg-danger hover:text-white transition-colors shadow">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="p-3">{children}</div>
        </div>
    );
}
