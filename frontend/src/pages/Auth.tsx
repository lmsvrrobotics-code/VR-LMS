import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Users, Eye, EyeOff, Loader2 } from "lucide-react";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
      if (!/^\d{10,15}$/.test(phone.trim())) {
        setError("Enter a valid phone number (10-15 digits).");
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
        navigate(role === "teacher" ? "/teacher" : "/", { replace: true });
      } else {
        const profile = await loginUser({ email: email.trim(), password });
        // Route by role: admins → admin dashboard, teachers → their
        // dashboard, everyone else → home.
        const r = profile?.role;
        if (r === "admin" || r === "root" || r === "manager" || r === "editor") {
          // Hard navigation (full reload) so the admin shell mounts cleanly with
          // admin_token / admin_user already persisted in localStorage. A SPA
          // navigate() here can race ProtectedRoute's checkAuth() and bounce
          // the freshly-logged-in admin back out before the user state commits.
          window.location.assign("/admin/dashboard");
        } else if (r === "teacher") {
          navigate("/teacher", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err as Error)?.message ||
        (mode === "signup" ? "Sign up failed." : "Login failed.");
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const working = busy || loading;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-gradient-subtle">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-center gap-5 p-14 bg-gradient-hero text-white">
        <Link to="/" className="font-heading text-3xl font-extrabold">
          VR Robotics Academy
        </Link>
        <p className="text-2xl font-semibold leading-snug max-w-md">
          Learn Robotics &amp; AI faster — with clear guidance and real projects.
        </p>
        <img
          src="https://res.cloudinary.com/dqcybkje5/image/upload/e_make_transparent:25,f_png/v1781151014/IMG-20260610-WA0005.jpg_1_ebvvbt.jpg"
          alt="VR Robotics Academy students building a robot"
          className="w-full max-w-md object-contain"
          loading="lazy"
        />
        <p className="text-white/85 max-w-md">
          Sign in to access your courses, or create an account as a student or a
          teacher to get started.
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
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2">
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
              <Input id="email" name="email" autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="At least 8 characters"
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
