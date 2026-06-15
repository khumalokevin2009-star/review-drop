/**
 * /billing/cancel — where Stripe Checkout redirects if the user backs out.
 * Nothing was charged; reassure and offer the two natural next steps.
 */
import { Link } from "react-router-dom";

import { MonoLabel, PageDepth, pillGhost, pillWhite } from "@/pages/landing/ui";

export default function BillingCancel() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08090A] px-6 font-sans text-white antialiased">
      <PageDepth />
      <div className="w-full max-w-md text-center">
        <MonoLabel>Checkout cancelled</MonoLabel>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">No worries</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#A1A1AA]">
          Your card wasn&apos;t charged and nothing changed on your account. You
          can start your 30-day free trial whenever a client project needs Pro.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/dashboard" className={pillWhite}>
            Back to dashboard
          </Link>
          <Link to="/pricing" className={pillGhost}>
            See pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
