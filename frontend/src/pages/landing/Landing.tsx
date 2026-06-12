/**
 * Marketing landing page — Vercel/Linear-style dark editorial design.
 *
 * Design language (intentionally overrides Section 10 for this page only):
 * near-black #08090A, a max-w-[1100px] "graph paper" frame with hairline
 * rules, monochrome type (white / #A1A1AA / #52525B), Geist + Geist Mono.
 * Indigo #6366F1 appears ONLY as the logo dot, pin markers inside product
 * visuals, the highlighted pricing border, and focus rings.
 */
import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { ArrowRight } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { Logo } from "@/components/shared/Logo";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

import {
  FigClickAnywhere,
  FigSelectRegion,
  FigTrackResolved,
  GlyphAnySite,
  GlyphExport,
  GlyphNoLogin,
  GlyphRegion,
  GlyphScreenshot,
  GlyphStatus,
} from "./figures";

// The ambient demo carries its own animation machinery — lazy-mount it after
// first paint so the hero text renders instantly.
const HeroDemo = lazy(() => import("./HeroDemo"));

// ---------------------------------------------------------------------------
// Motion primitives
// ---------------------------------------------------------------------------

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const VIEWPORT = { once: true, amount: 0.2 } as const;

/** Single scroll reveal: opacity 0→1, y 12→0. Static under reduced motion. */
function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={revealVariants}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      {children}
    </motion.div>
  );
}

/** Orchestrates child <RevealItem>s with a 0.08s stagger. */
function RevealGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  );
}

function RevealItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={revealVariants}>
      {children}
    </motion.div>
  );
}

/** Hero headline with per-word stagger on load. */
function StaggerHeadline({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <h1 className={className}>{text}</h1>;
  const words = text.split(" ");
  return (
    <motion.h1
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
    >
      {words.map((word, i) => (
        <motion.span
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className="inline-block"
          variants={{
            hidden: { opacity: 0, y: 14 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
          }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </motion.h1>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const HAIRLINE = "border-white/[0.08]";

function MonoLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-xs uppercase tracking-[0.2em] text-[#71717A]",
        className,
      )}
    >
      {children}
    </span>
  );
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090A]";

const pillWhite = cn(
  "inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition-colors duration-200 hover:bg-[#E4E4E7]",
  focusRing,
);

const pillGhost = cn(
  "inline-flex h-11 items-center justify-center rounded-full border border-white/[0.15] px-6 text-sm font-medium text-white transition-colors duration-200 hover:border-white/30 hover:bg-white/[0.04]",
  focusRing,
);

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        HAIRLINE,
        scrolled ? "bg-[#08090A]/80 backdrop-blur-md" : "bg-transparent",
      )}
    >
      <nav className="flex h-16 items-center justify-between px-6 md:px-10">
        <Link
          to="/"
          aria-label="Orvelle home"
          className={cn("rounded-sm text-white", focusRing)}
        >
          <Logo size="md" />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href="#pricing"
            className={cn(
              "rounded-full px-3 py-2 text-sm text-[#A1A1AA] transition-colors duration-200 hover:text-white",
              focusRing,
            )}
          >
            Pricing
          </a>
          <Link
            to="/login"
            className={cn(
              "rounded-full px-3 py-2 text-sm text-[#A1A1AA] transition-colors duration-200 hover:text-white",
              focusRing,
            )}
          >
            Log in
          </Link>
          <Link
            to="/register"
            className={cn(
              "inline-flex h-8 items-center rounded-full bg-white px-4 text-sm font-medium text-black transition-colors duration-200 hover:bg-[#E4E4E7]",
              focusRing,
            )}
          >
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

/** Mirrors HeroDemo's outer dimensions exactly so lazy-mounting cannot shift layout. */
function DemoPlaceholder() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0A0B0D]">
      <div className={cn("h-9 border-b", HAIRLINE)} />
      <div className="flex">
        <div className="aspect-[16/10] min-w-0 flex-1 bg-[#0C0D0F]" />
        <div className={cn("hidden w-44 shrink-0 border-l md:block", HAIRLINE)} />
      </div>
    </div>
  );
}

