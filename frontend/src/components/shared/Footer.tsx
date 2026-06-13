/**
 * Marketing footer, shared by the landing page and the /pricing, /faq and
 * /contact pages.
 */
import { Link } from "react-router-dom";

import { Logo } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";

const HAIRLINE = "border-white/[0.08]";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090A]";

const FOOTER_LINKS = [
  { label: "How it works", to: "/#how" },
  { label: "Pricing", to: "/pricing" },
  { label: "FAQ", to: "/faq" },
  { label: "Contact", to: "/contact" },
  { label: "Log in", to: "/login" },
  { label: "Sign up", to: "/register" },
] as const;

export function Footer() {
  return (
    <footer className={cn("border-t px-8 py-12 md:px-16", HAIRLINE)}>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            aria-label="Orvelle home"
            className={cn("rounded-sm text-white", focusRing)}
          >
            <Logo size="sm" />
          </Link>
          <span className="text-xs text-[#8A8A93]">© 2026 Orvelle</span>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[#A1A1AA]"
        >
          {FOOTER_LINKS.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className={cn("rounded-sm transition-colors hover:text-white", focusRing)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#8A8A93]">
          Made in Milton Keynes
        </span>
      </div>
    </footer>
  );
}
