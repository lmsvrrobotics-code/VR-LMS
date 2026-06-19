import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getCourse, updateCourse } from '../../api/course';
import { getStoredUser } from '../../api/auth';
import BasicTab from './tabs/BasicTab';
import PricingTab from './tabs/PricingTab';
import InfoTab from './tabs/InfoTab';
import MediaTab from './tabs/MediaTab';
import SeoTab from './tabs/SeoTab';
import DripTab from './tabs/DripTab';
import CurriculumTab from './tabs/CurriculumTab';
import LiveClassTab from './tabs/LiveClassTab'; // legacy — kept for reference, unused
import CourseLiveClasses from '@/zoom-live-class/admin/CourseLiveClasses';
import {
    HiOutlinePencilSquare,
    HiOutlineDocumentDuplicate,
    HiOutlineDocumentText,
    HiOutlineCurrencyDollar,
    HiOutlineTag,
    HiOutlinePhoto,
    HiOutlineDocumentPlus,
    HiOutlineAdjustmentsHorizontal,
} from 'react-icons/hi2';

const TABS = [
    { key: 'curriculum', label: 'Curriculum', Icon: HiOutlinePencilSquare },
    { key: 'basic', label: 'Basic', Icon: HiOutlineDocumentDuplicate },
    { key: 'live-class', label: 'Live Class', Icon: HiOutlineDocumentText },
    { key: 'pricing', label: 'Pricing', Icon: HiOutlineCurrencyDollar },
    { key: 'info', label: 'Info', Icon: HiOutlineTag },
    { key: 'media', label: 'Media', Icon: HiOutlinePhoto },
    { key: 'seo', label: 'SEO', Icon: HiOutlineDocumentPlus },
    { key: 'drip-content', label: 'Drip Content', Icon: HiOutlineAdjustmentsHorizontal },
];

const PLAYER_BASE = '/courses/programs/course-details/play';
const COURSE_DETAILS_BASE = '/courses/programs/course-details';
const COURSE_FORM_ID = 'admin-course-edit-form';

export default function CourseEdit() {
    const { id } = useParams();
    const [course, setCourse] = useState(null);

    // Teachers only get the Curriculum and Live Class tabs — the rest are
    // admin-only. Read role once per mount; AdminLayout already enforced that
    // an teacher can't reach this page without a valid token.
    const isTeacher = useMemo(() => getStoredUser()?.role === 'teacher', []);
    const visibleTabs = useMemo(
        () => (isTeacher
            ? TABS.filter((t) => t.key === 'curriculum' || t.key === 'live-class')
            : TABS),
        [isTeacher]
    );

    const [tab, setTab] = useState(isTeacher ? 'curriculum' : 'basic');

    const load = async () => {
        const res = await getCourse(id);
        setCourse(res.course_details);
    };

    useEffect(() => { load(); }, [id]);

    const onSave = async (fd) => {
        fd.append('tab', tab);
        try {
            await updateCourse(id, fd);
            toast.success('Course updated successfully');
            load();
        } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    };

    if (!course) return <div className="p-10 text-center text-gray">Loading...</div>;

    const slug = course.slug;
    const frontendUrl = slug ? `${COURSE_DETAILS_BASE}?slug=${slug}` : COURSE_DETAILS_BASE;
    const playerUrl = slug ? `${PLAYER_BASE}/${slug}` : PLAYER_BASE;
    // Tabs that submit a form get a Save Changes button in the header. The button
    // is wired via the HTML `form` attribute so it submits whichever tab is active.
    const isFormTab = ['basic', 'pricing', 'info', 'media', 'seo', 'drip-content'].includes(tab);

    return (
        <div>
            <div className="ol-card rounded-ol-8 mb-3">
                <div className="ol-card-body py-12px px-20px my-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                            <Link
                                to={frontendUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="ol-btn-outline-secondary flex items-center gap-2"
                            >
                                <span>Frontend View</span>
                                <i className="fi-rr-arrow-up-right" />
                            </Link>
                            <Link
                                to={playerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="ol-btn-outline-secondary flex items-center gap-2"
                            >
                                <span>Course Player</span>
                                <i className="fi-rr-arrow-up-right" />
                            </Link>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            {isFormTab && (
                                <button
                                    type="submit"
                                    form={COURSE_FORM_ID}
                                    className="ol-btn-primary"
                                >
                                    Save Changes
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="ol-card">
                <div className="ol-card-body p-20px">
                    <div className="flex flex-wrap md:flex-nowrap gap-3">
                        {/* Sidebar Navigation */}
                        <div className="w-full md:w-[260px] flex-shrink-0">
                            <div className="bg-gradient-to-b from-slate-50 to-white rounded-2xl border border-gray-200 p-3 shadow-sm">
                                <div className="flex flex-col gap-2">
                                    {visibleTabs.map((t, idx) => {
                                        const active = tab === t.key;
                                        const { Icon } = t;
                                        return (
                                            <button
                                                key={t.key}
                                                type="button"
                                                onClick={() => setTab(t.key)}
                                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left font-medium transition-all ${
                                                    active
                                                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50'
                                                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                                                }`}
                                            >
                                                <span
                                                    className={`w-7 h-7 flex items-center justify-center text-[16px] flex-shrink-0 ${
                                                        active
                                                            ? 'text-white'
                                                            : 'text-gray-500 group-hover:text-orange-500'
                                                    }`}
                                                >
                                                    <Icon />
                                                </span>
                                                <span className="text-[13px] font-semibold whitespace-nowrap">{t.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="tab-content w-full flex-1">
                            {tab === 'basic' && <BasicTab course={course} onSave={onSave} formId={COURSE_FORM_ID} />}
                            {tab === 'pricing' && <PricingTab course={course} onSave={onSave} formId={COURSE_FORM_ID} />}
                            {tab === 'info' && <InfoTab course={course} onSave={onSave} formId={COURSE_FORM_ID} />}
                            {tab === 'curriculum' && <CurriculumTab course={course} />}
                            {tab === 'live-class' && <CourseLiveClasses course={course} />}
                            {tab === 'media' && <MediaTab course={course} onSave={onSave} formId={COURSE_FORM_ID} />}
                            {tab === 'seo' && <SeoTab course={course} onSave={onSave} formId={COURSE_FORM_ID} />}
                            {tab === 'drip-content' && <DripTab course={course} onSave={onSave} formId={COURSE_FORM_ID} />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
