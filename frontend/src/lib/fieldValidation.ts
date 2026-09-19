/**
 * Client-side field validation, mirroring backend/admin-service/src/lib/
 * fieldValidation.js so a user sees the same wording whichever side catches the
 * mistake.
 *
 * This runs so a typo is caught as the user leaves the box, instead of after a
 * round trip that returns a page-level banner. The server still validates
 * everything — this layer is for speed and clarity, never for trust.
 */

// Matches the backend regex. Not RFC 5322: it accepts what mail providers
// accept and rejects what users actually mistype.
const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

const PHONE_RE = /^[6-9]\d{9}$/;

const asString = (v: unknown) => String(v ?? "").trim();

/** null = valid. A string = the message to show under the input. */
export type FieldError = string | null;

export const validateEmail = (
  raw: unknown,
  { label = "Email address", required = true } = {},
): FieldError => {
  const value = asString(raw);
  if (!value) return required ? `${label} is required.` : null;
  if (/\s/.test(value)) return `${label} cannot contain spaces.`;
  if (!value.includes("@")) {
    return `${label} must include an @ sign — for example name@example.com.`;
  }
  const at = value.lastIndexOf("@");
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local) return `${label} is missing the part before the @ sign.`;
  if (!domain) {
    return `${label} is missing the part after the @ sign — for example name@example.com.`;
  }
  if (!domain.includes(".")) {
    return `${label} must include a domain ending such as .com or .in.`;
  }
  if (value.includes("..")) return `${label} cannot contain two dots in a row.`;
  if (!EMAIL_RE.test(value)) {
    return `${label} doesn't look like a valid email — for example name@example.com.`;
  }
  if (value.length > 254) return `${label} is too long.`;
  return null;
};

export const validateName = (
  raw: unknown,
  { label = "Full name", min = 2, max = 100 } = {},
): FieldError => {
  const value = asString(raw);
  if (!value) return `${label} is required.`;
  if (value.length < min) return `${label} must be at least ${min} characters.`;
  if (value.length > max) return `${label} must be ${max} characters or fewer.`;
  if (/\d/.test(value)) return `${label} cannot contain numbers.`;
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u.test(value)) {
    return `${label} can only contain letters, spaces, hyphens and apostrophes.`;
  }
  return null;
};

export const validatePassword = (
  raw: unknown,
  { label = "Password", min = 8 } = {},
): FieldError => {
  const value = String(raw ?? "");
  if (!value) return `${label} is required.`;
  if (value.length < min) return `${label} must be at least ${min} characters.`;
  if (value.length > 128) return `${label} must be 128 characters or fewer.`;
  if (!/[A-Za-z]/.test(value)) return `${label} must include at least one letter.`;
  if (!/\d/.test(value)) return `${label} must include at least one number.`;
  return null;
};

export const validatePhone = (
  raw: unknown,
  { label = "Mobile number", required = true } = {},
): FieldError => {
  const value = asString(raw);
  if (!value) return required ? `${label} is required.` : null;
  let digits = value.replace(/[\s()-]/g, "");
  digits = digits.replace(/^\+?91/, "").replace(/^0+/, "");
  if (!/^\d+$/.test(digits)) return `${label} can only contain digits.`;
  if (digits.length !== 10) return `${label} must be exactly 10 digits.`;
  if (!PHONE_RE.test(digits)) return `${label} must start with 6, 7, 8 or 9.`;
  return null;
};

/** Confirm-password match, phrased as the user's problem not the diff. */
export const validateConfirm = (
  password: unknown,
  confirm: unknown,
  { label = "Passwords" } = {},
): FieldError => {
  if (!String(confirm ?? "")) return "Please re-enter your password.";
  return String(password ?? "") === String(confirm ?? "")
    ? null
    : `${label} do not match.`;
};

/**
 * Which input did the server blame? The API returns `field` alongside `error`
 * on 4xx validation failures, so the form can attach the message to that box
 * instead of only showing a banner.
 */
export const errorField = (err: unknown): string | null => {
  const data = (err as { response?: { data?: { field?: unknown } } })?.response?.data;
  return typeof data?.field === "string" && data.field ? data.field : null;
};
