// context/AuthProvider.tsx
import { useEffect, useState, ReactNode } from "react";
import { login, register, getProfile, logout } from "../api/authApi";
import { login as adminLogin, me as adminMe } from "../admin/api/auth";
import { getToken as getAdminToken } from "../admin/api/client";
import { AuthContext } from "./AuthContext";

// Profile responses come back with different id field names depending on the
// backend (auth-service uses userId, others use id or _id). Pick whichever exists.
const extractUserId = (profile: any): string | number | null =>
  profile?.userId ?? profile?.user_id ?? profile?.id ?? profile?._id ?? null;

// admin-service /auth/me wraps the user as { user: {...} }, while the legacy
// /auth/login on some paths returns the user fields at the top level. Accept
// either shape so the College Admin's college_id flows into AuthContext (and
// from there into ProtectedRoute / AdminLayout) regardless of which call
// hydrated the profile. Without this unwrap, school admins created by root
// were getting collegeId: null and never landing on the School Dashboard.
const normalizeAdminProfile = (raw: any) => {
  const data = raw?.user ?? raw ?? {};
  return {
    userId: String(data.userId ?? data.id ?? data._id ?? ""),
    email: data.email ?? "",
    name: data.name ?? "",
    phone: data.phone ?? "",
    dob: data.dob ?? "",
    gender: data.gender ?? "",
    role: data.role ?? "admin",
    collegeId: data.college_id ?? null,
    orgId: data.org_id ?? null,
    branchId: data.branch_id ?? null,
    yearOfEducation: data.yearOfEducation ?? data.year_of_education ?? undefined,
    yearOfStudy: data.yearOfStudy ?? data.year_of_study ?? undefined,
    programInterested: data.programInterested ?? data.program_interested ?? undefined,
  };
};

