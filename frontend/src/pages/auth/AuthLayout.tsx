/**
 * Shared auth-page shell in the landing page's design language: dark #08090A,
 * hairline rules, Geist type, indigo reserved for the logo dot, the pin motif
 * and focus rings. Split layout — branded panel left (hidden below lg), form
 * column right.
 *
 * Also exports the dark form primitives (AuthInput / AuthLabel / AuthButton)
 * used by Login, Register and ForgotPassword, so the pages keep their logic
 * and only swap visuals.
 */
import { motion } from "framer-motion";
import { forwardRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Logo } from "@/components/shared/Logo";
import { API_BASE_URL } from "@/lib/auth";
import { cn } from "@/lib/utils";

const HAIRLINE = "border-white/[0.08]";

export const authFocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090A]";

// ---------------------------------------------------------------------------
// Dark form primitives
// ---------------------------------------------------------------------------

export const AuthInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function AuthInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-[#52525B]",
        "transition-colors duration-150 hover:border-white/20",
        authFocusRing,
        className,
      )}
      {...props}
    />
  );
});

export function AuthLabel({
  className,
  children,
  htmlFor,
}: {
  className?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-sm font-medium text-white", className)}
    >
      {children}
    </label>
  );
}

/** White pill submit with the tactile press state (kept under reduced motion —
 * it is direct interaction feedback, not decoration). */
export function AuthButton({
  type = "button",
  disabled,
  className,
  children,
}: {
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={cn(
        "inline-flex h-11 w-full touch-manipulation items-center justify-center rounded-full bg-white text-sm font-medium text-black",
        "transition-[background-color,filter] duration-150 hover:bg-[#E4E4E7] active:brightness-90 active:[box-shadow:inset_0_2px_6px_rgba(0,0,0,0.35)]",
        "disabled:pointer-events-none disabled:opacity-60",
        authFocusRing,
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/** Official multi-colour Google "G" mark (per Google's branding guidelines —
 * the logo is never recoloured). */
function GoogleGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** "Continue with Google" — a top-level navigation to the backend's OAuth
 * entrypoint (NOT an SPA route), styled as a secondary action against the
 * white primary submit, with the same tactile press. */
export function GoogleAuthButton({
  label = "Continue with Google",
}: {
  label?: string;
}) {
  return (
    <motion.a
      href={`${API_BASE_URL}/auth/google/login`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={cn(
        "inline-flex h-11 w-full touch-manipulation items-center justify-center gap-3 rounded-full",
        "border border-white/15 bg-white/[0.03] text-sm font-medium text-white",
        "transition-colors duration-150 hover:bg-white/[0.06]",
        authFocusRing,
      )}
    >
      <GoogleGlyph />
      {label}
    </motion.a>
  );
}

/** "or" divider between the Google button and the email/password form. */
export function AuthDivider({ children = "or" }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className={cn("h-px flex-1", "bg-white/[0.08]")} />
      <span className="text-xs uppercase tracking-wider text-[#52525B]">
        {children}
      </span>
      <span className={cn("h-px flex-1", "bg-white/[0.08]")} />
    </div>
  );
}

/** Inline text link on dark — used for "Sign up", "Back to login", etc. */
export function AuthTextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "rounded-sm font-medium text-white underline decoration-white/30 underline-offset-4 transition-colors duration-150 hover:decoration-white",
        authFocusRing,
      )}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Branded panel vignette — a tiny static echo of the review canvas
// ---------------------------------------------------------------------------

function PanelVignette() {
  return (
    <div aria-hidden="true" className="relative h-44 w-full max-w-sm">
      {/* mini page */}
      <div className="absolute inset-x-0 bottom-0 top-4 rounded-t-lg border border-b-0 border-white/10 bg-[#0C0D0F] p-4">
        <div className="h-2 w-1/4 rounded-sm bg-white/10" />
        <div className="mt-2.5 h-2 w-2/5 rounded-sm bg-white/[0.06]" />
        <div className="mt-4 h-16 rounded-md border border-white/[0.09]" />
      </div>
      {/* pin + comment card */}
      <div className="absolute left-[30%] top-[55%] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#6366F1] text-[10px] font-semibold leading-none text-white">
        1
      </div>
      <div className="absolute left-[38%] top-[44%] rounded-md border border-white/10 bg-[#101113] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
        <p className="text-[11px] leading-tight text-white/90">
          Can the logo be bigger?
        </p>
        <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.15em] text-[#71717A]">
          Sarah · Client
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-[#08090A] font-sans text-white antialiased selection:bg-white/20 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* branded panel */}
      <aside
        className={cn(
          "hidden flex-col justify-between border-r p-10 lg:flex",
          HAIRLINE,
        )}
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <Link
          to="/"
          aria-label="Orvelle home"
          className={cn("self-start rounded-sm", authFocusRing)}
        >
          <Logo size="md" />
        </Link>

        <div className="max-w-md">
          <PanelVignette />
          <p className="mt-12 text-[clamp(1.5rem,2vw,1.875rem)] font-medium leading-snug tracking-tight">
            <span className="text-white">
              Feedback that lands on the page
              <span aria-hidden="true" className="text-[#6366F1]">
                .
              </span>
            </span>{" "}
            <span className="text-[#A1A1AA]">
              Share a link. Your client clicks anywhere. Done.
            </span>
          </p>
        </div>

        <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#71717A]">
          Client feedback, pinned to the pixel
        </span>
      </aside>

      {/* form column */}
      <main className="flex min-h-screen items-center justify-center px-6 py-12 lg:min-h-0">
        <div className="w-full max-w-sm">
          <Link
            to="/"
            aria-label="Orvelle home"
            className={cn(
              "mb-10 inline-block rounded-sm lg:hidden",
              authFocusRing,
            )}
          >
            <Logo size="md" />
          </Link>
          <h1 className="text-2xl font-medium tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-[#A1A1AA]">{description}</p>
          <div className="mt-8">{children}</div>
          {footer ? (
            <div
              className={cn(
                "mt-8 border-t pt-6 text-sm text-[#A1A1AA]",
                HAIRLINE,
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
