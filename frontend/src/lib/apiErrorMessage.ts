/**
 * Pull a human-readable message out of an axios-style error.
 *
 * Extracted from the inline expression in RegisterForm so the precedence rules
 * are unit-testable. The backends are not consistent about which field carries
 * the message — admin-service returns `{ error }`, auth-service returns
 * `{ message }` for some paths and `{ error }` for others — so both are checked
 * before falling back.
 *
 * @param err      the thrown value (unknown: it may not be an Error at all)
 * @param fallback message to use when the error carries nothing readable
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
    const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })
        ?.response?.data;

    // Only accept non-empty strings. A backend that returns `{ error: {} }` or
    // `{ message: null }` must fall through to the caller's fallback rather
    // than rendering "[object Object]" or "null" to the user.
    if (typeof data?.error === 'string' && data.error.trim() !== '') return data.error;
    if (typeof data?.message === 'string' && data.message.trim() !== '') return data.message;

    return fallback;
}
