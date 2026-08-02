// import { ReactNode } from 'react';
// import { Navigate } from 'react-router-dom';
// import { useAuth } from '@/hooks/useAuth';

// interface ProtectedRouteProps {
//   children: ReactNode;
// }

// const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
//   const { user, loading } = useAuth();

//   console.log('ProtectedRoute - User:', user, 'Loading:', loading);

//   if (loading) {
//     console.log('ProtectedRoute - Showing loading spinner');
//     return (
//       <div className="flex items-center justify-center min-h-screen">
//         <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
//       </div>
//     );
//   }

//   if (!user) {
//     console.log('ProtectedRoute - No user, redirecting to login');
//     return <Navigate to="/login" replace />;
//   }

//   console.log('ProtectedRoute - User authenticated, rendering children');
//   return <>{children}</>;
// };

// export default ProtectedRoute;
// components/ProtectedRoute.tsx

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useLocation } from 'react-router-dom';
import { getDeniedRedirect, roleSatisfies, UNKNOWN_ROLE_HOME } from '@/lib/roleRouting';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string | string[];
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, loading, checkAuth } = useAuth();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const location = useLocation();

  // Hard gate: a protected page requires an actual auth token. Without one the
  // visitor is logged out — period. This must not depend on a backend probe
  // (a misbehaving/200 auth endpoint must never be able to leak gated content).
  // Check for both accessToken (student/teacher) and admin_token (admin).
  const hasToken =
    typeof window !== "undefined" &&
    Boolean(localStorage.getItem("accessToken") || localStorage.getItem("admin_token"));

  useEffect(() => {
    if (!hasToken) return; // no token → don't even probe
    if (hasCheckedAuth || user || loading) return;
    (async () => {
      try { await checkAuth(); } finally { setHasCheckedAuth(true); }
    })();
    // checkAuth intentionally omitted: AuthProvider recreates it on every
    // render, so including it would cause an infinite re-render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken, hasCheckedAuth, user, loading]);

  // No token = definitely not logged in → bounce to the auth screen.
  if (!hasToken) {
    return <Navigate to="/auth" replace />;
  }

  if (loading || (!hasCheckedAuth && !user)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span className="ml-2">Checking authentication...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (requiredRole) {
    // roleSatisfies normalises both sides (so 'root' satisfies an 'admin'
    // requirement) and returns false for an absent/unknown role.
    if (!roleSatisfies(user.role, requiredRole)) {
      // Send them to THEIR OWN dashboard, not a hard-coded route. This used to
      // be `/dashboard`, which redirects to /courses/browse — i.e. a teacher
      // who touched an admin-only page was silently dropped into the student
      // site. getDeniedRedirect resolves to /auth when the role is unknown.
      const destination = getDeniedRedirect(user.role);
      // Safety net: if a user's own home is itself gated against them (a
      // misconfigured route), redirecting there would ping-pong forever.
      // Break the cycle by falling back to the auth screen.
      const target =
        destination === location.pathname ? UNKNOWN_ROLE_HOME : destination;
      return <Navigate to={target} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;