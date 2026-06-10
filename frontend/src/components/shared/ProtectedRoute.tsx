import { Navigate, Outlet, useLocation } from "react-router-dom";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useAuth } from "@/hooks/useAuth";

/**
 * Route guard: requires a valid session (refresh token present and
 * /auth/me resolving). Redirects to /login, preserving the intended
 * destination so login can bounce back.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate to="/login" state={{ from: location.pathname }} replace />
    );
  }

  return <Outlet />;
}
