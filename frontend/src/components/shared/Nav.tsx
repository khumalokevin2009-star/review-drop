/**
 * Marketing nav, shared by the landing page and the /pricing, /faq and
 * /contact pages. Sticky with backdrop blur on scroll; centre links on
 * desktop, hamburger dropdown below md. Matches the landing design language
 * (dark #08090A, hairlines, indigo focus rings only).
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { Logo } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";

const HAIRLINE = "border-white/[0.08]";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090A]";

const MotionLink = motion(Link);

const pressProps = {
  whileTap: { scale: 0.97 },
  whileHover: { y: -1 },
  transition: { type: "spring", stiffness: 600, damping: 30 } as const,
} as const;

const NAV_LINKS = [
  { label: "How it works", to: "/#how" },
  { label: "Pricing", to: "/pricing" },
  { label: "FAQ", to: "/faq" },
  { label: "Contact", to: "/contact" },
] as const;

function navLinkClass(active: boolean) {
  return cn(
    "rounded-full px-3 py-2 text-sm transition-colors duration-200 hover:text-white",
    active ? "text-white" : "text-[#A1A1AA]",
    focusRing,
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on any route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        HAIRLINE,
        scrolled || open ? "bg-[#08090A]/85 backdrop-blur-md" : "bg-transparent",
      )}
    >
      <nav className="relative flex h-16 items-center justify-between px-6 md:px-10">
        <Link
          to="/"
          aria-label="Orvelle home"
          className={cn("rounded-sm text-white", focusRing)}
        >
          <Logo size="md" />
        </Link>

        {/* centre links — desktop */}
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {NAV_LINKS.map(({ label, to }) => (
            <Link key={to} to={to} className={navLinkClass(pathname === to)}>
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link to="/login" className={cn(navLinkClass(false), "hidden sm:block")}>
            Log in
          </Link>
          <MotionLink
            to="/register"
            {...pressProps}
            className={cn(
              "inline-flex h-8 touch-manipulation items-center rounded-full bg-white px-4 text-sm font-medium text-black transition-[background-color,filter] duration-150 hover:bg-[#E4E4E7] active:brightness-90 active:[box-shadow:inset_0_1px_4px_rgba(0,0,0,0.3)]",
              focusRing,
            )}
          >
            Sign up
          </MotionLink>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-[#A1A1AA] transition-colors hover:text-white md:hidden",
              focusRing,
            )}
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {/* mobile dropdown */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn("border-t md:hidden", HAIRLINE)}
          >
            <div className="flex flex-col px-6 py-4">
              {NAV_LINKS.map(({ label, to }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-sm py-3 text-base transition-colors hover:text-white",
                    pathname === to ? "text-white" : "text-[#A1A1AA]",
                    focusRing,
                  )}
                >
                  {label}
                </Link>
              ))}
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-sm py-3 text-base text-[#A1A1AA] transition-colors hover:text-white sm:hidden",
                  focusRing,
                )}
              >
                Log in
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
