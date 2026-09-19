/**
 * Turn a failed sign-in into something the user can act on.
 *
 * The login page used to read only `response.data.message`, then fall back to
 * `(err as Error).message` — which for axios is the literal string
 * "Request failed with status code 401". Every backend here actually returns
 * `{ error: "..." }`, so the useful text was sitting one key over, unread,
 * while the user was shown an HTTP status code.
 *
 * Statuses are mapped BEFORE the server's own text is used, because the raw
 * strings ("Invalid credentials") don't say what to do next, and a 401 on a
 * login form has exactly one meaning worth showing.
 */

type ErrorShape = {
  response?: {
    status?: number;
    data?: { error?: unknown; message?: unknown };
  };
  code?: string;
  message?: string;
};

const readString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** The server's own message, checking both keys the services use. */
const serverMessage = (err: unknown): string | null => {
  const data = (err as ErrorShape)?.response?.data;
  return readString(data?.error) ?? readString(data?.message);
};

/**
 * @param err  the thrown value (unknown — it may not be an Error)
 * @param mode which form failed, so the wording fits
 */
export function authErrorMessage(
  err: unknown,
  mode: "login" | "signup" = "login",
): string {
  const e = err as ErrorShape;
  const status = e?.response?.status;
  const fromServer = serverMessage(err);

  // No response at all: the request never landed. Saying "invalid credentials"
  // here would send the user off changing a password that was never checked.
  if (!e?.response) {
    if (e?.code === "ECONNABORTED") {
      return "That took too long. Check your connection and try again.";
    }
    return "Can't reach the server. Check your internet connection and try again.";
  }

  switch (status) {
    case 400:
    case 422:
      // Field-level validation — the server names the problem, so prefer it.
      return fromServer ?? "Please check the details you entered and try again.";
    case 401:
      return mode === "signup"
        ? fromServer ?? "Sign up failed. Please try again."
        : "Incorrect email or password. Please check and try again.";
    case 403:
      // Authenticated but not allowed in — e.g. no profile row, or a college
      // that has been deactivated. The server's reason is the useful part.
      return fromServer ?? "Your account doesn't have access. Please contact your administrator.";
    case 404:
      return "No account found with that email address.";
    case 409:
      return fromServer ?? "An account with that email already exists.";
    case 429:
      return "Too many attempts. Please wait a minute and try again.";
    default:
      break;
  }

  if (typeof status === "number" && status >= 500) {
    // Never show a 5xx body: it may carry internal detail, and there is nothing
    // the user can fix anyway.
    return "Something went wrong on our end. Please try again in a moment.";
  }

  return (
    fromServer ?? (mode === "signup" ? "Sign up failed. Please try again." : "Login failed. Please try again.")
  );
}

/**
 * Which input to highlight, when the status implies one. A 401 on a login form
 * is not attributable to a single field (the server deliberately doesn't say
 * which half was wrong), so it returns null rather than blaming a guess.
 */
export function authErrorField(err: unknown): "email" | "password" | null {
  const status = (err as ErrorShape)?.response?.status;
  if (status === 404) return "email";
  const msg = serverMessage(err)?.toLowerCase() ?? "";
  if (status === 422 || status === 400) {
    if (msg.includes("email")) return "email";
    if (msg.includes("password")) return "password";
  }
  return null;
}
