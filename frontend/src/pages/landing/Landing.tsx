/**
 * Marketing landing page — dark editorial design, distinctly Orvelle.
 *
 * Layout: a max-w-[1400px] "graph paper" frame with full-height hairlines.
 * The hero demo stands on a lit stage — a horizon glow rising from the
 * frame's bottom edge and a perspective floor plane fading to black — and
 * settles flat from a slight perspective lift as it scrolls into view.
 *
 * Indigo #6366F1 is the brand signature: logo dot, pin markers, indigo full
 * stops on key headlines, the highlighted pricing border, focus rings, and
 * a whisper of tint in the stage light. Everything else is monochrome.
 *
 * Page story: hero → editorial → how it works → features → trio →
 * comparison → pricing teaser (/pricing) → FAQ teaser (/faq) → final CTA.
 */
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Fragment, lazy, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Footer } from "@/components/shared/Footer";
import { Logo } from "@/components/shared/Logo";
import { Nav } from "@/components/shared/Nav";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

import { comparison, plans, steps, teaserFaqs } from "./content";
import {
  GlyphAnySite,
  GlyphExport,
  GlyphNoLogin,
  GlyphRegion,
  GlyphScreenshot,
  GlyphStatus,
} from "./figures";
import {
  BrandDot,
  dotGrid,
  EASE,
  FaqAccordion,
  focusRing,
  HAIRLINE,
  MonoLabel,
  MotionLink,
  pillGhost,
  pillWhite,
  PinChip,
  pressProps,
  Reveal,
  RevealGroup,
  RevealHeading,
  RevealItem,
  SECTION_X,
  SectionRule,
} from "./ui";

// The ambient demo carries its own animation machinery — lazy-mount it after
// first paint so the hero text renders instantly.
const HeroDemo = lazy(() => import("./HeroDemo"));

// ---------------------------------------------------------------------------
// Hero + stage
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

/**
 * The lit stage: horizon glow rising from the frame's bottom edge, a
 * perspective floor plane fading to black, and a light pool directly under
 * the frame. The demo itself carries a 1.8° perspective lift that settles
 * flat as it scrolls into view; the glow brightens in step.
 */
