/**
 * OAuthCallback — the landing route the backend redirects to after a successful
 * Google sign-in (CLAUDE.md Section 8). The backend hands our standard JWT pair
 * in the URL FRAGMENT (never sent to a server / not logged); we store them the
 * same way password login does, scrub the fragment, refetch /auth/me and route
 * into the app. Missing tokens → back to login with an error.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ME_QUERY_KEY } from "@/hooks/useAuth";
import { setTokens } from "@/lib/auth";

export default function OAuthCallback() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Run the token handoff EXACTLY once. React StrictMode invokes effects twice
  // in dev; the first run scrubs the token fragment, so a second run would see
  // no tokens and wrongly bounce to /login. The ref persists across StrictMode's
  // double-invoke (same component instance), so the second run no-ops.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const params = new URLSearchParams(fragment);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      navigate("/login?error=failed", { replace: true });
      return;
    }

    setTokens({ access_token: accessToken, refresh_token: refreshToken });
    // Scrub the tokens out of the URL/history before navigating on.
    window.history.replaceState(null, "", window.location.pathname);
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    navigate("/dashboard", { replace: true });
  }, [navigate, queryClient]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08090A]">
      <LoadingSpinner />
    </div>
  );
}
