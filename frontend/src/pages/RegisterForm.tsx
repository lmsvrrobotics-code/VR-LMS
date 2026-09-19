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
import { getLandingRoute } from "@/lib/roleRouting";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { publicSignup } from "@/api/leadApi";
import { apiErrorMessage } from "@/lib/apiErrorMessage";
import {
  validateEmail, validateName, validatePassword, validatePhone, validateConfirm,
  errorField, type FieldError,
} from "@/lib/fieldValidation";

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

  // Per-field messages, shown under the input they belong to. A field is only
  // marked once the user has LEFT it (or tried to submit), so we never scold
  // someone for an incomplete address they are still halfway through typing.
  type FieldName = "name" | "email" | "phone" | "password" | "confirm";
  const [fieldErrs, setFieldErrs] = useState<Record<string, FieldError>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // One place that knows every rule, so blur and submit can never disagree.
  const checkField = (field: FieldName, values?: Partial<Record<FieldName, string>>): FieldError => {
    const v = { name, email, phone, password, confirm, ...values };
    switch (field) {
      case "name": return validateName(v.name);
      case "email": return validateEmail(v.email);
      case "phone": return validatePhone(v.phone);
      case "password": return validatePassword(v.password);
      case "confirm": return validateConfirm(v.password, v.confirm);
    }
  };

  const markTouched = (field: FieldName) => {
    setTouched((t) => ({ ...t, [field]: true }));
    setFieldErrs((e) => ({ ...e, [field]: checkField(field) }));
  };

  // Clear a field's error as soon as the user starts fixing it — leaving a red
  // message under a box they are actively correcting reads as broken.
  const onChangeField = (field: FieldName, set: (s: string) => void) => (value: string) => {
    set(value);
    if (fieldErrs[field]) setFieldErrs((e) => ({ ...e, [field]: null }));
    if (err) setErr(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    // Validate everything at once so the user sees every problem in one pass
    // rather than fixing one, resubmitting, and being told about the next.
    const order: FieldName[] = ["name", "email", "phone", "password", "confirm"];
    const next: Record<string, FieldError> = {};
    for (const f of order) next[f] = checkField(f);
    setFieldErrs(next);
    setTouched(Object.fromEntries(order.map((f) => [f, true])));

    const firstBad = order.find((f) => next[f]);
    if (firstBad) {
      // Focus the offending input so keyboard and screen-reader users are
      // taken to the problem instead of hunting for it.
      document.getElementById(`signup-${firstBad}`)?.focus();
      return setErr(next[firstBad] as string);
    }
    if (!consent) return setErr("Please confirm your details are accurate.");

    setSubmitting(true);
    try {
      // 1. Create the account (+ a follow-up lead, server-side).
      //
      // Signup and the auto-login below are SEPARATE outcomes and must not
      // share a catch. They used to: the account was created (HTTP 201), the
      // auto-login then failed, and the single catch rendered "Something went
      // wrong. Please try again." — which reads as "signup failed". It hasn't.
      // Retrying then hit "Email already registered", so a user whose account
      // existed the whole time concluded the site was broken.
      try {
        await publicSignup({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
        });
      } catch (signupErr: unknown) {
        const message = apiErrorMessage(signupErr, "Could not create your account. Please try again.");
        // The API names the field at fault on a validation 4xx — pin the
        // message to that input rather than only showing a page-level banner.
        const field = errorField(signupErr);
        if (field) {
          setFieldErrs((prev) => ({ ...prev, [field]: message }));
          setTouched((t) => ({ ...t, [field]: true }));
          document.getElementById(`signup-${field}`)?.focus();
        }
        setErr(message);
        return;
      }

      // 2. The account now EXISTS. From here every path redirects — the user
      //    must never be left sitting on the signup form after a successful
      //    registration.
      //
      //    Log straight in and land on the dashboard for whatever role the
      //    backend assigned (public signup creates students, but route by the
      //    reported role rather than assuming). Previously this went to
      //    "/dashboard", which redirected to the PUBLIC course catalog — so a
      //    brand-new student was dropped on the marketing site.
      try {
        const profile = await loginUser({ email: email.trim(), password });
        navigate(getLandingRoute(profile?.role), { replace: true });
      } catch {
        // Auto-login failed on a real account — e.g. Supabase hasn't finished
        // propagating the just-created user. Send them to the sign-in screen
        // rather than showing an error next to a form they already completed.
        navigate("/auth", {
          replace: true,
          state: { notice: "Account created. Please sign in to continue." },
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Red ring + message under a field, wired up for assistive tech.
  const fieldProps = (field: string) => ({
    id: `signup-${field}`,
    "aria-invalid": Boolean(touched[field] && fieldErrs[field]),
    "aria-describedby": touched[field] && fieldErrs[field] ? `signup-${field}-error` : undefined,
    className:
      touched[field] && fieldErrs[field]
        ? "border-red-500 focus-visible:ring-red-500"
        : undefined,
  });

  const FieldError = ({ field }: { field: string }) =>
    touched[field] && fieldErrs[field] ? (
      <p id={`signup-${field}-error`} role="alert" className="mt-1 text-sm text-red-600">
        {fieldErrs[field]}
      </p>
    ) : null;

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
                  {...fieldProps("name")}
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => onChangeField("name", setName)(e.target.value)}
                  onBlur={() => markTouched("name")}
                  required
                />
                <FieldError field="name" />
              </div>

              <div>
                <Label className="mb-1 block">Email Address <span className="text-red-500">*</span></Label>
                <Input
                  {...fieldProps("email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => onChangeField("email", setEmail)(e.target.value)}
                  onBlur={() => markTouched("email")}
                  required
                />
                <FieldError field="email" />
              </div>

              <div>
                <Label className="mb-1 block">Mobile Number <span className="text-red-500">*</span></Label>
                <Input
                  {...fieldProps("phone")}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => onChangeField("phone", setPhone)(e.target.value)}
                  onBlur={() => markTouched("phone")}
                  required
                />
                <FieldError field="phone" />
              </div>

              <div>
                <Label className="mb-1 block">Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    {...fieldProps("password")}
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 8 characters, with a number"
                    value={password}
                    onChange={(e) => onChangeField("password", setPassword)(e.target.value)}
                    onBlur={() => markTouched("password")}
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
                <FieldError field="password" />
              </div>

              <div>
                <Label className="mb-1 block">Confirm Password <span className="text-red-500">*</span></Label>
                <Input
                  {...fieldProps("confirm")}
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => onChangeField("confirm", setConfirm)(e.target.value)}
                  onBlur={() => markTouched("confirm")}
                  required
                />
                <FieldError field="confirm" />
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
