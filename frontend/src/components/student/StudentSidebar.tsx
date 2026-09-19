import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Power, LayoutDashboard, MonitorPlay, ClipboardList, MessageSquare, CalendarClock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { greeting, displayName, firstName, initialsOf } from "@/lib/assignmentStatus";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { labelProps, railStateClass } from "@/lib/sidebarMotion";

// The student navigation sidebar, extracted from StudentDashboardShell so pages
// OUTSIDE the shell (the course page, for one) can render the same navigation
// instead of losing it entirely.
//
// The shell drives its tabs in local state, so it passes `active` + `onNavigate`
// and keeps switching tabs in place. A standalone page has no tabs, so it omits
// both and every item routes to /student/dashboard with the tab requested via
// router state — the shell reads that and opens on the right tab.
export const STUDENT_NAV_ITEMS = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "My Courses", icon: MonitorPlay },
  { name: "My Assignments", icon: ClipboardList },
  { name: "Founder Meetings", icon: CalendarClock },
  { name: "Feedback", icon: MessageSquare },
] as const;

export type StudentTabName = (typeof STUDENT_NAV_ITEMS)[number]["name"];

type Props = {
  /** Highlighted item. Omit on pages that are not one of the tabs. */
  active?: StudentTabName;
  /** In-shell tab switch. When omitted, items navigate to the dashboard. */
  onNavigate?: (tab: StudentTabName) => void;
  /** Mobile drawer state, owned by the parent so it can also render a backdrop. */
  open?: boolean;
  onClose?: () => void;
  /**
   * Collapse to an icon-only rail that expands on hover. Used on content pages
   * (the course page) where the navigation should not eat horizontal space.
   * The dashboard shell leaves this off and keeps the full-width sidebar.
   */
  collapsible?: boolean;
};

export default function StudentSidebar({
  active, onNavigate, open = false, onClose, collapsible = false,
}: Props) {
  // Hover-expand only applies to the collapsible variant, and only where the
  // sidebar is actually a rail — on mobile it is a drawer, which the `open`
  // prop already controls.
  const [hovered, setHovered] = useState(false);
  // `expanded` = show labels. A non-collapsible sidebar is always expanded.
  const expanded = !collapsible || hovered;
  const { user, logoutUser } = useAuth();
  const navigate = useNavigate();

  const go = (tab: StudentTabName) => {
    onClose?.();
    if (onNavigate) { onNavigate(tab); return; }
    // Standalone page: hand the shell the tab to open via router state.
    navigate("/student/dashboard", { state: { tab } });
  };

  return (
    <aside
      onMouseEnter={collapsible ? () => setHovered(true) : undefined}
      onMouseLeave={collapsible ? () => setHovered(false) : undefined}
      /* The rail overlays the page when expanded rather than pushing it, so
         the course grid does not reflow on every hover. */
      className={`sidebar-rail shrink-0 bg-gradient-to-b from-[#fff6ee] to-white dark:from-[#1E1C1A] dark:to-[#131210] border-r border-orange-100 dark:border-white/10 flex flex-col
        fixed left-0 top-16 lg:top-20 h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)] z-40
        transform transition-transform duration-200
        lg:translate-x-0
        ${open ? "translate-x-0" : "-translate-x-full"}
        ${collapsible
          /* Stays `fixed` at desktop too, so widening on hover overlays the
             page instead of pushing it. The parent reserves the 76px slot.
             The width easing lives in sidebar-rail (index.css) so it can use a
             gentler curve than Tailwind's ease-out and honour
             prefers-reduced-motion. */
          ? `overflow-hidden ${railStateClass(expanded)}`
          : "w-64 lg:sticky"}`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        className="lg:hidden absolute top-4 right-4 text-muted-foreground hover:text-primary"
      >
        <X className="w-6 h-6" />
      </button>

      {/* The site Navbar already shows the brand, so this header greets the
          student by name alongside the dashboard-scoped theme toggle. */}
      {/* px-4 keeps the 40px avatar centred in the 76px rail (4+40+4 = 48 -> the
          14px gutters match the nav icons below), and the padding itself
          transitions so nothing jumps at the start of the slide. */}
      <div className={`flex items-center justify-between gap-3 py-4 border-b border-orange-100 dark:border-white/10 sidebar-pad ${expanded ? "px-5" : "px-[18px]"}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-hero text-sm font-bold text-white">
            {initialsOf(user)}
          </span>
          {/* Labels stay MOUNTED and fade. Unmounting them mid-slide made the
              text pop in at full opacity while the panel was still moving,
              which is what read as a jerk. aria-hidden + inert keep the
              collapsed rail out of the a11y tree and tab order. */}
          <div {...labelProps(expanded, "min-w-0")}>
            <p className="text-xs text-muted-foreground leading-tight whitespace-nowrap">{greeting()},</p>
            <p className="truncate font-semibold leading-tight" title={displayName(user)}>
              {firstName(user)}
            </p>
          </div>
        </div>
        <div {...labelProps(expanded, "shrink-0")}>
          <ThemeToggle />
        </div>
      </div>

      {/* sidebar-scroll lets the collapsed rail suppress this scrollbar (see
          index.css) — a scrollbar in a 76px icon column is unusable and steals
          the width the icons need. Expanding restores normal scrolling. */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll py-4 space-y-1">
        {STUDENT_NAV_ITEMS.map((item) => {
          const on = active === item.name;
          return (
            <button
              key={item.name}
              onClick={() => go(item.name)}
              aria-current={on ? "page" : undefined}
              title={expanded ? undefined : item.name}
              className={`w-full flex items-center gap-3 py-3 text-sm font-medium transition-colors sidebar-pad ${expanded ? "px-6" : "px-[26px]"} ${
                on
                  ? "bg-primary/10 text-primary border-r-4 border-primary"
                  : "text-muted-foreground hover:bg-orange-50 dark:hover:bg-white/5 hover:text-foreground"
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span {...labelProps(expanded, "flex-1 text-left whitespace-nowrap")}>
                {item.name}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Logout actually ends the session, rather than just navigating away
          and leaving the token in place. */}
      <button
        type="button"
        onClick={() => { void logoutUser(); }}
        title={expanded ? undefined : "Logout"}
        className={`flex items-center gap-3 py-4 text-sm font-semibold text-red-500 border-t border-orange-100 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-500/10 sidebar-pad ${expanded ? "px-6" : "px-[26px]"}`}
      >
        <Power className="w-5 h-5 shrink-0" />
        <span {...labelProps(expanded, "whitespace-nowrap")}>Logout</span>
      </button>
    </aside>
  );
}
