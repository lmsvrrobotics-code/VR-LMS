import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { publicSignup } from "@/api/leadApi";

// Simple public sign-up (marketing lead-gen). Creates a student account so the
// person can log straight into their dashboard (empty — no courses yet), and the
// backend also records a lead so the team can follow up.
const Register = () => {
  const navigate = useNavigate();
  const { loginUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [consent, setConsent] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("Please enter your full name.");
    if (!email.trim()) return setErr("Please enter your email.");
    if (!phone.trim()) return setErr("Please enter your mobile number.");
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    if (password !== confirm) return setErr("Passwords do not match.");
    if (!consent) return setErr("Please confirm your details are accurate.");

    setSubmitting(true);
    try {
      // 1. Create the account (+ a follow-up lead, server-side).
      await publicSignup({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      // 2. Log straight in and land on the (empty) student dashboard.
      await loginUser({ email: email.trim(), password });
      navigate("/dashboard", { replace: true });
    } catch (e2: unknown) {
      const msg =
        (e2 as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error ||
        (e2 as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Something went wrong. Please try again.";
      setErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted py-12 px-4 flex items-start justify-center">
      <div className="w-full max-w-md">
        <Card className="card-ngo border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-xl md:text-2xl font-bold text-gradient-800">
              Create your account
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Sign up to get started — it takes less than a minute.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <Label className="mb-1 block">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="mb-1 block">Email Address <span className="text-red-500">*</span></Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="mb-1 block">Mobile Number <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="mb-1 block">Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm"
                  >
                    {showPwd ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <Label className="mb-1 block">Confirm Password <span className="text-red-500">*</span></Label>
                <Input
                  type={showPwd ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              <label className="flex items-start gap-2">
                <Checkbox
                  id="consent"
                  checked={consent}
                  onCheckedChange={(v) => setConsent(Boolean(v))}
                />
                <span className="text-sm text-muted-foreground">
                  I confirm that the details provided are accurate.
                </span>
              </label>

              {err && <p className="text-sm text-red-600">{err}</p>}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-hero"
              >
                {submitting ? "Creating account…" : "Sign Up"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/auth" className="text-primary font-semibold">
                  Login
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;
