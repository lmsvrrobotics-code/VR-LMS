import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import vrRoboticsLogo from "@/assets/vrrobotics_logo.png";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Menu,
  X,
  BookOpen,
  Book,
  Image as ImageIcon,
  ChevronDown,
  Home,
  Mail,
  Users,
  UserCircle,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePublicContentCounts } from "@/hooks/usePublicContentCounts";
import { logout as adminLogout } from "@/admin/api/auth";

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Which top-level dropdown is open (by name), or null.
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // Which mobile dropdown (Courses / Books) is expanded — keeps the menu short.
  const [mobileSub, setMobileSub] = useState<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logoutUser } = useAuth();
  // Drives tab visibility: a section with no admin content is hidden entirely
  // rather than sending visitors to an empty page.
  const counts = usePublicContentCounts();

  const isActive = (path) => location.pathname === path;

  const dashboardPath = user?.role === "admin" ? "/admin/dashboard" : "/dashboard";
  const initials = (user?.name || user?.email || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    setIsProfileOpen(false);
    try { await adminLogout(); } catch { /* ignore */ }
    try { await logoutUser(); } catch { /* ignore */ }
    navigate("/login", { replace: true });
  };

  // Scroll helper. Supports plain routes ("/about") and home-section anchors
  // ("/#curriculum") — navigate to "/" then smooth-scroll to the element id.
  const scrollToTopWithOffset = (e, path) => {
    e.preventDefault();
    const [pathname, hash] = String(path).split("#");
    navigate(pathname || "/");
    setTimeout(() => {
      const navbarHeight = 80; // Adjust to match lg:h-20 height
      if (hash) {
        const el = document.getElementById(hash);
        if (el) {
          const y = el.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
          window.scrollTo({ top: y, behavior: "smooth" });
          setIsMenuOpen(false);
          return;
        }
      }
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      // if you had anchor targets, you could use:
      // const element = document.querySelector(path);
      // if (element) {
      //   const y = element.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
      //   window.scrollTo({ top: y, behavior: "smooth" });
      // }
    }, 50);
    setIsMenuOpen(false);
  };

  const navigation: {
    name: string;
    href: string;
    icon: typeof Home;
    dropdown?: boolean;
    highlight?: boolean;
  }[] = [
    { name: "Home", href: "/", icon: Home },
    { name: "About", href: "/about", icon: Users },
    { name: "Courses", href: "/vr-courses", icon: BookOpen, dropdown: true },
    // "Books & Kits" is ONE tab covering TWO sections, so it survives while
    // either has content; the dropdown below drops whichever half is empty.
    ...(counts.books > 0 || counts.kits > 0
      ? [{ name: "Books & Kits", href: "/books", icon: Book, dropdown: true }]
      : []),
    ...(counts.gallery > 0
      ? [{ name: "Gallery", href: "/gallery", icon: ImageIcon }]
      : []),
    { name: "Contact Us", href: "/contact", icon: Mail },
  ];

  // Options shown under the "Courses" dropdown — jump to the matching
  // section on the VR Robotics courses page.
  // Each Courses option opens the existing auth UI (login / signup) before
  // letting the visitor reach course content.
  const courseItems = [
    { name: "For Age 8–12", href: "/courses/browse?class=8-12" },
    { name: "For Age 12–18", href: "/courses/browse?class=12-18" },
    { name: "For Engineering", href: "/courses/browse?track=engineering" },
    { name: "For Freshers", href: "/courses/browse?track=freshers" },
    { name: "All Courses", href: "/courses/browse" },
  ];

  // Sub-items under the "Books & Kits" dropdown — navigate to sections. Each
  // is dropped when its own section is empty, so the dropdown never offers a
  // jump to a section that renders nothing.
  const bookItems = [
    ...(counts.books > 0 ? [{ name: "All Books", href: "/books#books-section" }] : []),
    ...(counts.kits > 0 ? [{ name: "Robotics Kits", href: "/books#kits-section" }] : []),
  ];

  // Map each dropdown nav item to its sub-items.
  const dropdownItems: Record<string, { name: string; href: string }[]> = {
    Courses: courseItems,
    "Books & Kits": bookItems,
  };

  // On admin pages the layout uses a fixed-width sidebar (w-[260px]).
  // The shared Navbar's `container-ngo` (centered + padded) leaves the
  // logo floating over neither column. Switching to a full-width row
  // with a 260px-wide logo slot aligns the logo with the sidebar's
  // left edge so it sits directly above the "Main Menu" column.
  const isAdmin = location.pathname.startsWith("/admin");
  const wrapperCls = isAdmin
    ? "flex items-center justify-between h-16 lg:h-20 pr-4 sm:pr-6 lg:pr-8"
    : "flex items-center justify-between h-16 lg:h-20";
  const logoSlotCls = isAdmin
    ? "w-[260px] shrink-0 flex items-center px-3"
    : "shrink-0 flex items-center pr-6 lg:pr-10 mr-2";

  return (
    <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50 overflow-visible">
      <div className={`${isAdmin ? "" : "container-ngo"} overflow-visible`}>
        <div className={`${wrapperCls} overflow-visible`}>
          {/* Logo — big brand image (the highlight of the navbar). */}
          <Link
            to="/"
            onClick={(e) => scrollToTopWithOffset(e, "/")}
            className={`flex items-center transition-transform ${logoSlotCls}`}
            aria-label="VR Robotics Academy — Home"
          >
            <img
              src={vrRoboticsLogo}
              alt="VR Robotics Academy"
              className="h-16 lg:h-[72px] w-auto object-contain"
              loading="eager"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-8 overflow-visible">
            {navigation.map((item) =>
              item.dropdown ? (
                <div
                  key={item.name}
                  className="relative pt-2"
                  onMouseEnter={() => setOpenDropdown(item.name)}
                  onMouseLeave={() => setOpenDropdown(null)}
                >
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === item.name ? null : item.name)}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      openDropdown === item.name
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.name}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${openDropdown === item.name ? "rotate-180" : ""}`} />
                  </button>

                  {openDropdown === item.name && (
                    <div className="absolute left-0 top-full w-64 bg-white rounded-lg shadow-2xl border border-border/50 z-[9999] overflow-hidden pointer-events-auto">
                      {(dropdownItems[item.name] ?? []).map((sub, idx) => (
                        <button
                          key={sub.name}
                          type="button"
                          onClick={() => {
                            navigate(sub.href.split("#")[0]);
                            setOpenDropdown(null);
                            setTimeout(() => {
                              const [pathname, hash] = String(sub.href).split("#");
                              if (hash) {
                                const el = document.getElementById(hash);
                                if (el) {
                                  const navbarHeight = 80;
                                  const y = el.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
                                  window.scrollTo({ top: y, behavior: "smooth" });
                                }
                              }
                            }, 100);
                          }}
                          className={`w-full text-left px-4 py-3 text-sm font-medium text-foreground transition-all duration-150 ease-out hover:bg-primary hover:text-white focus:bg-primary focus:text-white focus:outline-none cursor-pointer ${
                            idx === 0 ? "pt-3" : ""
                          } ${idx === (dropdownItems[item.name] ?? []).length - 1 ? "pb-3" : ""}`}
                          onMouseMove={() => {}}
                        >
                          {sub.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.name}
                  to={item.href.split("#")[0]}
                  onClick={(e) => scrollToTopWithOffset(e, item.href)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    item.highlight
                      ? "text-primary bg-primary/10 font-semibold hover:bg-primary/20"
                      : isActive(item.href)
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              )
            )}
            {/* The student "My Courses" link was removed from the navbar —
                students now reach their courses from the My Courses tab in the
                student dashboard (/student/dashboard). The /enrolled-courses
                route itself still exists for old links and bookmarks. */}
          </div>

          {/* Auth Buttons */}
          <div className="hidden lg:flex items-center space-x-3">
            {user ? (
              <DropdownMenu open={isProfileOpen} onOpenChange={setIsProfileOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center space-x-2 px-2 py-1 rounded-full hover:bg-secondary/50"
                  >
                    <span className="w-9 h-9 rounded-full bg-gradient-hero text-white text-sm font-semibold flex items-center justify-center">
                      {initials}
                    </span>
                    <span className="text-sm font-medium text-foreground max-w-[140px] truncate">
                      {user.name || user.email}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="min-w-[200px]">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1">
                    {user.email}
                    {user.role && (
                      <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] uppercase">
                        {user.role}
                      </span>
                    )}
                  </div>
                  <DropdownMenuItem asChild>
                    <Link
                      to={dashboardPath}
                      onClick={(e) => {
                        scrollToTopWithOffset(e, dashboardPath);
                        setIsProfileOpen(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Dashboard</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-destructive focus:text-destructive"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              /* New auth button — opens the authentication page (/auth) which
                 runs the full login/signup flow against the auth backend. */
              <Link
                to="/auth"
                onClick={(e) => scrollToTopWithOffset(e, "/auth")}
                className="group inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors duration-200 hover:bg-primary/90 hover:text-white"
              >
                <UserCircle className="w-5 h-5" />
                <span>Login / Register</span>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border/50 max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain">
            {/* Auth button pinned at the TOP so it's always visible on mobile
                (the menu below can be long with all the course/book sub-items). */}
            {!user && (
              <Link
                to="/auth"
                onClick={(e) => scrollToTopWithOffset(e, "/auth")}
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-5 py-3 mb-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-primary/90 hover:text-white transition-colors"
              >
                <UserCircle className="w-5 h-5" />
                <span>Login / Register</span>
              </Link>
            )}
            <div className="space-y-2">
              {navigation.map((item) =>
                item.dropdown ? (
                  <div key={item.name} className="space-y-1">
                    {/* Tap to expand/collapse — keeps the mobile menu short. */}
                    <button
                      type="button"
                      onClick={() => setMobileSub(mobileSub === item.name ? null : item.name)}
                      className="flex items-center justify-between w-full px-3 py-3 font-medium text-muted-foreground hover:text-foreground"
                    >
                      <span className="flex items-center">
                        <item.icon className="w-5 h-5 mr-2" />
                        {item.name}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${mobileSub === item.name ? "rotate-180" : ""}`}
                      />
                    </button>
                    {mobileSub === item.name &&
                      (dropdownItems[item.name] ?? []).map((sub) => (
                        <Link
                          key={sub.name}
                          to={sub.href.split("#")[0]}
                          onClick={(e) => scrollToTopWithOffset(e, sub.href)}
                          className="block pl-10 pr-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                        >
                          {sub.name}
                        </Link>
                      ))}
                  </div>
                ) : (
                  <Link
                    key={item.name}
                    to={item.href.split("#")[0]}
                    onClick={(e) => scrollToTopWithOffset(e, item.href)}
                    className={`flex items-center space-x-3 px-3 py-3 rounded-md text-base font-medium whitespace-nowrap ${
                      item.highlight
                        ? "text-primary bg-primary/10 font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                )
              )}
              {/* "My Courses" removed here too — see the desktop nav above. */}
              {/* Logged-in actions (logged-out Login/Register is pinned at top). */}
              {user && (
              <div className="pt-4 space-y-2">
                  <>
                    <div className="flex items-center gap-3 px-3 py-2 border-t border-border/50 pt-4">
                      <span className="w-10 h-10 rounded-full bg-gradient-hero text-white text-sm font-semibold flex items-center justify-center">
                        {initials}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {user.name || user.email}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      </div>
                    </div>
                    <Button
                      className="w-full justify-start bg-gradient-hero border-0"
                      asChild
                    >
                      <Link
                        to={dashboardPath}
                        onClick={(e) => scrollToTopWithOffset(e, dashboardPath)}
                        className="flex items-center space-x-3"
                      >
                        <LayoutDashboard className="w-5 h-5" />
                        <span>Dashboard</span>
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-5 h-5 mr-2" />
                      <span>Logout</span>
                    </Button>
                  </>
              </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
