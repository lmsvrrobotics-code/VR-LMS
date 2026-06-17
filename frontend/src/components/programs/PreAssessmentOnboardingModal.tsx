import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EligibleProgram,
  getEligiblePrograms,
  PreAssessmentGender,
  PreAssessmentProgram,
  submitPreAssessmentRegistration,
} from "@/api/preAssessmentRegistrationApi";

const GENDER_OPTIONS: PreAssessmentGender[] = ["Male", "Female", "Other"];

const ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const ACCEPTED_EXT = [".pdf", ".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB — matches the backend cap.

const EMAIL_REGEX = /^[^s@]+@[^s@]+\.[^s@]+$/;
const PHONE_REGEX = /^[0-9+-s()]{7,20}$/;

type FormState = {
  fullName: string;
  email: string;
  phoneNumber: string;
  gender: PreAssessmentGender | "";
  selectedProgramId: number | null;
  selectedProgram: PreAssessmentProgram | "";
  collegeProof: File | null;
  declarationAccurate: boolean;
  declarationCommunication: boolean;
};

const INITIAL_STATE: FormState = {
  fullName: "",
  email: "",
  phoneNumber: "",
  gender: "",
  selectedProgramId: null,
  selectedProgram: "",
  collegeProof: null,
  declarationAccurate: false,
  declarationCommunication: false,
};

type FieldErrors = Partial<Record<keyof FormState | "form", string>>;

interface PreAssessmentOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: Partial<Pick<FormState, "fullName" | "email" | "phoneNumber" | "gender">>;
  onSuccess?: () => void;
}