function HeroStage() {
  const reduced = useReducedMotion();
  const [demoReady, setDemoReady] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // Mount the demo only after first paint.
  useEffect(() => {
    setDemoReady(true);
  }, []);

  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ["start end", "start 0.4"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [1.8, 0]);
  const glowOpacity = useTransform(scrollYProgress, [0, 1], [0.45, 1]);

  return (
    <div id="demo" className={cn("relative scroll-mt-24 pb-36 md:pb-52", SECTION_X)}>
      <div ref={stageRef} className="relative">
        {/* horizon glow behind the frame's lower half */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-32 z-0 h-72"
          style={{
            ...(reduced ? null : { opacity: glowOpacity }),
            background:
              "radial-gradient(ellipse 52% 58% at 50% 22%, rgba(255,255,255,0.10) 0%, rgba(99,102,241,0.05) 42%, transparent 72%)",
          }}
        />

        {/* the demo, standing on the stage */}
        <motion.div
          className="relative z-10 will-change-transform"
          style={reduced ? undefined : { rotateX, transformPerspective: 1100 }}
        >
          {demoReady ? (
            <Suspense fallback={<DemoPlaceholder />}>
              <HeroDemo />
            </Suspense>
          ) : (
            <DemoPlaceholder />
          )}
        </motion.div>

        {/* light pool directly under the frame */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-full z-0 h-12 -translate-y-1"
          style={{
            background:
              "radial-gradient(ellipse 50% 100% at 50% 0%, rgba(255,255,255,0.13), transparent 70%)",
          }}
        />

        {/* perspective floor fading to black */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-full z-0 h-64 md:h-80"
        >
          <div
            className="h-full w-full"
            style={{
              transform: "perspective(620px) rotateX(54deg)",
              transformOrigin: "top center",
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.018) 42%, transparent 78%)",
              maskImage:
                "radial-gradient(ellipse 65% 95% at 50% 0%, black 25%, transparent 98%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 65% 95% at 50% 0%, black 25%, transparent 98%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const reduced = useReducedMotion();

  const scrollToDemo = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById("demo")?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <>
      <section className={cn("pb-20 pt-20 md:pt-28", SECTION_X)}>
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
      </section>
      <HeroStage />
    </>
  );
}

// ---------------------------------------------------------------------------
// Editorial — deliberately offset right to break the column rhythm
// ---------------------------------------------------------------------------

function Editorial() {
  return (
    <section>
      <SectionRule />
      <div className={cn("py-24 md:py-32", SECTION_X)}>
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
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works — split layout, anchor target for the nav
// ---------------------------------------------------------------------------

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20">
      <SectionRule />
      <div className={cn("py-24", SECTION_X)}>
        <div className="grid gap-12 md:grid-cols-[1fr_2fr] md:gap-16">
          <Reveal>
            <MonoLabel>How it works</MonoLabel>
            <RevealHeading
              text="From link to resolved"
              className="mt-4 max-w-[12ch] text-3xl font-medium tracking-tight text-white md:text-4xl"
            />
          </Reveal>
          <RevealGroup className="divide-y divide-white/[0.08]">
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
                        <span className="text-[#8A8A93]">$</span>
                        <span className="text-white/80">orvellehq.com/r/x7k2m9</span>
                        <span className="text-[#8A8A93]">→ copied</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Feature grid
// ---------------------------------------------------------------------------

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
    <section>
      <SectionRule />
      <div className={cn("py-24", SECTION_X)}>
        <Reveal>
          <MonoLabel>Everything you need, nothing you don&rsquo;t</MonoLabel>
        </Reveal>
        <RevealHeading
          text="Small tool. Sharp edges."
          className="mt-4 max-w-xl text-3xl font-medium tracking-tight text-white md:text-4xl"
        />
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
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// UI-literal trio: the product itself, miniaturised
// ---------------------------------------------------------------------------

function TrioTile({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn("relative h-48 overflow-hidden rounded-lg border", HAIRLINE)}
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
      <div className="absolute inset-x-6 bottom-0 top-6 rounded-t-md border border-b-0 border-white/10 bg-[#0C0D0F] p-3">
        <div className="h-1.5 w-1/3 rounded-sm bg-white/10" />
        <div className="mt-2 h-1.5 w-1/2 rounded-sm bg-white/[0.06]" />
        <div className="mt-3 h-16 rounded border border-white/[0.09]" />
      </div>
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
    <section>
      <SectionRule />
      <RevealGroup className="grid divide-y divide-white/[0.08] md:grid-cols-3 md:divide-x md:divide-y-0">
        {trio.map(({ n, title, caption, Tile }) => (
          <RevealItem key={n} className="px-8 py-12 md:px-10 md:py-14">
            <div className="flex items-center gap-2.5">
              <PinChip n={n} />
              <h3 className="text-base font-medium text-white">{title}</h3>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-[#A1A1AA]">{caption}</p>
            <div className="mt-7">
              <Tile />
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function Comparison() {
  return (
    <section>
      <SectionRule />
      <div className={cn("py-24", SECTION_X)}>
        <Reveal>
          <MonoLabel>The difference</MonoLabel>
        </Reveal>
        <RevealHeading
          text="Built for the way client review actually works"
          className="mt-4 max-w-xl text-3xl font-medium tracking-tight text-white md:text-4xl"
        />
        <Reveal className="mt-14">
          <div className={cn("border-t", HAIRLINE)} role="table" aria-label="Orvelle compared with most feedback tools">
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
              <span role="columnheader" className="font-mono text-xs uppercase tracking-[0.2em] text-[#8A8A93]">
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
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing teaser → /pricing
// ---------------------------------------------------------------------------

function PricingTeaser() {
  return (
    <section>
      <SectionRule />
      <div className={cn("py-24", SECTION_X)}>
        <Reveal>
          <MonoLabel>Pricing</MonoLabel>
        </Reveal>
        <RevealHeading
          text="Flat pricing. No per-seat nonsense."
          className="mt-4 max-w-xl text-3xl font-medium tracking-tight text-white md:text-4xl"
        />
        <RevealGroup className="mt-14 grid gap-6 pl-px pt-px md:grid-cols-3 md:gap-0">
          {plans.map(({ name, price, period, tagline, popular }) => (
            <RevealItem
              key={name}
              className={cn(
                "relative flex flex-col gap-4 border p-8 md:-ml-px md:-mt-px",
                popular
                  ? "z-10 border-[#6366F1]"
                  : cn(HAIRLINE, "transition-colors duration-200 hover:border-white/20"),
              )}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-white">{name}</h3>
                {popular ? <MonoLabel>Most popular</MonoLabel> : null}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-medium tracking-tight text-white">
                  {price}
                </span>
                <span className="font-mono text-xs text-[#8A8A93]">{period}</span>
              </div>
              <p className="text-sm leading-relaxed text-[#A1A1AA]">{tagline}</p>
            </RevealItem>
          ))}
        </RevealGroup>
        <Reveal className="mt-10 flex flex-wrap items-center gap-4">
          <MotionLink to="/pricing" {...pressProps} className={pillGhost}>
            See full pricing
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </MotionLink>
          <span className="text-sm text-[#8A8A93]">
            No credit card to start. Cancel any time.
          </span>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ teaser → /faq
// ---------------------------------------------------------------------------

function FaqTeaser() {
  return (
    <section>
      <SectionRule />
      <div className={cn("py-24", SECTION_X)}>
        <div className="grid gap-12 md:grid-cols-[1fr_2fr] md:gap-16">
          <Reveal>
            <MonoLabel>FAQ</MonoLabel>
            <RevealHeading
              text="Questions, answered"
              className="mt-4 max-w-[12ch] text-3xl font-medium tracking-tight text-white md:text-4xl"
            />
            {/* display override AFTER pillGhost so twMerge keeps `hidden`
                (pillGhost starts with inline-flex — same display group) */}
            <MotionLink
              to="/faq"
              {...pressProps}
              className={cn(pillGhost, "mt-8 hidden md:inline-flex")}
            >
              All questions
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </MotionLink>
          </Reveal>
          <Reveal>
            <FaqAccordion items={teaserFaqs} />
            <MotionLink
              to="/faq"
              {...pressProps}
              className={cn(pillGhost, "mt-8 inline-flex md:hidden")}
            >
              All questions
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </MotionLink>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

function FinalCta() {
  return (
    <section>
      <SectionRule />
      <div className={cn("py-28 md:py-40", SECTION_X)}>
        <div className="flex flex-col gap-12 md:flex-row md:items-end md:justify-between">
          <RevealHeading
            text="Start collecting feedback"
            dot
            className="max-w-[14ch] text-[clamp(2.25rem,5vw,3.75rem)] font-medium leading-[1.05] tracking-tight text-white"
          />
          <Reveal>
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
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const reduced = useReducedMotion();
  const location = useLocation();

  // Support /#how etc. when arriving from other routes. Keyed on location.key
  // so re-clicking the same hash link re-scrolls. getElementById (not
  // querySelector) so a malformed fragment can never throw and blank the page.
  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    document.getElementById(id)?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }, [location.key, location.hash, reduced]);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[#08090A] font-sans text-white antialiased selection:bg-white/20">
      {/* the ruled frame: hairlines run the full page height */}
      <div className={cn("mx-auto w-full max-w-[1400px] border-x", HAIRLINE)}>
        <Nav />
        <main>
          <Hero />
          <Editorial />
          <HowItWorks />
          <FeatureGrid />
          <Trio />
          <Comparison />
          <PricingTeaser />
          <FaqTeaser />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </div>
  );
}
