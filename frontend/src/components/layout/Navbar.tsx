import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
  MapPin,
  ChevronDown,
  Home,
  Mail,
  Users,
  UserCircle,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
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
    { name: "Books", href: "/books", icon: Book, dropdown: true },
    { name: "Gallery", href: "/gallery", icon: ImageIcon },
    { name: "Locations", href: "/locations", icon: MapPin },
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

  // Sub-items under the "Books" dropdown — includes Books and Kits sections.
  const bookItems = [
    { name: "All Books", href: "/books" },
    { name: "Robotics Kits", href: "/books?tab=kits" },
  ];

  // Map each dropdown nav item to its sub-items.
  const dropdownItems: Record<string, { name: string; href: string }[]> = {
    Courses: courseItems,
    Books: bookItems,
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
    <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
      <div className={isAdmin ? "" : "container-ngo"}>
        <div className={wrapperCls}>
          {/* Logo — big brand image (the highlight of the navbar). */}
          <Link
            to="/"
            onClick={(e) => scrollToTopWithOffset(e, "/")}
            className={`flex items-center transition-transform ${logoSlotCls}`}
            aria-label="VR Robotics Academy — Home"
          >
            <img
              src="https://res.cloudinary.com/dicfqwlfq/image/upload/v1764505259/VR_Robotics_Logo_upscaled_1_rrrrn8.png"
              alt="VR Robotics Academy"
              className="h-16 lg:h-[72px] w-auto object-contain"
              loading="eager"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-8">
            {navigation.map((item) =>
              item.dropdown ? (
                <DropdownMenu
                  key={item.name}
                  open={openDropdown === item.name}
                  onOpenChange={(o) => setOpenDropdown(o ? item.name : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      onMouseEnter={() => setOpenDropdown(item.name)}
                      className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive(item.href)
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.name}</span>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="min-w-[220px]"
                  >
                    {(dropdownItems[item.name] ?? []).map((sub) => (
                      <DropdownMenuItem asChild key={sub.name}>
                        <Link
                          to={sub.href.split("#")[0]}
                          onClick={(e) => {
                            scrollToTopWithOffset(e, sub.href);
                            setOpenDropdown(null); // CLOSE DROPDOWN
                          }}
                          className="cursor-pointer"
                        >
                          {sub.name}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