export function PreAssessmentOnboardingModal({
  open,
  onOpenChange,
  defaultValues,
  onSuccess,
}: PreAssessmentOnboardingModalProps) {
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Admin-created programs the student is eligible for (matched server side
  // by college + batch + enrolled-course). Fetched fresh every time the
  // modal opens so a newly-published program shows up without a page reload.
  const [eligible, setEligible] = React.useState<EligibleProgram[]>([]);
  const [eligibleLoading, setEligibleLoading] = React.useState(false);
  const [eligibleError, setEligibleError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setEligibleLoading(true);
    setEligibleError(null);
    getEligiblePrograms()
      .then((res) => {
        if (!alive) return;
        setEligible(Array.isArray(res.data?.programs) ? res.data.programs : []);
      })
      .catch((err) => {
        if (!alive) return;
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message || "Could not load programs";
        setEligibleError(msg);
        setEligible([]);
      })
      .finally(() => {
        if (alive) setEligibleLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // Hydrate form with logged-in profile defaults whenever the modal opens.
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      ...INITIAL_STATE,
      fullName: defaultValues?.fullName || "",
      email: defaultValues?.email || "",
      phoneNumber: defaultValues?.phoneNumber || "",
      gender: (defaultValues?.gender as PreAssessmentGender) || "",
    });
  }, [open, defaultValues?.fullName, defaultValues?.email, defaultValues?.phoneNumber, defaultValues?.gender]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = (state: FormState): FieldErrors => {
    const next: FieldErrors = {};
    const name = state.fullName.trim();
    if (!name) next.fullName = "Full name is required";
    else if (name.length < 2) next.fullName = "Please enter your full name";

    const email = state.email.trim();
    if (!email) next.email = "Email is required";
    else if (!EMAIL_REGEX.test(email)) next.email = "Enter a valid email address";

    const phone = state.phoneNumber.trim();
    if (!phone) next.phoneNumber = "Phone number is required";
    else if (!PHONE_REGEX.test(phone))
      next.phoneNumber = "Enter a valid phone number (7-20 digits)";

    if (!state.gender) next.gender = "Select your gender";
    if (!state.selectedProgramId || !state.selectedProgram)
      next.selectedProgram = "Please choose a program";

    if (!state.collegeProof) next.collegeProof = "Upload your school ID / proof";
    else {
      const file = state.collegeProof;
      const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
      if (!ACCEPTED_MIME.includes(file.type) && !ACCEPTED_EXT.includes(ext))
        next.collegeProof = "Only PDF, JPG, or PNG files are allowed";
      else if (file.size > MAX_FILE_SIZE)
        next.collegeProof = "File must be smaller than 5 MB";
    }

    if (!state.declarationAccurate || !state.declarationCommunication)
      next.declarationAccurate = "Please accept both declarations to continue";

    return next;
  };

  const allDeclarationsAccepted =
    form.declarationAccurate && form.declarationCommunication;

  const onPickFile = (file: File | null) => {
    update("collegeProof", file);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    onPickFile(f);
    // Allow re-selecting the same file by resetting the input.
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setSubmitting(true);
      await submitPreAssessmentRegistration({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phoneNumber: form.phoneNumber.trim(),
        gender: form.gender as PreAssessmentGender,
        selectedProgramId: form.selectedProgramId as number,
        selectedProgram: form.selectedProgram as PreAssessmentProgram,
        declarationAccepted: allDeclarationsAccepted,
        collegeProof: form.collegeProof as File,
      });
      onSuccess?.();
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { message?: string; errors?: Record<string, string> } };
      };
      const apiErrors = e?.response?.data?.errors;
      const apiMessage = e?.response?.data?.message;
      if (apiErrors && typeof apiErrors === "object") {
        setErrors(apiErrors as FieldErrors);
      } else {
        setErrors({ form: apiMessage || "Failed to submit. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!submitting ? onOpenChange(next) : undefined)}>
      <DialogContent
        className={cn(
          "max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-0 shadow-2xl rounded-2xl",
          "backdrop-blur-xl bg-white"
        )}
      >
        <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8A33] px-6 py-5 text-white rounded-t-2xl">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-xl md:text-2xl font-semibold tracking-tight">
              Pre-Assessment Onboarding
            </DialogTitle>
            <DialogDescription className="text-white/85 text-sm">
              A quick few details before you begin — this helps us personalise
              your experience and verify your eligibility.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit} className="px-6 py-6 space-y-6" noValidate>
          {/* Personal info */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#FF6A00]">
              Personal Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name" required error={errors.fullName} htmlFor="pa-fullName">
                <Input
                  id="pa-fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Anika Sharma"
                  value={form.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  aria-invalid={!!errors.fullName}
                />
              </Field>

              <Field label="Email" required error={errors.email} htmlFor="pa-email">
                <Input
                  id="pa-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  aria-invalid={!!errors.email}
                />
              </Field>

              <Field label="Phone Number" required error={errors.phoneNumber} htmlFor="pa-phone">
                <Input
                  id="pa-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  value={form.phoneNumber}
                  onChange={(e) =>
                    update("phoneNumber", e.target.value.replace(/[^0-9+-s()]/g, ""))
                  }
                  aria-invalid={!!errors.phoneNumber}
                />
              </Field>

              <Field label="Gender" required error={errors.gender} htmlFor="pa-gender">
                <select
                  id="pa-gender"
                  value={form.gender}
                  onChange={(e) =>
                    update("gender", e.target.value as PreAssessmentGender)
                  }
                  aria-invalid={!!errors.gender}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-2"
                >
                  <option value="" disabled>
                    Select gender
                  </option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Program selection — driven by admin-created programs that match
              the student's college / batch / enrolled courses. Loading and
              empty states are explicit so a student knows whether to wait,
              contact admin, or pick. */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[#FF6A00]">
                Program Interested
              </h3>
              <span className="text-xs text-gray-500">Select one</span>
            </div>

            {eligibleLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading programs…
              </div>
            ) : eligibleError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                {eligibleError}
              </div>
            ) : eligible.length === 0 ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-700">
                No programs are available for your school/batch yet — please
                contact your administrator.
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-label="Program Interested"
                aria-invalid={!!errors.selectedProgram}
                className="grid grid-cols-1 md:grid-cols-3 gap-3"
              >
                {eligible.map((program) => {
                  const isSelected = form.selectedProgramId === program.id;
                  const bullets = Array.isArray(program.features)
                    ? program.features
                    : [];
                  return (
                    <button
                      type="button"
                      key={program.id}
                      onClick={() => {
                        update("selectedProgramId", program.id);
                        update("selectedProgram", program.title);
                      }}
                      role="radio"
                      aria-checked={isSelected}
                      className={cn(
                        "group relative text-left rounded-xl border p-4 transition-all duration-200",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-2",
                        isSelected
                          ? "border-[#FF6A00] bg-[#FF6A00]/5 shadow-md"
                          : "border-gray-200 hover:border-[#FF6A00]/50 hover:shadow-sm"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p
                            className={cn(
                              "text-sm font-semibold leading-tight",
                              isSelected ? "text-[#FF6A00]" : "text-gray-800"
                            )}
                          >
                            {program.title}
                          </p>
                          {program.tagline && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {program.tagline}
                            </p>
                          )}
                        </div>
                        <span
                          aria-hidden
                          className={cn(
                            "h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition",
                            isSelected
                              ? "border-[#FF6A00] bg-[#FF6A00]"
                              : "border-gray-300 bg-white"
                          )}
                        >
                          {isSelected && (
                            <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          )}
                        </span>
                      </div>
                      {bullets.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {bullets.map((b) => (
                            <li
                              key={b}
                              className="flex items-start gap-1.5 text-xs text-gray-600"
                            >
                              <CheckCircle2
                                className={cn(
                                  "h-3.5 w-3.5 mt-0.5 shrink-0",
                                  isSelected ? "text-[#FF6A00]" : "text-gray-400"
                                )}
                              />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {errors.selectedProgram && (
              <p className="text-xs text-red-600 mt-1">{errors.selectedProgram}</p>
            )}
          </section>

          {/* College proof upload */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#FF6A00]">
              School ID / Proof
            </h3>
            <p className="text-xs text-gray-500">
              Accepted formats: PDF, JPG, PNG. Max 5 MB.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label="Upload school ID or proof"
              className={cn(
                "rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-all",
                "flex flex-col items-center justify-center text-center gap-2",
                dragActive
                  ? "border-[#FF6A00] bg-[#FF6A00]/5"
                  : "border-gray-300 hover:border-[#FF6A00]/50 bg-gray-50/50",
                errors.collegeProof && "border-red-400"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={onFileInputChange}
              />
              {form.collegeProof ? (
                <div className="flex items-center gap-3 w-full justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-[#FF6A00] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {form.collegeProof.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(form.collegeProof.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickFile(null);
                    }}
                    className="p-1 rounded-full hover:bg-gray-200 text-gray-500"
                    aria-label="Remove uploaded file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <UploadCloud className="h-8 w-8 text-[#FF6A00]" />
                  <p className="text-sm text-gray-700">
                    <span className="font-medium text-[#FF6A00]">Click to upload</span> or
                    drag and drop
                  </p>
                  <p className="text-xs text-gray-500">PDF, JPG, PNG up to 5MB</p>
                </>
              )}
            </div>
            {errors.collegeProof && (
              <p className="text-xs text-red-600">{errors.collegeProof}</p>
            )}
          </section>

          {/* Declaration */}
          <section className="space-y-3 rounded-xl bg-gray-50 border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-[#FF6A00]">Declaration & Submit</h3>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={form.declarationAccurate}
                onCheckedChange={(v) => update("declarationAccurate", v === true)}
                className="mt-0.5 border-[#FF6A00] data-[state=checked]:bg-[#FF6A00] data-[state=checked]:text-white"
              />
              <span className="text-sm text-gray-700 leading-relaxed">
                I confirm that all details provided above are accurate.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={form.declarationCommunication}
                onCheckedChange={(v) => update("declarationCommunication", v === true)}
                className="mt-0.5 border-[#FF6A00] data-[state=checked]:bg-[#FF6A00] data-[state=checked]:text-white"
              />
              <span className="text-sm text-gray-700 leading-relaxed">
                I agree to receive communication related to the test and further updates.
              </span>
            </label>
            {errors.declarationAccurate && (
              <p className="text-xs text-red-600">{errors.declarationAccurate}</p>
            )}
          </section>

          {errors.form && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.form}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                !allDeclarationsAccepted ||
                eligibleLoading ||
                eligible.length === 0 ||
                !form.selectedProgramId
              }
              className={cn(
                "rounded-lg bg-[#FF6A00] text-white hover:bg-[#cc5500] transition-all shadow-md min-w-[160px]",
                "disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed disabled:shadow-none"
              )}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </span>
              ) : (
                "Submit & Continue"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, htmlFor, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-gray-800">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default PreAssessmentOnboardingModal;