function Hero() {
  const reduced = useReducedMotion();
  const [demoReady, setDemoReady] = useState(false);

  // Mount the demo only after first paint.
  useEffect(() => {
    setDemoReady(true);
  }, []);

  const scrollToDemo = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById("demo")?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <section className="px-6 pb-24 pt-20 md:px-10 md:pt-28">
      <Reveal>
        <MonoLabel>Client feedback, rebuilt</MonoLabel>
      </Reveal>
      <StaggerHeadline
        text="Feedback that lands on the page."
        className="mt-6 max-w-[14ch] text-[clamp(3.5rem,8vw,6.5rem)] font-medium leading-[1.02] tracking-tight text-white"
      />
      <Reveal>
        <p className="mt-8 max-w-md text-base leading-relaxed text-[#A1A1AA]">
          Share one link. Your client clicks anywhere on their site to leave a
          comment. No accounts, no screenshots, no email chains.
        </p>
      </Reveal>
      <Reveal className="mt-10 flex flex-wrap items-center gap-4">
        <Link to="/register" className={pillWhite}>
          Start free
        </Link>
        <a href="#demo" onClick={scrollToDemo} className={pillGhost}>
          See how it works
        </a>
      </Reveal>

      {/* hero visual on a faint dot-grid panel */}
      <Reveal className="mt-20">
        <div
          id="demo"
          className={cn("border p-3 sm:p-6 md:p-10", HAIRLINE)}
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          {demoReady ? (
            <Suspense fallback={<DemoPlaceholder />}>
              <HeroDemo />
            </Suspense>
          ) : (
            <DemoPlaceholder />
          )}
        </div>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function ProofBar() {
  return (
    <section className={cn("border-t px-6 py-6 md:px-10", HAIRLINE)}>
      <Reveal className="text-center">
        <MonoLabel className="leading-relaxed">
          Built for freelancers and studios who review client sites every week
        </MonoLabel>
      </Reveal>
    </section>
  );
}

function Editorial() {
  return (
    <section className={cn("border-t px-6 py-24 md:px-10 md:py-32", HAIRLINE)}>
      <Reveal>
        <p className="max-w-4xl text-[clamp(2rem,4vw,3.25rem)] font-medium leading-[1.15] tracking-tight">
          <span className="text-white">A new way to review websites.</span>{" "}
          <span className="text-[#A1A1AA]">
            Purpose-built for client work — every comment pinned to the exact
            pixel it&rsquo;s about, every revision tracked to done.
          </span>
        </p>
      </Reveal>
    </section>
  );
}

const figures = [
  {
    label: "Fig 0.1",
    title: "Click anywhere",
    caption:
      "Your client clicks any element on the live page. The comment pins to that exact spot.",
    Figure: FigClickAnywhere,
  },
  {
    label: "Fig 0.2",
    title: "Select a region",
    caption:
      "Drag to outline an area when the feedback is about more than a single point.",
    Figure: FigSelectRegion,
  },
  {
    label: "Fig 0.3",
    title: "Track to resolved",
    caption:
      "Every thread moves open → in progress → resolved. Nothing gets lost in email.",
    Figure: FigTrackResolved,
  },
] as const;

function FigTrio() {
  return (
    <section className={cn("border-t", HAIRLINE)}>
      <RevealGroup
        className={cn(
          "grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0",
          "divide-white/[0.08]",
        )}
      >
        {figures.map(({ label, title, caption, Figure }) => (
          <RevealItem key={label} className="px-6 py-12 md:px-8 md:py-14">
            <MonoLabel>{label}</MonoLabel>
            <div className="mt-8">
              <Figure />
            </div>
            <h3 className="mt-8 text-base font-medium text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">
              {caption}
            </p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

const features = [
  {
    title: "No client logins",
    body: "Clients comment straight from the share link. No accounts, no passwords, no friction.",
    Glyph: GlyphNoLogin,
  },
  {
    title: "Works on any site",
    body: "WordPress, Webflow, Squarespace, custom builds — if it has a URL, it works.",
    Glyph: GlyphAnySite,
  },
  {
    title: "Region comments",
    body: "Drag to select an area when feedback covers more than a single point.",
    Glyph: GlyphRegion,
  },
  {
    title: "Status workflow",
    body: "Open, in progress, resolved. Filter and search every thread per page.",
    Glyph: GlyphStatus,
  },
  {
    title: "A screenshot with every comment",
    body: "Each pin captures the page exactly as your client saw it — browser, viewport and all.",
    Glyph: GlyphScreenshot,
  },
  {
    title: "Export for handoff",
    body: "Send a clean PDF or CSV of every comment straight to your developer.",
    Glyph: GlyphExport,
  },
] as const;

function FeatureGrid() {
  return (
    <section className={cn("border-t px-6 py-24 md:px-10", HAIRLINE)}>
      <Reveal>
        <MonoLabel>Everything you need, nothing you don&rsquo;t</MonoLabel>
        <h2 className="mt-4 max-w-xl text-3xl font-medium tracking-tight text-white md:text-4xl">
          Small tool. Sharp edges.
        </h2>
      </Reveal>
      <RevealGroup className="mt-14 grid pl-px pt-px sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ title, body, Glyph }) => (
          <RevealItem
            key={title}
            className={cn(
              "relative -ml-px -mt-px border p-8 transition-colors duration-200",
              HAIRLINE,
              "hover:z-10 hover:border-white/20",
            )}
          >
            <Glyph />
            <h3 className="mt-5 text-sm font-medium text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">{body}</p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

const steps = [
  {
    n: "01",
    name: "Share",
    body: "Create a review link for any staging URL and send it to your client.",
    chip: true,
  },
  {
    n: "02",
    name: "Comment",
    body: "They click anywhere on the live page and type. No account, no setup — that's the whole flow.",
    chip: false,
  },
  {
    n: "03",
    name: "Resolve",
    body: "Feedback lands in your inbox pinned to the exact element. Work through it and mark threads done.",
    chip: false,
  },
] as const;

function HowItWorks() {
  return (
    <section className={cn("border-t px-6 py-24 md:px-10", HAIRLINE)}>
      <Reveal>
        <MonoLabel>How it works</MonoLabel>
      </Reveal>
      <RevealGroup className="mt-12 grid gap-12 md:grid-cols-3 md:gap-8">
        {steps.map(({ n, name, body, chip }) => (
          <RevealItem key={n}>
            <MonoLabel>
              {n} — {name}
            </MonoLabel>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#A1A1AA]">
              {body}
            </p>
            {chip ? (
              <div
                className={cn(
                  "mt-5 inline-flex items-center gap-2 rounded-md border bg-white/[0.02] px-3 py-2 font-mono text-xs",
                  HAIRLINE,
                )}
              >
                <span className="text-[#52525B]">$</span>
                <span className="text-white/80">orvelle.com/r/x7k2m9</span>
                <span className="text-[#71717A]">→ copied</span>
              </div>
            ) : null}
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing (CLAUDE.md Section 9 plan limits)
// ---------------------------------------------------------------------------

const plans = [
  {
    name: "Free",
    price: "£0",
    period: "forever",
    features: [
      "2 active projects",
      "1 review link per project",
      "Unlimited guest commenters",
      "Orvelle watermark on reviews",
    ],
    cta: "Start free",
    popular: false,
  },
  {
    name: "Pro",
    price: "£15",
    period: "/month",
    features: [
      "Unlimited projects",
      "Unlimited review links",
      "PDF & CSV export",
      "No watermark",
    ],
    cta: "Start with Pro",
    popular: true,
  },
  {
    name: "Studio",
    price: "£39",
    period: "/month",
    features: [
      "Everything in Pro",
      "3 team members",
      "Unlimited projects & reviews",
      "PDF & CSV export",
    ],
    cta: "Start with Studio",
    popular: false,
  },
] as const;

function Pricing() {
  return (
    <section id="pricing" className={cn("border-t px-6 py-24 md:px-10", HAIRLINE)}>
      <Reveal>
        <MonoLabel>Pricing</MonoLabel>
        <h2 className="mt-4 text-3xl font-medium tracking-tight text-white md:text-4xl">
          Flat pricing. No per-seat nonsense.
        </h2>
        <p className="mt-3 text-sm text-[#A1A1AA]">
          No credit card to start. Cancel any time.
        </p>
      </Reveal>
      <RevealGroup className="mt-14 grid gap-6 pl-px pt-px md:grid-cols-3 md:gap-0">
        {plans.map(({ name, price, period, features: planFeatures, cta, popular }) => (
          <RevealItem
            key={name}
            className={cn(
              "relative flex flex-col border p-8 md:-ml-px md:-mt-px",
              popular
                ? "z-10 border-[#6366F1]"
                : cn(HAIRLINE, "transition-colors duration-200 hover:border-white/20"),
            )}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-white">{name}</h3>
              {popular ? <MonoLabel>Most popular</MonoLabel> : null}
            </div>
            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-medium tracking-tight text-white">
                {price}
              </span>
              <span className="font-mono text-xs text-[#71717A]">{period}</span>
            </div>
            <ul className="mt-8 flex-1 space-y-3">
              {planFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-[#A1A1AA]">
                  <svg
                    viewBox="0 0 12 12"
                    className="mt-1 h-3 w-3 shrink-0"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 6.2 L5 8.7 L9.5 3.5"
                      stroke="rgba(255,255,255,0.55)"
                      strokeWidth={1.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/register"
              className={cn("mt-10 w-full", popular ? pillWhite : pillGhost)}
            >
              {cta}
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA + footer
// ---------------------------------------------------------------------------

function FinalCta() {
  return (
    <section className={cn("border-t px-6 py-32 md:px-10 md:py-44", HAIRLINE)}>
      <Reveal className="flex flex-col items-start gap-10">
        <h2 className="max-w-[16ch] text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-tight text-white">
          Start collecting feedback.
        </h2>
        <Link
          to="/register"
          aria-label="Sign up for Orvelle"
          className={cn(
            "group inline-flex items-center gap-4 text-sm text-[#A1A1AA] transition-colors duration-200 hover:text-white",
            focusRing,
            "rounded-full",
          )}
        >
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full border transition-colors duration-200",
              "border-white/[0.15] group-hover:border-white/40",
            )}
          >
            <ArrowRight className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          Free to start — no credit card
        </Link>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className={cn("border-t px-6 py-12 md:px-10", HAIRLINE)}>
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            aria-label="Orvelle home"
            className={cn("rounded-sm text-white", focusRing)}
          >
            <Logo size="sm" />
          </Link>
          <span className="text-xs text-[#52525B]">© 2026 Orvelle</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-[#A1A1AA]">
          <a href="#pricing" className={cn("rounded-sm transition-colors hover:text-white", focusRing)}>
            Pricing
          </a>
          <Link to="/login" className={cn("rounded-sm transition-colors hover:text-white", focusRing)}>
            Log in
          </Link>
          <Link to="/register" className={cn("rounded-sm transition-colors hover:text-white", focusRing)}>
            Sign up
          </Link>
        </div>
        <MonoLabel>Made in Milton Keynes</MonoLabel>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Landing() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#08090A] font-sans text-white antialiased selection:bg-white/20">
      {/* the ruled frame: hairlines run the full page height */}
      <div className={cn("mx-auto w-full max-w-[1100px] border-x", HAIRLINE)}>
        <Nav />
        <main>
          <Hero />
          <ProofBar />
          <Editorial />
          <FigTrio />
          <FeatureGrid />
          <HowItWorks />
          <Pricing />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </div>
  );
}
