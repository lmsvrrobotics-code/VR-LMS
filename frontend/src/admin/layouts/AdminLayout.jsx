import { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, Link, useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import { logout as adminLogout, getStoredUser } from '@/admin/api/auth';
import { getToken as getAdminToken } from '@/admin/api/client';
import { leadStats } from '@/admin/api/leads';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useDashboardTheme } from '@/hooks/useDashboardTheme';

// Decode a JWT payload (base64url) without a library. Returns null on any
// malformed token. The admin-service signs is_root_admin / role / college_id
// into the token, so this is an authoritative fallback when the cached
// admin_user in localStorage is stale or missing those fields.
const decodeJwt = (token) => {
    try {
        const part = token.split('.')[1];
        const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decodeURIComponent(escape(json)));
    } catch (_e) {
        return null;
    }
};

const Icon = ({ d, className = '' }) => (
    <svg
        className={`w-[18px] h-[18px] shrink-0 ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        {d}
    </svg>
);

const ICONS = {
    dashboard: <Icon d={<><path d="M3 12 12 4l9 8" /><path d="M5 10v10h14V10" /></>} />,
    category: <Icon d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>} />,
    course: <Icon d={<><path d="M4 5h12a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3V5z" /><path d="M4 5v11a3 3 0 0 0 3 3" /></>} />,
    users: <Icon d={<><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" /><circle cx="17.5" cy="9.5" r="2.5" /><path d="M15 20c0-2.3 1.5-4 3.5-4s3 1.2 3.5 3" /></>} />,
    certificate: <Icon d={<><circle cx="12" cy="9" r="5" /><path d="M8.5 13 7 21l5-3 5 3-1.5-8" /></>} />,
    assessment: <Icon d={<><path d="M9 4h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M9 9h6" /><path d="M9 13h6" /><path d="M9 17h3" /></>} />,
    program: <Icon d={<><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v6l9 4 9-4V7" /><path d="M12 11v10" /></>} />,
    college: <Icon d={<><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M9 21V12h6v9" /></>} />,
    settings: <Icon d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>} />,
    feedback: <Icon d={<><path d="M12 17.3l-5.4 3 1-6-4.4-4.2 6-.9L12 3l2.8 5.3 6 .9-4.4 4.2 1 6z" /></>} />,
    mail: <Icon d={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>} />,
    chevron: <Icon className="ml-auto transition-transform" d={<path d="m6 9 6 6 6-6" />} />,
    external: <Icon className="w-[14px] h-[14px]" d={<><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" /></>} />,
    logout: <Icon d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>} />,
};

// Sidebar items. Two cohorts see this menu: root admin (full menu) and
// teacher (a filtered subset, computed below). The standalone school/college
// "Mentor Dashboard" flow was removed — there are no school admins, so its
// `collegeOnly` items and cohort branch no longer exist.
const MENU = [
    { key: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard, to: '/admin/dashboard' },
    { key: 'calendar', label: 'Calendar', icon: ICONS.category, to: '/admin/calendar' },
    { key: 'feedback', label: 'Student Feedback', icon: ICONS.feedback, to: '/admin/feedback' },
    { key: 'feedback-forms', label: 'Feedback Forms', icon: ICONS.feedback, to: '/admin/feedback-forms' },
    { key: 'messages', label: 'Messages', icon: ICONS.mail, to: '/admin/messages' },
    // Category sidebar entry removed — course grouping is now driven by the
    // `clg_ids` JSON column written from the course form (CollegeMultiSelect).
    // The /admin/categories route still exists in App.tsx for direct access,
    // but it's no longer surfaced in navigation.
    {
        key: 'course',
        label: 'Course',
        icon: ICONS.course,
        children: [
            { label: 'Manage Courses', to: '/admin/courses' },
            { label: 'Add New Course', to: '/admin/course/create' },
            { label: 'Coupons', to: '/admin/coupons' },
        ],
    },
    // Marketing — one home for everything that drives the public front page
    // (Books, Projects, Gallery, Testimonials). Previously these were four
    // separate top-level groups, which made the sidebar long; grouping them
    // keeps navigation short. Routes are unchanged, so all deep links + the
    // per-page "Add" buttons keep working.
    {
        key: 'marketing',
        label: 'Marketing',
        icon: ICONS.program,
        children: [
            { label: 'Books', to: '/admin/books' },
            { label: 'Projects', to: '/admin/projects' },
            { label: 'Gallery', to: '/admin/gallery' },
            { label: 'Demo Videos', to: '/admin/demo-videos' },
            { label: 'Locations', to: '/admin/locations' },
            { label: 'Testimonials', to: '/admin/testimonials' },
        ],
    },
    {
        key: 'resources',
        label: 'Resources',
        icon: ICONS.assessment,
        children: [
            { label: 'Manage Resources', to: '/admin/resources' },
            // Resource categories (Coding, Maths…) that group teaching
            // resources and drive the teacher dashboard category filter.
            { label: 'Add Category', to: '/admin/resource-categories?action=add' },
        ],
    },
    // Slots menu hidden from the sidebar by request. The feature itself
    // (route /admin/slots, page, and backend) is left intact and reachable
    // by URL — only the nav entry is removed.
    {
        key: 'demos',
        label: 'Demos',
        icon: ICONS.assessment,
        children: [
            { label: 'Manage Demos', to: '/admin/demos' },
        ],
    },
    {
        key: 'classes',
        label: 'Classes',
        icon: ICONS.course,
        children: [
            { label: 'Manage Classes', to: '/admin/classes' },
        ],
    },
    // Assessments menu hidden from the sidebar by request. The feature itself
    // (routes /admin/assessments, pages, and the assessment-service) is left
    // intact and reachable by URL — only the nav entry is removed.
    {
        key: 'program',
        label: 'Programs',
        icon: ICONS.program,
        children: [
            { label: 'Manage Programs', to: '/admin/programs' },
            { label: 'Add New Program', to: '/admin/programs/create' },
        ],
    },
    {
        key: 'certificate',
        label: 'Certificate',
        icon: ICONS.certificate,
        children: [
            { label: 'Settings', to: '/admin/certificate' },
            { label: 'Builder', to: '/admin/certificate/builder' },
            { label: 'Issued Certificates', to: '/admin/certificates' },
        ],
    },
    {
        key: 'users',
        label: 'Users',
        icon: ICONS.users,
        children: [
            {
                key: 'admin',
                label: 'Admin',
                children: [
                    { label: 'Manage Admin', to: '/admin/admins' },
                    { label: 'Add New Admin', to: '/admin/admins/create' },
                ],
            },
            {
                key: 'student',
                label: 'Student',
                children: [
                    { label: 'Manage Students', to: '/admin/students' },
                    { label: 'Add New Student', to: '/admin/students/create' },
                ],
            },
            {
                key: 'teacher',
                label: 'Teacher',
                children: [
                    { label: 'Manage Teachers', to: '/admin/teachers' },
                    { label: 'Add New Teacher', to: '/admin/teachers/create' },
                ],
            },
        ],
    },
    {
        key: 'colleges',
        label: 'Schools',
        icon: ICONS.college,
        children: [
            { label: 'Manage Schools', to: '/admin/colleges' },
            { label: 'Add New School', to: '/admin/colleges/create' },
        ],
    },
    // Batches — moved here from the school admin. Root/super admin manages any
    // college's batches (picks the college on the page). Not collegeOnly, so it
    // shows in the root menu and NOT for school admins.
    {
        key: 'batches',
        label: 'Batches',
        icon: ICONS.users,
        children: [
            { label: 'Manage Batches', to: '/admin/batches' },
            { label: 'Add Batch', to: '/admin/batches?tab=add' },
        ],
    },
    // Teacher-delegation: admin assigns a course + roster to a teacher; the
    // teacher then releases lessons day by day. Visible to root admin here and
    // surfaced to teachers via the teacher cohort filter below.
    {
        key: 'teaching',
        label: 'Teacher Assignments',
        icon: ICONS.users,
        children: [
            { label: 'Add Assignment', to: '/admin/teaching?tab=add' },
            { label: 'Manage Assignments', to: '/admin/teaching' },
        ],
    },
    // Leads — new portal signups awaiting follow-up / conversion to students.
    {
        key: 'leads',
        label: 'Leads',
        icon: ICONS.users,
        children: [
            { label: 'Manage Leads', to: '/admin/leads' },
        ],
    },
    {
        key: 'systemSettings',
        label: 'System Settings',
        icon: ICONS.settings,
        section: 'settings',
        children: [
            { label: 'Email (SMTP)', to: '/admin/settings' },
            { label: 'Manage Language', to: '/admin/settings/languages' },
            { label: 'Live Class Settings', to: '/admin/settings/live-class' },
        ],
    },
];

function isGroupActive(group, pathname, search = '') {
    // Use boundary-aware match so /admin/college doesn't claim /admin/colleges
    // (and vice versa). Exact match OR `to` followed by a `/` segment. When the
    // leaf carries a query string (e.g. `?tab=add-batch`), also require the
    // query to match so deep-linked siblings don't all light up.
    if (group.to) {
        const [toPath, toQuery = ''] = group.to.split('?');
        if (pathname === toPath || pathname.startsWith(toPath + '/')) {
            if (!toQuery) return true;
            const cur = new URLSearchParams(search);
            const target = new URLSearchParams(toQuery);
            const matches = [...target.entries()].every(([k, v]) => cur.get(k) === v);
            if (matches) return true;
        }
    }
    if (group.children) return group.children.some((c) => isGroupActive(c, pathname, search));
    if (group.key === 'course') {
        return pathname.startsWith('/admin/course');
    }
    if (group.key === 'certificate') {
        return pathname.startsWith('/admin/certificate');
    }
    if (group.key === 'program') {
        return pathname.startsWith('/admin/programs');
    }
    if (group.key === 'assessment') {
        return pathname.startsWith('/admin/assessments');
    }
    if (group.key === 'gallery') {
        return pathname.startsWith('/admin/gallery');
    }
    if (group.key === 'books') {
        return pathname.startsWith('/admin/books');
    }
    if (group.key === 'projects') {
        return pathname.startsWith('/admin/projects');
    }
    if (group.key === 'testimonials') {
        return pathname.startsWith('/admin/testimonials');
    }
    if (group.key === 'resources') {
        return pathname.startsWith('/admin/resources') || pathname.startsWith('/admin/resource-categories');
    }
    if (group.key === 'slots') {
        return pathname.startsWith('/admin/slots');
    }
    if (group.key === 'demos') {
        return pathname.startsWith('/admin/demos');
    }
    if (group.key === 'classes') {
        return pathname.startsWith('/admin/classes');
    }
    // Note: `batches` is a children-only group, so the recursion above
    // already lights it up whenever any child's pathname+query matches
    // (see the renderChild matchesLeaf wiring). No special case needed.
    return false;
}

export default function AdminLayout() {
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const { isDark } = useDashboardTheme();
    // Read localStorage once per mount. getStoredUser() does JSON.parse, which
    // returns a fresh object every call — referencing it inline on every
    // render caused downstream effects to see "new" deps and re-fire.
    const adminUser = useMemo(() => getStoredUser(), []);

    // Live "new leads" counter for the sidebar badge so the admin notices
    // portal sign-ups awaiting follow-up. Polls every 60s; errors (e.g. a
    // college admin without lead access) are ignored.
    const [newLeads, setNewLeads] = useState(0);
    useEffect(() => {
        let alive = true;
        const fetchCount = () => leadStats()
            .then((s) => { if (alive) setNewLeads(Number(s?.new) || 0); })
            .catch(() => {});
        fetchCount();
        const id = setInterval(fetchCount, 60000);
        // Instant update when the Leads page changes a lead (contacted/convert/
        // reject/delete) — no need to wait for the next poll.
        const onLeadsChanged = (e) => {
            if (e?.detail && typeof e.detail.newCount === 'number') setNewLeads(e.detail.newCount);
            else fetchCount();
        };
        window.addEventListener('leads:changed', onLeadsChanged);
        return () => { alive = false; clearInterval(id); window.removeEventListener('leads:changed', onLeadsChanged); };
    }, []);
    // The admin JWT is the authoritative source for is_root_admin / role /
    // college_id — it's freshly signed at login, whereas the cached admin_user
    // can be stale or (in older sessions) missing is_root_admin entirely. Read
    // it once per mount and prefer it for the cohort decision below.
    const tokenClaims = useMemo(() => {
        const t = getAdminToken();
        return t ? decodeJwt(t) : null;
    }, []);

    // Routing rule: teachers get a filtered sidebar; every other admin sees the
    // full menu. (The school/college-admin cohort was removed — no such users.)
    const isTeacher = (tokenClaims?.role ?? adminUser?.role) === 'teacher';

    // Two cohorts, two sidebars:
    //   - Teacher: only the Course group (Manage Courses), and only the
    //     Curriculum + Live Class tabs inside Edit Course (see Edit.jsx).
    //   - Admin (root): full menu.
    let visibleMenu;
    if (isTeacher) {
        // Course group ("Manage Courses" only) + Teacher Assignments ("My
        // Classes") where the teacher releases lessons to their students.
        const courseGroup = MENU
            .filter((item) => item.key === 'course')
            .map((item) => ({
                ...item,
                children: (item.children || []).filter((c) => c.to === '/admin/courses'),
            }));
        const teachingGroup = MENU
            .filter((item) => item.key === 'teaching')
            // Teachers release lessons; they don't CREATE assignments → drop the
            // "Add Assignment" child, keep only the manage view.
            .map((item) => ({
                ...item,
                label: 'My Classes',
                children: (item.children || []).filter((c) => c.to === '/admin/teaching'),
            }));
        visibleMenu = [...courseGroup, ...teachingGroup];
    } else {
        visibleMenu = MENU;
    }

    // Hard-stop direct URL access to routes outside an teacher's surface.
    // Teachers are allowed on the course list and the course-edit page.
    // Edit Course tabs are filtered inside Edit.jsx.
    const isTeacherPathAllowed = (p) =>
        p === '/admin' ||
        p === '/admin/' ||
        p === '/admin/courses' ||
        p.startsWith('/admin/courses?') ||
        p === '/admin/teaching' ||
        p.startsWith('/admin/teaching?') ||
        /^\/admin\/course\/edit\/\d+/.test(p);

    useEffect(() => {
        if (isTeacher) {
            if (!isTeacherPathAllowed(pathname)) {
                navigate('/admin/courses', { replace: true });
            }
        }
    }, [isTeacher, pathname, navigate]);

    const handleLogout = async () => {
        await adminLogout();
        navigate('/login', { replace: true });
    };
    const initiallyOpen = {};
    const collectInitiallyOpen = (items, parentKey = '') => {
        items.forEach((m) => {
            if (!m.children) return;
            const key = parentKey ? `${parentKey}.${m.key || m.label}` : (m.key || m.label);
            if (isGroupActive(m, pathname, search)) initiallyOpen[key] = true;
            collectInitiallyOpen(m.children, key);
        });
    };
    collectInitiallyOpen(visibleMenu);
    const [open, setOpen] = useState(initiallyOpen);

    const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));

    // Mobile sidebar drawer — closed by default; the hamburger opens it as an
    // overlay so it doesn't squish the content on small screens.
    const [sidebarOpen, setSidebarOpen] = useState(false);
    // Close the drawer whenever the route changes (after tapping a nav link).
    useEffect(() => { setSidebarOpen(false); }, [pathname, search]);

    // font-semibold is on the base class so every sidebar item — active or
    // not — renders semibold. Active state still gets the skin color; the
    // weight stays consistent so navigation feels uniform.
    const renderChild = (c, parentKey) => {
        if (c.children) {
            const subKey = `${parentKey}.${c.key || c.label}`;
            const subActive = isGroupActive(c, pathname, search);
            const subOpen = open[subKey];
            return (
                <li key={subKey} className="relative">
                    <button
                        type="button"
                        onClick={() => toggle(subKey)}
                        className={`w-full flex items-center pl-[42px] pr-3 py-[7px] text-[13px] font-semibold rounded-ol-8 transition-colors ${
                            subActive ? 'text-skin' : 'text-gray hover:text-dark'
                        }`}
                        aria-expanded={subOpen}
                    >
                        <span className="inline-flex items-center gap-2">
                            <span className="w-[6px] h-[6px] rounded-full bg-current opacity-60" />
                            {c.label}
                        </span>
                        <span className={`ml-auto transition-transform ${subOpen ? 'rotate-180' : ''}`}>
                            {ICONS.chevron}
                        </span>
                    </button>
                    {subOpen && (
                        <ul className="mt-1 mb-1 list-none p-0 flex flex-col gap-[2px]">
                            {c.children.map((leaf) => (
                                <li key={leaf.to}>
                                    <NavLink
                                        to={leaf.to}
                                        className={nestedLinkClsFor(leaf.to, pathname, search)}
                                        end
                                    >
                                        {leaf.label}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    )}
                </li>
            );
        }
        return (
            <li key={c.to} className="relative">
                <NavLink
                    to={c.to}
                    className={subLinkClsFor(c.to, pathname, search)}
                    end
                >
                    <span className="inline-flex items-center gap-2">
                        <span className="w-[6px] h-[6px] rounded-full bg-current opacity-60" />
                        {c.label}
                    </span>
                </NavLink>
            </li>
        );
    };

    // For sidebar leaves whose `to` includes a query string (e.g. Assessments
    // sub-tabs use `?tab=questions`), NavLink's default isActive only matches
    // by pathname — so all three would highlight at once. These helpers do a
    // pathname + query-string compare so the correct tab lights up.
    const matchesLeaf = (leafTo, p, s) => {
        const [leafPath, leafQuery = ''] = leafTo.split('?');
        if (leafPath !== p) return false;
        const current = new URLSearchParams(s);
        const target = new URLSearchParams(leafQuery);
        if ([...target.keys()].length === 0) {
            // The "default" entry has no query (e.g. "Manage Gallery" →
            // /admin/gallery). It must light up ONLY when no distinguishing
            // param is present. Siblings differentiate via `tab` (Assessments,
            // Batches) or `action=add` (Gallery, Books, Projects, …) — so if
            // either is set, the matching sibling owns the highlight, not this
            // default entry. Excluding both prevents "Add" + "Manage" lighting
            // up at the same time.
            return !current.get('tab') && !current.get('action');
        }
        for (const [k, v] of target.entries()) {
            if (current.get(k) !== v) return false;
        }
        return true;
    };
    const subLinkClsFor = (leafTo, p, s) => () =>
        `block pl-[42px] pr-3 py-[7px] text-[13px] font-semibold rounded-ol-8 transition-colors ${
            matchesLeaf(leafTo, p, s) ? 'text-skin' : 'text-gray hover:text-dark'
        }`;
    const nestedLinkClsFor = (leafTo, p, s) => () =>
        `block pl-[60px] pr-3 py-[6px] text-[13px] font-semibold rounded-ol-8 transition-colors ${
            matchesLeaf(leafTo, p, s) ? 'text-skin' : 'text-gray hover:text-dark'
        }`;

    const topLinkCls = ({ isActive }) =>
        `flex items-center gap-3 px-3 py-[10px] rounded-ol-8 text-[14px] font-semibold transition-colors ${
            isActive ? 'bg-lightgreen text-skin' : 'text-gray hover:bg-lightgreen hover:text-skin'
        }`;

    return (
        <div className={`admin-theme min-h-screen flex flex-col bg-bodybg ${isDark ? 'dark admin-dark' : ''}`}>
            <Navbar />

            {/* Mobile-only bar with a button to open the sidebar drawer. */}
            <div className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-white border-b border-border">
                <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="inline-flex items-center gap-2 text-[14px] font-semibold text-gray hover:text-skin"
                    aria-label="Open menu"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    Menu
                </button>
            </div>

            <div className="flex flex-1 relative">
                {/* Backdrop (mobile only) when the drawer is open. */}
                {sidebarOpen && (
                    <div
                        className="lg:hidden fixed inset-0 z-40 bg-black/40"
                        onClick={() => setSidebarOpen(false)}
                        aria-hidden="true"
                    />
                )}
                <aside className={`w-[260px] bg-white border-r border-border shrink-0 flex flex-col
                    fixed inset-y-0 left-0 z-50 transform transition-transform duration-200
                    lg:static lg:translate-x-0 lg:z-auto
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    {/* Close button (mobile only). */}
                    <button
                        type="button"
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden absolute top-3 right-3 text-gray hover:text-skin"
                        aria-label="Close menu"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                    {/* Appearance / theme toggle pinned at the top of the sidebar. */}
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
                        <span className="text-[11px] uppercase tracking-wider text-gray font-semibold">Appearance</span>
                        <ThemeToggle />
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 pt-5 pb-8">
                        <nav className="flex flex-col gap-1">
                            {(() => {
                                const renderItem = (item) => {
                                    if (!item.children) {
                                        // Let the icon inherit color from the NavLink so it
                                        // flips to text-skin alongside the label when active
                                        // (Icon uses stroke="currentColor"). Without this the
                                        // hardcoded text-gray kept the icon grey on /admin/dashboard
                                        // and /admin/categories.
                                        //
                                        // School Dashboard shares its pathname with the Batches
                                        // sub-tabs (`/admin/college?tab=…`). Plain NavLink would
                                        // highlight the Dashboard link AND the Batches group
                                        // whenever a batch tab is active. Use the query-aware
                                        // matchesLeaf so Dashboard only lights up on the bare
                                        // pathname (no `tab` param).
                                        const cls = item.to.includes('?') || ['/admin/college'].includes(item.to)
                                            ? () => topLinkCls({ isActive: matchesLeaf(item.to, pathname, search) })
                                            : topLinkCls;
                                        return (
                                            <NavLink key={item.key} to={item.to} className={cls} end>
                                                {item.icon}
                                                <span>{item.label}</span>
                                            </NavLink>
                                        );
                                    }
                                    const active = isGroupActive(item, pathname, search);
                                    const isOpen = open[item.key];
                                    return (
                                        <div key={item.key}>
                                            <button
                                                type="button"
                                                onClick={() => toggle(item.key)}
                                                className={`w-full flex items-center gap-3 px-3 py-[10px] rounded-ol-8 text-[14px] font-semibold transition-colors ${
                                                    active ? 'bg-lightgreen text-skin' : 'text-gray hover:bg-lightgreen hover:text-skin'
                                                }`}
                                                aria-expanded={isOpen}
                                            >
                                                <span className={active ? 'text-skin' : 'text-gray'}>{item.icon}</span>
                                                <span>{item.label}</span>
                                                {item.key === 'leads' && newLeads > 0 && (
                                                    <span
                                                        className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold leading-none"
                                                        title={`${newLeads} new lead${newLeads === 1 ? '' : 's'} awaiting follow-up`}
                                                    >
                                                        {newLeads > 99 ? '99+' : newLeads}
                                                    </span>
                                                )}
                                                <span className={`ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                                                    {ICONS.chevron}
                                                </span>
                                            </button>
                                            {isOpen && (
                                                <ul className="mt-1 mb-1 list-none p-0 flex flex-col gap-[2px] relative">
                                                    <span className="absolute left-[22px] top-1 bottom-1 w-px bg-ebordermuted" />
                                                    {item.children.map((c) => renderChild(c, item.key))}
                                                </ul>
                                            )}
                                        </div>
                                    );
                                };

                                const mainItems = visibleMenu.filter((i) => i.section !== 'settings');
                                const settingsItems = visibleMenu.filter((i) => i.section === 'settings');

                                return (
                                    <>
                                        <p className="text-[11px] uppercase tracking-wider text-gray font-semibold px-3 mt-2 mb-2">
                                            Main Menu
                                        </p>
                                        {mainItems.map(renderItem)}
                                        {settingsItems.length > 0 && (
                                            <>
                                                <p className="text-[11px] uppercase tracking-wider text-gray font-semibold px-3 mt-4 mb-2">
                                                    Settings
                                                </p>
                                                {settingsItems.map(renderItem)}
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </nav>

                    </div>

                    <div className="px-3 py-4 border-t border-border">
                        {adminUser?.email && (
                            <div className="px-3 mb-2 text-[12px] text-gray truncate" title={adminUser.email}>
                                {adminUser.name || adminUser.email}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-[10px] rounded-ol-8 text-[14px] text-gray hover:bg-lightgreen hover:text-skin transition-colors"
                        >
                            <span className="text-gray">{ICONS.logout}</span>
                            <span>Logout</span>
                        </button>
                    </div>
                </aside>

                {/* min-w-0 — a flex child defaults to min-width:auto, which
                    lets wide content (e.g. data tables) push <main> past the
                    viewport and scroll the whole page. min-w-0 lets it shrink
                    so a page's own overflow-x container scrolls instead. */}
                <main className="flex-1 min-w-0 p-4 lg:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
