import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getLandingRoute, UNKNOWN_ROLE_HOME } from "@/lib/roleRouting";

/**
 * Resolves the `/dashboard` alias to the signed-in user's REAL dashboard.
 *
 * `/dashboard` is navigated to from ~7 places (post-signup, pre/post-assessment,
 * program pages) as a generic "send them home" target. It used to be a static
 * `<Navigate to="/courses/browse">` — the PUBLIC course catalog — so a student
 * who signed up or finished an assessment landed on the marketing site rather
 * than their dashboard, with no indication anything was wrong.
 *
 * Role resolution is asynchronous: on a fresh page load AuthProvider has to
 * hydrate the profile before `user.role` exists. Redirecting during that window
 * would send everyone to the logged-out destination, so this waits for the auth
 * probe to settle first. Unknown/absent role falls back to /auth, matching
 * getLandingRoute's fail-closed contract — never a silent downgrade to the
 * student site.
 */
const DashboardRedirect = () => {
  const { user, loading, checkAuth } = useAuth();
  const [checked, setChecked] = useState(false);

  // Only an actual token justifies waiting for a profile probe.
  const hasToken =
    typeof window !== "undefined" &&
    Boolean(localStorage.getItem("accessToken") || localStorage.getItem("admin_token"));

  useEffect(() => {
    if (!hasToken) { setChecked(true); return; }
    if (user || loading) return;
    (async () => {
      try { await checkAuth(); } finally { setChecked(true); }
    })();
    // checkAuth is recreated on every AuthProvider render — including it here
    // would loop. Same pattern as ProtectedRoute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken, user, loading]);

  // No token → not signed in. Send them to the auth screen rather than
  // pretending they have a dashboard.
  if (!hasToken) return <Navigate to={UNKNOWN_ROLE_HOME} replace />;

  if (loading || (!checked && !user)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="ml-2">Loading your dashboard…</span>
      </div>
    );
  }

  return <Navigate to={getLandingRoute(user?.role)} replace />;
};

export default DashboardRedirect;