interface User {
  userId: string;
  id?: string;
  email: string;
  name: string;
  phone: string;
  dob: string;
  gender: string;
  role: string | null;
  collegeId?: string;
  orgId?: string;
  branchId?: string;
  yearOfEducation?: string;
  yearOfStudy?: number;
  programInterested?: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  dob?: string;
  gender?: string;
  role?: string;
  // === Academic Information (all optional) ===
  educationLevel?: string;
  branch?: string;
  collegeName?: string;
  graduationYear?: string;
  collegeCode?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginUser: (credentials: LoginCredentials) => Promise<User>;
  registerUser: (data: RegisterData) => Promise<void>;
  logoutUser: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  // Hydrate from a saved token on app load.
  useEffect(() => {
    let cancelled = false;

    const hasAuthToken =
      typeof window !== "undefined" && (Boolean(localStorage.getItem("accessToken")) || Boolean(localStorage.getItem("admin_token")));
    const hasAdminToken = Boolean(getAdminToken());

    // Logged-out visitors have no tokens — skip the profile probe entirely.
    // Otherwise we'd fire a guaranteed-401 GET /auth/profile on every public
    // page load, which the browser logs as a (harmless but noisy) console
    // error. With no token there's nothing to hydrate: render the public site.
    if (!hasAuthToken && !hasAdminToken) return;

    setLoading(true);
    (async () => {
      try {
        // Only probe auth-service when we actually hold an auth-service token.
        // When only an admin token exists, fall straight through to adminMe()
        // instead of provoking a 401 from /auth/profile.
        try {
          if (hasAuthToken) {
            const res = await getProfile();
            if (cancelled) return;
            setUser(res.data);
            const idForStorage = extractUserId(res.data);
            if (idForStorage) localStorage.setItem("userId", String(idForStorage));
            return;
          }
        } catch {
          /* auth-service token invalid/expired — try the admin path below */
        }

        if (!getAdminToken()) return;
        try {
          const res = await adminMe();
          if (cancelled) return;
          const profile = normalizeAdminProfile(res);
          setUser(profile);
          const idForStorage = extractUserId(profile);
          if (idForStorage) localStorage.setItem("userId", String(idForStorage));
          // Store the unwrapped user (not the {user: ...} envelope) — that's
          // the shape AdminLayout's getStoredUser() reads to decide whether to
          // show the college-admin sidebar.
          localStorage.setItem("admin_user", JSON.stringify(res?.user ?? res));
        } catch {
          /* not logged in — fine, render the public site */
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual auth check - only call this when needed
  const checkAuth = async () => {
    try {
      setLoading(true);

      // If an admin token is present (set by adminLogin), hydrate the admin
      // session FIRST. This must take priority over the auth-service profile
      // probe so that landing on /admin after login resolves to the admin user
      // (role 'admin') rather than a leftover student/teacher session — which
      // would make the /admin guard bounce the admin to /dashboard.
      if (getAdminToken()) {
        try {
          const res = await adminMe();
          const profile = normalizeAdminProfile(res);
          setUser(profile);
          const idForStorage = extractUserId(profile);
          if (idForStorage) localStorage.setItem("userId", String(idForStorage));
          // Store the unwrapped user (not the {user: ...} envelope) — that's
          // the shape AdminLayout's getStoredUser() reads to decide whether to
          // show the college-admin sidebar.
          localStorage.setItem("admin_user", JSON.stringify(res?.user ?? res));
          return;
        } catch {
          // admin token invalid/expired — fall through to the auth-service probe
        }
      }

      const res = await getProfile();
      setUser(res.data);
      const idForStorage = extractUserId(res.data);
      if (idForStorage) localStorage.setItem("userId", String(idForStorage));
      return;
    } catch (err: unknown) {
      if (getAdminToken()) {
        try {
          const res = await adminMe();
          const profile = normalizeAdminProfile(res);
          setUser(profile);
          const idForStorage = extractUserId(profile);
          if (idForStorage) localStorage.setItem("userId", String(idForStorage));
          localStorage.setItem("admin_user", JSON.stringify(res?.user ?? res));
          return;
        } catch {
          // swallow and fall through to clear user
        }
      }

      // Silently handle 401 - normal when not logged in
      interface ErrorWithResponse {
        response?: {
          status?: number;
        };
      }

      if (
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        typeof (err as ErrorWithResponse).response?.status === "number" &&
        (err as ErrorWithResponse).response?.status !== 401
      ) {
        console.error("Auth check failed:", err);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const loginUser = async (credentials: LoginCredentials) => {
    try {
      setLoading(true);

      // Admin accounts take PRECEDENCE. Try admin-service login first so a set
      // of admin credentials always resolves to the admin UI — even when a
      // student/teacher account happens to share the same email in
      // auth-service (which, since auth-service was tried first, used to hijack
      // the admin to the student/teacher dashboard). admin-service returns 401
      // for any email that isn't an admin, so non-admins fall straight through
      // to the normal auth-service login below.
      try {
        const bridge = await adminLogin(credentials.email, credentials.password);
        const profile = normalizeAdminProfile(bridge.user);
        // Clear any stale auth-service (student/teacher) tokens so that after a
        // full reload into /admin, hydration skips the auth-service profile
        // probe and hydrates the admin via adminMe() using admin_token. Without
        // this, a leftover accessToken could resolve to a non-admin user and the
        // /admin guard would bounce the admin out to /dashboard.
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        setUser(profile);
        const idForStorage = extractUserId(profile);
        if (idForStorage) localStorage.setItem("userId", String(idForStorage));
        return profile;
      } catch {
        // Not an admin account — proceed with the normal student/teacher login.
      }

      const loginRes = await login(credentials);

      // Clear any stale admin token from a previous admin session in this
      // browser. The shared admin api client uses `admin_token || accessToken`,
      // so a leftover admin_token would be sent on teacher pages (e.g. My
      // Courses) instead of this teacher's accessToken and rejected as
      // "Invalid token".
      localStorage.removeItem("admin_token");

      // Persist the access token so axiosInstance's request interceptor can
      // attach it as a Bearer header on subsequent calls. Without this, only
      // the httpOnly cookie carries auth — which works for auth-service but
      // fails for cross-service routes (e.g. college-service /college/all)
      // where Bastion-forwarded cookies don't make it through, producing 401s
      // for the dropdowns on the profile page.
      const accessToken = loginRes.data?.accessToken;
      if (accessToken) localStorage.setItem("accessToken", accessToken);
      const refreshToken = loginRes.data?.refreshToken;
      if (refreshToken) localStorage.setItem("refreshToken", refreshToken);

      // After auth-service login, fetch full profile
      const profileRes = await getProfile();
      const profile = profileRes.data as User;
      setUser(profile);
      const idForStorage = extractUserId(profile);
      if (idForStorage) localStorage.setItem("userId", String(idForStorage));
      return profile;
    } catch (err: unknown) {
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (data: RegisterData) => {
    try {
      setLoading(true);
      const res = await register(data);
      
      if (!res.data?.user) {
        throw new Error("Registration failed: user data missing");
      }
      
      setUser(res.data.user);
    } catch (err) {
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logoutUser = async () => {
    try {
      setLoading(true);
      await logout();
    } finally {
      setUser(null);
      localStorage.removeItem("userId");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("admin_token");
      setLoading(false);
    }
  };

  const contextValue: AuthContextType = {
    user,
    loading,
    loginUser,
    registerUser,
    logoutUser,
    checkAuth
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};