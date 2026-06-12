/**
 * Marketing landing page — dark editorial design, distinctly Orvelle.
 *
 * Design language (intentionally overrides Section 10 for this page only):
 * near-black #08090A, a max-w-[1100px] "graph paper" frame with hairline
 * rules, monochrome type (white / #A1A1AA / #52525B), Geist + Geist Mono.
 *
 * Indigo #6366F1 is the brand signature, used deliberately: the logo dot,
 * pin markers inside product visuals, indigo full stops echoing the logo dot
 * on key headlines, the highlighted pricing border, and focus rings.
 * Sections break the single-column rhythm on purpose: the editorial block
 * sits offset right, how-it-works is a split layout, the final CTA is
 * asymmetric two-column.
 */
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { Fragment, lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { Logo } from "@/components/shared/Logo";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

import {
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

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const HAIRLINE = "border-white/[0.08]";

/** The logo dot, echoed as a full stop on key headlines. */
function BrandDot() {
  return (
    <span aria-hidden="true" className="text-[#6366F1]">
      .
    </span>
  );
}

/** Numbered indigo pin chip — the product's pin, used as a section marker. */
function PinChip({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#6366F1] text-[10px] font-semibold leading-none text-white",
        className,
      )}
    >
      {n}
    </span>
  );
}

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

// Tactile press: quick spring scale-down plus a brightness/inner-shadow
// shift via active: classes. Kept under reduced motion — it is direct
// interaction feedback, not decoration.
const MotionLink = motion(Link);

const pressProps = {
  whileTap: { scale: 0.97 },
  transition: { type: "spring", stiffness: 600, damping: 30 } as const,
} as const;

const pillWhite = cn(
  "inline-flex h-11 touch-manipulation items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition-[background-color,filter] duration-150 hover:bg-[#E4E4E7] active:brightness-90 active:[box-shadow:inset_0_2px_6px_rgba(0,0,0,0.35)]",
  focusRing,
);

const pillGhost = cn(
  "inline-flex h-11 touch-manipulation items-center justify-center rounded-full border border-white/[0.15] px-6 text-sm font-medium text-white transition-colors duration-150 hover:border-white/30 hover:bg-white/[0.04] active:bg-white/[0.08]",
  focusRing,
);

const dotGrid = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
} as const;

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
        </div>
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

const HEADLINE_WORDS = ["Feedback", "that", "lands", "on", "the", "page"];

