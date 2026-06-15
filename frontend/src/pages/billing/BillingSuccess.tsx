/**
 * /billing/success — where Stripe Checkout redirects after a successful
 * subscription. The webhook flips the plan to Pro server-side; we refetch the
 * user so the app reflects it immediately, then point them at the dashboard.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { ME_QUERY_KEY } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { MonoLabel, PageDepth, pillWhite } from "@/pages/landing/ui";

export default function BillingSuccess() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Refresh /auth/me so the new Pro plan shows without a manual reload.
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [queryClient]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08090A] px-6 font-sans text-white antialiased">
      <PageDepth />
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#6366F1]/40 bg-[#6366F1]/10">
          <Check className="h-5 w-5 text-[#818CF8]" aria-hidden="true" />
        </span>
        <div className="mt-6">
          <MonoLabel>Welcome to Pro</MonoLabel>
        </div>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">
          Your free trial has started
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
          You&apos;re on Orvelle Pro — unlimited projects and review links, PDF
          &amp; CSV export, and no watermark. Your card won&apos;t be charged
          until the 30-day trial ends, and you can cancel any time from Settings.
        </p>
        <Link to="/dashboard" className={cn("mt-8 w-full", pillWhite)}>
          Go to your dashboard
        </Link>
      </div>
    </div>
  );
}
