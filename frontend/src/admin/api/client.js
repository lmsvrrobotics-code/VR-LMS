import axios from 'axios';

// admin-service direct (port 4000). Used for both API calls and static asset
// URLs (uploaded images served by express.static).
const BASE = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:5000';
export const API_BASE = BASE;
const TOKEN_KEY = 'admin_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({
    baseURL: `${BASE}/api/admin`,
    timeout: 30000,
});

api.interceptors.request.use((config) => {
    // Admins authenticate against admin-service and store an 'admin_token'.
    // Teachers have no admin-service login — they reach the admin shell
    // (course management only) with their auth-service 'accessToken'. Both
    // services sign JWTs with the same JWT_SECRET, so admin-service's `auth`
    // middleware verifies either token. Fall back to accessToken so the
    // teacher flow works regardless of which key holds the token.
    const token = getToken() || localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// /auth/me is called speculatively during app hydration to detect whether
// an admin token is still valid. A 401 there is expected when the token has
// expired or was never set — it must NOT trigger a hard redirect, because
// AuthProvider/ProtectedRoute will already route the user to /login via
// React Router. Hard-redirecting on top of that caused the whole-app blink.
const SILENT_AUTH_PATHS = ['/auth/me'];

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status;
        const url = error?.config?.url || '';

        // 401 handling. Previously this cleared the token + hard-redirected on
        // EVERY 401 — which logged the admin out whenever a single dashboard
        // widget's endpoint returned 401 (service down, etc.), producing the
        // post-login "dashboard then bounce to /login" loop.
        //
        // New rule: only treat a 401 as real session-death when it's the
        // auth-check probe (/auth/me) OR no token exists at all. A 401 from any
        // other endpoint keeps the session intact and is left for the calling
        // component to handle (same spirit as the 403 branch below).
        if (status === 401) {
            const isAuthProbe = SILENT_AUTH_PATHS.some((p) => url.includes(p));
            const hasToken = Boolean(getToken() || localStorage.getItem('accessToken'));

            // A 401 on /auth/login is EXPECTED, not a failure: loginUser tries
            // admin-service first (admin precedence), so every student/teacher
            // login 401s here before succeeding against auth-service. Stay
            // silent so it doesn't look like an error in the console.
            const isLoginProbe = url.includes('/auth/login');

            if (isLoginProbe) {
                clearToken();
            } else if (isAuthProbe || !hasToken) {
                clearToken();
                // Don't hard-redirect — AuthProvider / ProtectedRoute route the
                // logged-out user to /login via React Router. Hard redirects
                // here stacked on top of that and caused whole-app reload blinks.
                console.warn(`[admin api] 401 on ${url} — session ended, token cleared`);
            } else {
                console.warn(`[admin api] 401 on ${url} — kept session (single endpoint failed)`);
            }
            return Promise.reject(error);
        }

        // 403 = authenticated but not permitted for THIS endpoint. The token is
        // still valid — do NOT clear it or redirect. This is normal for an
        // teacher whose restricted role can't reach an admin-only endpoint;
        // the calling component decides how to handle it (e.g. empty dropdown).
        if (status === 403) {
            console.warn(`[admin api] 403 on ${url} — not permitted for this role (token kept)`);
            return Promise.reject(error);
        }

        // Surface the server's error BODY, not just the status line. Validation
        // failures (400) come back as { error, details: [{ field, message }] };
        // logging only error.message reduced that to a bare "Request failed with
        // status code 400" and hid which field was actually rejected — a real bug
        // took far longer to find than it should have. Keep the detail visible
        // and attach a readable summary so callers can toast something useful.
        const data = error?.response?.data;
        if (Array.isArray(data?.details) && data.details.length) {
            const summary = data.details
                .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
                .join('; ');
            error.fieldErrors = data.details;
            error.uiMessage = summary;
            console.error(`[admin api] ${status} on ${url} — ${data.error || 'error'}: ${summary}`);
        } else if (data?.error || data?.message) {
            error.uiMessage = data.error || data.message;
            console.error(`[admin api] ${status} on ${url}:`, error.uiMessage);
        } else if (error?.message) {
            console.error(`[admin api] error on ${url}:`, error.message);
        }
        return Promise.reject(error);
    }
);

export default api;