function HeroHeadline() {
  const reduced = useReducedMotion();
  const className =
    "max-w-[16ch] text-[clamp(2.75rem,5.5vw,4.5rem)] font-medium leading-[1.05] tracking-tight text-white";

  if (reduced) {
    return (
      <h1 className={className}>
        Feedback that lands on the page
        <BrandDot />
      </h1>
    );
  }

  return (
    <motion.h1
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
    >
      {HEADLINE_WORDS.map((word, i) => (
        // The separating space must live OUTSIDE the inline-block span —
        // trailing spaces inside one are stripped at its line-box boundary.
        <Fragment key={word}>
          <motion.span
            className="inline-block"
            variants={{
              hidden: { opacity: 0, y: 14 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
            }}
          >
            {word}
            {i === HEADLINE_WORDS.length - 1 ? <BrandDot /> : null}
          </motion.span>
          {i < HEADLINE_WORDS.length - 1 ? " " : null}
        </Fragment>
      ))}
    </motion.h1>
  );
}

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
      <HeroHeadline />
      <Reveal>
        <p className="mt-7 max-w-md text-base leading-relaxed text-[#A1A1AA]">
          Share one link. Your client clicks anywhere on their site to leave a
          comment. No accounts, no screenshots, no email chains.
        </p>
      </Reveal>
      <Reveal className="mt-10 flex flex-wrap items-center gap-4">
        <MotionLink to="/register" {...pressProps} className={pillWhite}>
          Start free
        </MotionLink>
        <motion.a
          href="#demo"
          onClick={scrollToDemo}
          {...pressProps}
          className={pillGhost}
        >
          See how it works
        </motion.a>
      </Reveal>

      {/* hero visual on a faint dot-grid panel */}
      <Reveal className="mt-20">
        <div id="demo" className={cn("border p-3 sm:p-6 md:p-10", HAIRLINE)} style={dotGrid}>
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

/** Editorial statement — deliberately offset right to break the column rhythm. */
function Editorial() {
  return (
    <section className={cn("border-t px-6 py-24 md:px-10 md:py-32", HAIRLINE)}>
      <Reveal className="md:ml-auto md:max-w-3xl">
        <p className="text-[clamp(2rem,4vw,3.25rem)] font-medium leading-[1.15] tracking-tight">
          <span className="text-white">
            A new way to review websites
            <BrandDot />
          </span>{" "}
          <span className="text-[#A1A1AA]">
            Purpose-built for client work — every comment pinned to the exact
            pixel it&rsquo;s about, every revision tracked to done.
          </span>
        </p>
      </Reveal>
    </section>
  );
}

// --- UI-literal trio: the product itself, miniaturised -----------------------

/** Shared tile: faint dot-grid panel in the hero demo's visual language. */
function TrioTile({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn("relative h-44 overflow-hidden rounded-lg border", HAIRLINE)}
      style={dotGrid}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

function TrioClickTile() {
  return (
    <TrioTile>
      {/* mini page */}
      <div className="absolute inset-x-6 bottom-0 top-6 rounded-t-md border border-b-0 border-white/10 bg-[#0C0D0F] p-3">
        <div className="h-1.5 w-1/3 rounded-sm bg-white/10" />
        <div className="mt-2 h-1.5 w-1/2 rounded-sm bg-white/[0.06]" />
        <div className="mt-3 h-14 rounded border border-white/[0.09]" />
      </div>
      {/* pin + comment chip, exactly as in the product */}
      <div className="absolute left-[38%] top-[52%]">
        <PinChip n={1} />
      </div>
      <div className="absolute left-[47%] top-[46%] rounded-md border border-white/10 bg-[#101113] px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
        <p className="text-[10px] leading-tight text-white/90">
          Make this full-width
        </p>
      </div>
    </TrioTile>
  );
}

function TrioRegionTile() {
  return (
    <TrioTile>
      <div className="absolute inset-x-6 bottom-0 top-6 rounded-t-md border border-b-0 border-white/10 bg-[#0C0D0F] p-3">
        <div className="h-1.5 w-2/5 rounded-sm bg-white/10" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="h-16 rounded border border-white/[0.09]" />
          <div className="h-16 rounded border border-white/[0.09]" />
        </div>
      </div>
      {/* dashed region with corner handles + dimension badge */}
      <div className="absolute left-[30%] top-[42%] h-[34%] w-[38%] border border-dashed border-white/40 bg-white/[0.03]">
        {(["-left-[3px] -top-[3px]", "-right-[3px] -top-[3px]", "-left-[3px] -bottom-[3px]", "-right-[3px] -bottom-[3px]"] as const).map(
          (pos) => (
            <span
              key={pos}
              className={cn("absolute h-[6px] w-[6px] border border-white/60 bg-[#08090A]", pos)}
            />
          ),
        )}
        <span className="absolute -bottom-5 right-0 rounded-sm bg-white/10 px-1 py-px font-mono text-[9px] tabular-nums text-white/70">
          240 × 140
        </span>
      </div>
      <div className="absolute left-[30%] top-[42%] -translate-x-1/2 -translate-y-1/2">
        <PinChip n={2} />
      </div>
    </TrioTile>
  );
}

function TrioResolveTile() {
  return (
    <TrioTile>
      <div className="absolute inset-x-8 top-8 space-y-2.5">
        <div className="rounded-md border border-white/10 bg-[#101113] p-2.5 shadow-[0_6px_16px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2">
            <PinChip n={1} className="h-4 w-4 text-[9px]" />
            <span className="text-[10px] text-white/90">Logo feels too small</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 pl-6">
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
              <path
                d="M2 5.2 L4.2 7.4 L8 3"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-white">
              Resolved
            </span>
          </div>
        </div>
        <div className="rounded-md border border-white/[0.07] p-2.5">
          <div className="flex items-center gap-2">
            <PinChip n={2} className="h-4 w-4 text-[9px]" />
            <span className="text-[10px] text-white/60">Tighten this section</span>
          </div>
          <div className="mt-1.5 pl-6">
            <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-[#71717A]">
              Open
            </span>
          </div>
        </div>
      </div>
    </TrioTile>
  );
}

const trio = [
  {
    n: 1,
    title: "Click anywhere",
    caption:
      "Your client clicks any element on the live page. The comment pins to that exact spot.",
    Tile: TrioClickTile,
  },
  {
    n: 2,
    title: "Select a region",
    caption:
      "Drag to outline an area when the feedback is about more than a single point.",
    Tile: TrioRegionTile,
  },
  {
    n: 3,
    title: "Track to resolved",
    caption:
      "Every thread moves open → in progress → resolved. Nothing gets lost in email.",
    Tile: TrioResolveTile,
  },
] as const;

function Trio() {
  return (
    <section className={cn("border-t", HAIRLINE)}>
      <RevealGroup
        className={cn(
          "grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0",
          "divide-white/[0.08]",
        )}
      >
        {trio.map(({ n, title, caption, Tile }) => (
          <RevealItem key={n} className="px-6 py-12 md:px-8 md:py-14">
            <div className="flex items-center gap-2.5">
              <PinChip n={n} />
              <h3 className="text-base font-medium text-white">{title}</h3>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-[#A1A1AA]">
              {caption}
            </p>
            <div className="mt-7">
              <Tile />
            </div>
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

/** Split layout: heading column left, hairline step rows right. */
function HowItWorks() {
  return (
    <section className={cn("border-t px-6 py-24 md:px-10", HAIRLINE)}>
      <div className="grid gap-12 md:grid-cols-[1fr_2fr] md:gap-16">
        <Reveal>
          <MonoLabel>How it works</MonoLabel>
          <h2 className="mt-4 max-w-[12ch] text-3xl font-medium tracking-tight text-white md:text-4xl">
            From link to resolved
          </h2>
        </Reveal>
        <RevealGroup className={cn("divide-y", "divide-white/[0.08]")}>
          {steps.map(({ n, name, body, chip }) => (
            <RevealItem key={n} className="py-8 first:pt-0 last:pb-0">
              <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                <MonoLabel>
                  {n} — {name}
                </MonoLabel>
                <div>
                  <p className="max-w-md text-sm leading-relaxed text-[#A1A1AA]">
                    {body}
                  </p>
                  {chip ? (
                    <div
                      className={cn(
                        "mt-4 inline-flex items-center gap-2 rounded-md border bg-white/[0.02] px-3 py-2 font-mono text-xs",
                        HAIRLINE,
                      )}
                    >
                      <span className="text-[#52525B]">$</span>
                      <span className="text-white/80">orvellehq.com/r/x7k2m9</span>
                      <span className="text-[#71717A]">→ copied</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

const comparison = [
  {
    point: "Client access",
    them: "Accounts, invites and seats",
    us: "One link — no login",
  },
  {
    point: "Pricing",
    them: "Per-seat, and it keeps climbing",
    us: "Flat: £0, £15 or £39",
  },
  {
    point: "Free tier",
    them: "A trial that expires",
    us: "Free forever, no card",
  },
  {
    point: "Comments",
    them: "Page-level notes",
    us: "Pinned to the exact pixel",
  },
  {
    point: "Handoff",
    them: "Copy-paste into email",
    us: "PDF & CSV export",
  },
] as const;

function Comparison() {
  return (
    <section className={cn("border-t px-6 py-24 md:px-10", HAIRLINE)}>
      <Reveal>
        <MonoLabel>The difference</MonoLabel>
        <h2 className="mt-4 max-w-xl text-3xl font-medium tracking-tight text-white md:text-4xl">
          Built for the way client review actually works
        </h2>
      </Reveal>
      <Reveal className="mt-14">
        <div className={cn("border-t", HAIRLINE)} role="table" aria-label="Orvelle compared with most feedback tools">
          {/* header row */}
          <div
            role="row"
            className={cn(
              "grid grid-cols-2 gap-4 border-b py-4 md:grid-cols-[1fr_1fr_1fr]",
              HAIRLINE,
            )}
          >
            {/* sr-only below md keeps this header in the accessibility tree
                without occupying a track in the 2-column mobile grid */}
            <span
              role="columnheader"
              aria-label="Feature"
              className="sr-only md:not-sr-only md:block"
            />
            <span role="columnheader" className="font-mono text-xs uppercase tracking-[0.2em] text-[#71717A]">
              Most feedback tools
            </span>
            <span role="columnheader" className="text-white">
              <Logo size="sm" />
            </span>
          </div>
          {comparison.map(({ point, them, us }) => (
            <div
              key={point}
              role="row"
              className={cn(
                "grid grid-cols-2 gap-x-4 gap-y-1 border-b py-4 md:grid-cols-[1fr_1fr_1fr]",
                HAIRLINE,
              )}
            >
              <span role="rowheader" className="col-span-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#A1A1AA] md:col-span-1 md:self-center md:text-xs md:tracking-[0.2em]">
                {point}
              </span>
              <span role="cell" className="text-sm leading-relaxed text-[#A1A1AA]">
                {them}
              </span>
              <span role="cell" className="text-sm leading-relaxed text-white">
                {us}
              </span>
            </div>
          ))}
        </div>
      </Reveal>
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
            <MotionLink
              to="/register"
              {...pressProps}
              className={cn("mt-10 w-full", popular ? pillWhite : pillGhost)}
            >
              {cta}
            </MotionLink>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

const faqs = [
  {
    q: "Do my clients need an account?",
    a: "No. They open your share link, click anywhere on the page, and type. We ask for a name with their first comment so you know who said what — that's it. No sign-up, no password, nothing to install.",
  },
  {
    q: "Is the free plan really free?",
    a: "Yes — free forever, no credit card. You get 2 active projects with a review link each and unlimited client commenters. Reviews carry a small Orvelle watermark; paid plans remove it.",
  },
  {
    q: "Does it work on any site?",
    a: "If it has a URL, it works: WordPress, Webflow, Squarespace, Showit, staging servers, custom builds. Your client reviews the real, live page wherever the site allows it.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, self-serve from your billing page in two clicks — no emails, no retention hoops. Your plan drops to Free at the end of the billing period and your projects stay where they are.",
  },
  {
    q: "What happens when a site can't be proxied?",
    a: "Some sites actively block being embedded. When that happens we automatically capture a full screenshot of the page instead, and your client comments on that — pins and all. Feedback always lands.",
  },
  {
    q: "Is my clients' data secure?",
    a: "Everything is served over HTTPS, clients never create passwords with us, and comments are only visible to people with the review link. You can deactivate a link or delete a project at any time, and we never sell or share your data.",
  },
] as const;

/** Split layout: title left, hairline accordion right. */
function Faq() {
  return (
    <section className={cn("border-t px-6 py-24 md:px-10", HAIRLINE)}>
      <div className="grid gap-12 md:grid-cols-[1fr_2fr] md:gap-16">
        <Reveal>
          <MonoLabel>FAQ</MonoLabel>
          <h2 className="mt-4 max-w-[12ch] text-3xl font-medium tracking-tight text-white md:text-4xl">
            Questions, answered
          </h2>
        </Reveal>
        <Reveal>
          <AccordionPrimitive.Root type="single" collapsible className={cn("border-t", HAIRLINE)}>
            {faqs.map(({ q, a }) => (
              <AccordionPrimitive.Item
                key={q}
                value={q}
                className={cn("border-b", HAIRLINE)}
              >
                <AccordionPrimitive.Header asChild>
                  <h3>
                    <AccordionPrimitive.Trigger
                      className={cn(
                        "group flex w-full items-center justify-between gap-4 rounded-sm py-5 text-left text-[15px] font-medium text-white transition-colors hover:text-white/80",
                        focusRing,
                      )}
                    >
                      {q}
                      <Plus
                        className="h-4 w-4 shrink-0 text-[#71717A] transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]:rotate-45"
                        aria-hidden="true"
                      />
                    </AccordionPrimitive.Trigger>
                  </h3>
                </AccordionPrimitive.Header>
                <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
                  <p className="max-w-prose pb-5 text-sm leading-relaxed text-[#A1A1AA]">
                    {a}
                  </p>
                </AccordionPrimitive.Content>
              </AccordionPrimitive.Item>
            ))}
          </AccordionPrimitive.Root>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA + contact + footer
// ---------------------------------------------------------------------------

/** Asymmetric closer: headline left, action right. */
function FinalCta() {
  return (
    <section className={cn("border-t px-6 py-28 md:px-10 md:py-40", HAIRLINE)}>
      <Reveal className="flex flex-col gap-12 md:flex-row md:items-end md:justify-between">
        <h2 className="max-w-[14ch] text-[clamp(2.25rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-tight text-white">
          Start collecting feedback
          <BrandDot />
        </h2>
        <MotionLink
          to="/register"
          {...pressProps}
          className={cn(
            "group inline-flex shrink-0 touch-manipulation items-center gap-4 rounded-full text-sm text-[#A1A1AA] transition-colors duration-200 hover:text-white",
            focusRing,
          )}
        >
          Free to start — no credit card
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full border transition-colors duration-200",
              "border-white/[0.15] group-hover:border-white/40 group-active:bg-white/[0.06]",
            )}
          >
            <ArrowRight className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
        </MotionLink>
      </Reveal>
    </section>
  );
}

function Contact() {
  return (
    <section className={cn("border-t px-6 py-16 md:px-10", HAIRLINE)}>
      <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <MonoLabel>Contact</MonoLabel>
          <h2 className="mt-3 text-2xl font-medium tracking-tight text-white md:text-3xl">
            Get in touch
            <BrandDot />
          </h2>
        </div>
        <a
          href="mailto:hello@orvellehq.com"
          className={cn(
            "group inline-flex items-center gap-2 rounded-sm font-mono text-sm text-[#A1A1AA] transition-colors duration-200 hover:text-white",
            focusRing,
          )}
        >
          <span className="border-b border-white/20 pb-0.5 transition-colors duration-200 group-hover:border-white/60">
            hello@orvellehq.com
          </span>
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
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
          <Trio />
          <FeatureGrid />
          <HowItWorks />
          <Comparison />
          <Pricing />
          <Faq />
          <FinalCta />
        </main>
        <Contact />
        <Footer />
      </div>
    </div>
  );
}
