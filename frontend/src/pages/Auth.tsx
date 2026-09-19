import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Users, Eye, EyeOff, Loader2 } from "lucide-react";
import { getLandingRoute, isAdminRole, UNKNOWN_ROLE_HOME } from "@/lib/roleRouting";
import { authErrorMessage, authErrorField } from "@/lib/authErrorMessage";
import { validateEmail, validatePhone } from "@/lib/fieldValidation";

/**
 * VR Robotics Academy — basic authentication UI (Login + Sign Up).
 * Self-contained page wired to the existing auth hook/backend. Supports a
 * Student / Teacher role on sign up (Teacher registers as `teacher`, which
 * the auth-service /register endpoint already accepts).
 *
 * Query params:
 *   ?mode=signup|login   initial tab
 *   ?role=teacher        preselect the Teacher role + signup tab
 */
const Auth = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginUser, registerUser, loading } = useAuth();

  const initialTeacher = params.get("role") === "teacher";
  // Public self-signup is DISABLED — accounts are created by an admin. The page
  // is login-only; "interest" goes through the public Register (lead) form.
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<"student" | "teacher">(
    initialTeacher ? "teacher" : "student",
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which input to outline, when the failure is attributable to one.
  const [badField, setBadField] = useState<"email" | "password" | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBadField(null);

    // Catch an obviously malformed address before spending a round trip on it —
    // otherwise a typo comes back as a 401 that reads like a wrong password.
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      setBadField("email");
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      setBadField("password");
      passwordRef.current?.focus();
      return;
    }
    // Password-length rule applies to NEW accounts only — existing accounts
    // (e.g. admins) may have shorter legacy passwords and must still log in.
    if (mode === "signup") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      // This read /^d{10,15}$/ — a literal "d", not \d — so every real phone
      // number was rejected and the string "dddddddddd" was accepted.
      const phoneErr = validatePhone(phone);
      if (phoneErr) {
        setError(phoneErr);
        setBadField(null);
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await registerUser({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          phone: phone.trim(),
          // Backend requires these; sensible defaults for the basic form.
          dob: "2000-01-01",
          gender: "male",
        });
        navigate(getLandingRoute(role), { replace: true });
      } else {
        const profile = await loginUser({ email: email.trim(), password });
        // Route strictly by the role the backend reported. getLandingRoute
        // enumerates every known role explicitly; an unknown/missing role
        // resolves to /auth rather than falling through to the student site.
        // (The previous `else → "/"` meant ANY role-resolution hiccup silently
        // dropped teachers and admins onto the student pages.)
        const destination = getLandingRoute(profile?.role);

        if (destination === UNKNOWN_ROLE_HOME) {
          // Authenticated but we could not establish a role — refuse to guess.
          setError(
            "Your account has no role assigned. Please contact your administrator.",
          );
          return;
        }

        if (isAdminRole(profile?.role)) {
          // Hard navigation (full reload) so the admin shell mounts cleanly with
          // admin_token / admin_user already persisted in localStorage. A SPA
          // navigate() here can race ProtectedRoute's checkAuth() and bounce
          // the freshly-logged-in admin back out before the user state commits.
          window.location.assign(destination);
        } else {
          navigate(destination, { replace: true });
        }
      }
    } catch (err: unknown) {
      // This used to fall through to (err as Error).message, which for axios is
      // the literal "Request failed with status code 401" — an HTTP status
      // shown to someone who simply mistyped their password.
      setError(authErrorMessage(err, mode));
      const field = authErrorField(err);
      // A 401 is deliberately not attributed to one field (the server does not
      // say which half was wrong), so only mark an input when we actually know.
      setBadField(field);
      if (field === "email") emailRef.current?.focus();
      else if (field === "password") passwordRef.current?.focus();
      else if (mode === "login") passwordRef.current?.select();
    } finally {
      setBusy(false);
    }
  };

  const working = busy || loading;

  return (
    // Height accounts for the sticky navbar above (h-16 / lg:h-20) so the
    // split-screen fills the remaining viewport without forcing a scroll.
    <div className="min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)] grid lg:grid-cols-2 bg-gradient-subtle">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-center items-center gap-6 p-14 bg-gradient-hero text-white overflow-hidden">
        {/* soft glow accents for depth */}
        <span className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 w-full max-w-md text-center space-y-3">
          <Link to="/" className="font-heading text-3xl font-extrabold inline-block">
            VR Robotics Academy
          </Link>
          <p className="text-2xl font-bold leading-snug">
            Where kids build real robots — and real confidence.
          </p>
        </div>

        <img
          src="https://res.cloudinary.com/dqcybkje5/image/upload/e_trim:5/v1781159227/ChatGPT_Image_Jun_10_2026_05_15_27_PM_1_aeqt2n.png"
          alt="VR Robotics Academy students building a robot together"
          className="relative z-10 w-full max-w-xl object-contain drop-shadow-2xl -my-2"
          loading="lazy"
        />

        <div className="relative z-10 flex flex-wrap justify-center gap-2 max-w-md">
          {["Hands-on projects", "Build real robots", "Coding & AI", "Ages 8–18"].map((t) => (
            <span
              key={t}
              className="text-[13px] font-medium bg-white/15 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-full"
            >
              {t}
            </span>
          ))}
        </div>

        <p className="relative z-10 text-white/85 text-sm text-center max-w-md">
          Sign in to access your courses, or create an account to get started.
        </p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-card p-8">
          <div className="lg:hidden mb-6 text-center font-heading text-2xl font-extrabold">
            <span className="text-gradient">VR</span> Robotics Academy
          </div>

          {/* Single-mode login — public sign-up is disabled (new users use the
              "Register your interest" lead form below), so no tab switcher. */}
          <h1 className="text-2xl font-bold mb-1">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-muted-foreground text-sm mb-6">
            {mode === "login"
              ? "Enter your credentials to continue."
              : "Join VR Robotics Academy in a minute."}
          </p>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2"
            >
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <>
                {/* Role selector */}
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { val: "student", label: "Student", icon: Users },
                    { val: "teacher", label: "Teacher", icon: GraduationCap },
                  ] as const).map((r) => (
                    <button
                      type="button"
                      key={r.val}
                      onClick={() => setRole(r.val)}
                      className={`flex items-center gap-2 justify-center rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                        role === r.val
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <r.icon className="w-4 h-4" /> {r.label}
                    </button>
                  ))}
                </div>

                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" />
                </div>

                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    autoComplete="tel"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="10-digit mobile number"
                  />
                </div>
              </>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                ref={emailRef}
                autoComplete="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // Clear the failure as soon as they start correcting it.
                  if (error) { setError(null); setBadField(null); }
                }}
                required
                placeholder="you@example.com"
                aria-invalid={badField === "email"}
                className={badField === "email" ? "border-red-500 focus-visible:ring-red-500" : undefined}
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  ref={passwordRef}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) { setError(null); setBadField(null); }
                  }}
                  required
                  // On login the password already exists — stating a length
                  // rule there implies the account must satisfy it.
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  aria-invalid={badField === "password"}
                  className={badField === "password" ? "border-red-500 focus-visible:ring-red-500" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type={showPwd ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter your password"
                />
              </div>
            )}

            <Button type="submit" disabled={working} className="w-full bg-gradient-hero border-0">
              {working && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "login" ? "Login" : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            New here? <Link to="/register" className="text-primary font-semibold">Register your interest</Link> — our team will set up your account.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
