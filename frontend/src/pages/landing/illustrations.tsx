/**
 * Landing-page product illustrations — Vercel-style stylised UI.
 *
 * Shared illustration language:
 * - Pure JSX + Tailwind + SVG. No photos, no screenshots, zero image requests.
 * - Greyscale only (zinc on #0A0A0A / #111111). The only colour: desaturated
 *   status dots (red/amber/green) and the white numbered pins.
 * - Containers: rounded-xl, hairline zinc-800 borders, 1px zinc-700/50 top
 *   highlight, shadow-2xl shadow-black/50, faint white radial glow behind.
 * - "Text" inside mockups is tiny real microcopy (text-[10px] zinc-500) or
 *   skeleton bars (h-2 rounded bg-zinc-800). Never fabricated customers,
 *   logos, or stats.
 * - Motion: Framer Motion entrances with viewport={{ once: true }}; CSS loops
 *   are `motion-safe:` only. prefers-reduced-motion renders final states
 *   statically (variants are dropped via useReducedMotion).
 */
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Check,
  ChevronDown,
  Copy,
  Link2,
  Mail,
  MapPin,
  Send,
  User,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Palette & shared primitives
// ---------------------------------------------------------------------------

/** Status colours at ~70% saturation — the only colour allowed in mockups. */
const STATUS = {
  open: "#DB5B5B",
  inProgress: "#D29A3A",
  resolved: "#3FA968",
} as const;

const viewport = { once: true, margin: "-80px" } as const;

/** Faint radial glow that sits behind every illustration. */
function Glow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute -inset-8 -z-10", className)}
    >
      <div className="h-full w-full rounded-full bg-white/[0.03] blur-3xl" />
    </div>
  );
}

/** Browser frame: three 8px dots + centred mono URL pill. */
function BrowserChrome({
  url,
  children,
  className,
}: {
  url: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-zinc-800 border-t-zinc-700/50 bg-[#0A0A0A] shadow-2xl shadow-black/50",
        className,
      )}
    >
      <div className="flex items-center border-b border-zinc-800 bg-[#111111] px-3.5 py-2.5">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mx-auto w-fit max-w-full truncate rounded-md bg-zinc-900 px-3 py-1 font-mono text-[10px] leading-none text-zinc-500">
            {url}
          </div>
        </div>
        {/* mirror spacer keeps the URL optically centred */}
        <span className="w-9 shrink-0" />
      </div>
      {children}
    </div>
  );
}

/** Numbered comment pin — 20px white circle with optional looping pulse. */
function PinDot({
  n,
  pulse = false,
  pulseDelay = "1.6s",
  className,
}: {
  n: number;
  pulse?: boolean;
  pulseDelay?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex h-5 w-5 items-center justify-center rounded-full bg-[#FAFAFA] text-[10px] font-bold leading-none text-[#0A0A0A] shadow-lg shadow-black/40",
        className,
      )}
    >
      {pulse ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-white/40 motion-safe:animate-pin-pulse"
          style={{ animationDelay: pulseDelay }}
        />
      ) : null}
      <span className="relative">{n}</span>
    </span>
  );
}

/** Initials avatar; renders a neutral person icon when no initials given. */
function Avatar({
  initials,
  muted = false,
  className,
}: {
  initials?: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
        muted ? "bg-zinc-800 text-zinc-400" : "bg-zinc-200 text-[#0A0A0A]",
        className,
      )}
    >
      {initials ?? <User className="h-3 w-3" />}
    </span>
  );
}

/** Status pill with desaturated dot (e.g. "Open", "In Progress"). */
function StatusChip({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[9px] font-medium text-zinc-300",
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 1. HERO CENTREPIECE — "Site under review" browser frame
// ---------------------------------------------------------------------------

const wireframeV: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const pinV: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 420,
      damping: 20,
      delay: 0.5 + i * 0.15,
    },
  }),
};

const heroCardV: Variants = {
  hidden: { opacity: 0, x: -8, y: -4, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: "easeOut", delay: 1.15 },
  },
};

export function HeroIllustration() {
  const reduced = useReducedMotion();

  return (
    <div className="relative isolate mx-auto mt-16 w-full max-w-[720px] px-4 sm:px-0">
      <Glow className="-inset-x-16 -inset-y-10" />

      <motion.div
        aria-hidden
        variants={reduced ? undefined : wireframeV}
        initial={reduced ? undefined : "hidden"}
        whileInView={reduced ? undefined : "visible"}
        viewport={viewport}
      >
        <BrowserChrome url="staging.clientsite.com">
          <div className="relative px-5 py-6 sm:px-8 sm:py-8">
            {/* Wireframe — nav bar */}
            <div className="flex items-center justify-between">
              <div className="h-2.5 w-16 rounded bg-zinc-700" />
              <div className="flex items-center gap-3">
                <div className="hidden h-2 w-9 rounded bg-zinc-800 sm:block" />
                <div className="h-2 w-9 rounded bg-zinc-800" />
                <div className="h-2 w-9 rounded bg-zinc-800" />
                <div className="h-6 w-16 rounded-md bg-zinc-800" />
              </div>
            </div>

            {/* Wireframe — hero block */}
            <div className="mt-9">
              <div className="h-4 w-3/5 rounded bg-zinc-700" />
              <div className="mt-2 h-4 w-2/5 rounded bg-zinc-700" />
              <div className="mt-4 h-2 w-1/2 rounded bg-zinc-800" />
              <div className="mt-1.5 h-2 w-2/5 rounded bg-zinc-800" />
              <div className="mt-5 flex gap-2">
                <div className="h-7 w-24 rounded-md bg-zinc-700" />
                <div className="h-7 w-24 rounded-md border border-zinc-800" />
              </div>
            </div>

            {/* Wireframe — two-column section */}
            <div className="mt-10 grid grid-cols-2 gap-5">
              <div className="flex h-28 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
                <div className="h-8 w-8 rounded-full bg-zinc-800" />
              </div>
              <div className="py-1.5">
                <div className="h-3 w-3/4 rounded bg-zinc-700" />
                <div className="mt-2.5 h-2 w-full rounded bg-zinc-800" />
                <div className="mt-1.5 h-2 w-5/6 rounded bg-zinc-800" />
                <div className="mt-1.5 h-2 w-2/3 rounded bg-zinc-800" />
                <div className="mt-4 h-2 w-20 rounded bg-zinc-700" />
              </div>
            </div>

            {/* Pins — pop in sequence after the wireframe settles */}
            <motion.div
              custom={0}
              variants={reduced ? undefined : pinV}
              className="absolute left-[57%] top-[20%] z-10"
            >
              <PinDot n={1} pulse pulseDelay="1.6s" />
            </motion.div>
            <motion.div
              custom={1}
              variants={reduced ? undefined : pinV}
              className="absolute left-[6.5%] top-[6%] z-10"
            >
              <PinDot n={2} pulse pulseDelay="1.75s" />
            </motion.div>
            <motion.div
              custom={2}
              variants={reduced ? undefined : pinV}
              className="absolute left-[22%] top-[71%] z-10"
            >
              <PinDot n={3} pulse pulseDelay="1.9s" />
            </motion.div>

            {/* Comment card — slides out from pin 2 */}
            <motion.div
              variants={reduced ? undefined : heroCardV}
              className="absolute left-[10%] top-[14%] z-20 w-60"
            >
              <div className="rounded-lg border border-zinc-800 border-t-zinc-700/50 bg-[#111111] p-3 shadow-2xl shadow-black/50">
                <div className="flex items-center gap-2">
                  <Avatar initials="SJ" className="h-5 w-5 text-[8px]" />
                  <span className="text-[11px] font-medium text-zinc-200">
                    Sarah · Client
                  </span>
                  <span className="ml-auto text-[9px] text-zinc-500">2m</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                  Can the logo be bigger here?
                </p>
                <div className="mt-2">
                  <StatusChip label="Open" color={STATUS.open} />
                </div>
                <div className="mt-2 flex items-center justify-between rounded-md border border-zinc-800 bg-[#0A0A0A] px-2 py-1.5">
                  <span className="text-[9px] text-zinc-600">Reply…</span>
                  <Send className="h-2.5 w-2.5 text-zinc-600" />
                </div>
              </div>
            </motion.div>
          </div>
        </BrowserChrome>
      </motion.div>

      <p className="mt-5 text-center text-xs text-zinc-600">
        Your client sees the real site — and clicks anywhere to comment.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform pills — honest replacement for a customer logo strip
// ---------------------------------------------------------------------------

const PLATFORMS = [
  "WordPress",
  "Webflow",
  "Squarespace",
  "Showit",
  "Framer",
  "Any URL",
] as const;

export function PlatformPills() {
  return (
    <div className="mx-auto mt-16 max-w-2xl px-4 text-center">
      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
        Works with
      </p>
      <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {PLATFORMS.map((platform) => (
          <li
            key={platform}
            className="rounded-full border border-zinc-800 px-3.5 py-1.5 text-xs text-zinc-600"
          >
            {platform}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. DASHBOARD MINI — miniature Orvelle dashboard (static)
// ---------------------------------------------------------------------------

const MINI_PROJECTS = [
  { count: 3, hovered: false },
  { count: 1, hovered: true }, // frozen hover state
  { count: 5, hovered: false },
  { count: 2, hovered: false },
] as const;

export function DashboardMini({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative isolate", className)}>
      <Glow />
      <div className="flex overflow-hidden rounded-xl border border-zinc-800 border-t-zinc-700/50 bg-[#0A0A0A] shadow-2xl shadow-black/50">
        {/* Sidebar sliver */}
        <div className="w-12 shrink-0 border-r border-zinc-800 bg-[#111111] px-3 py-3.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[7px] font-bold text-[#0A0A0A]">
            R
          </span>
          <div className="mt-4 space-y-2.5">
            <div className="h-1.5 w-6 rounded bg-zinc-600" />
            <div className="h-1.5 w-5 rounded bg-zinc-800" />
            <div className="h-1.5 w-6 rounded bg-zinc-800" />
            <div className="h-1.5 w-4 rounded bg-zinc-800" />
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-zinc-500">
              Projects
            </span>
            <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[8px] font-semibold text-[#0A0A0A]">
              + New
            </span>
          </div>

          {/* 2×2 project card grid */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {MINI_PROJECTS.map(({ count, hovered }, i) => (
              <div
                key={i}
                className={cn(
                  "relative rounded-lg border bg-[#111111] p-2",
                  hovered ? "border-zinc-600" : "border-zinc-800",
                )}
              >
                {/* open-comment count badge */}
                <span
                  className="absolute -right-1.5 -top-1.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-bold text-white"
                  style={{ background: STATUS.open }}
                >
                  {count}
                </span>
                {/* thumbnail block */}
                <div className="space-y-1 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-2">
                  <div className="h-1 w-1/2 rounded bg-zinc-800" />
                  <div className="h-1 w-3/4 rounded bg-zinc-800" />
                  <div className="h-2.5 w-full rounded-sm bg-zinc-800/60" />
                </div>
                {/* name + meta bars */}
                <div className="mt-2 h-1.5 w-3/5 rounded bg-zinc-700" />
                <div className="mt-1 h-1 w-2/5 rounded bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. COMMENT THREAD CARD — floating, slightly tilted
// ---------------------------------------------------------------------------

export function CommentThreadCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("relative isolate w-80 max-w-full", className)}
    >
      <Glow />
      <div className="rotate-1 rounded-xl border border-zinc-800 border-t-zinc-700/50 bg-[#0A0A0A] p-4 shadow-2xl shadow-black/50">
        {/* Top-level comment */}
        <div className="flex items-center gap-2">
          <Avatar initials="SJ" />
          <span className="text-xs font-medium text-zinc-200">
            Sarah · Client
          </span>
          <span className="ml-auto text-[10px] text-zinc-500">2h ago</span>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
          Can we try the serif headline we talked about? This one feels a bit
          plain.
        </p>

        {/* Status dropdown */}
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: STATUS.inProgress }}
          />
          <span className="text-[10px] font-medium text-zinc-300">
            In Progress
          </span>
          <ChevronDown className="h-3 w-3 text-zinc-600" />
        </div>

        {/* Indented reply */}
        <div className="ml-1 mt-3.5 border-l border-zinc-800 pl-3.5">
          <div className="flex items-center gap-2">
            <Avatar muted className="h-5 w-5" />
            <span className="text-[11px] font-medium text-zinc-300">
              You · Designer
            </span>
            <span className="ml-auto text-[10px] text-zinc-500">45m ago</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            Good shout — swapping it in now.
          </p>
        </div>

        {/* Reply input */}
        <div className="mt-3.5 flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2">
          <span className="flex-1 text-[10px] text-zinc-600">
            Reply to Sarah…
          </span>
          <Send className="h-3 w-3 text-zinc-500" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. STATUS FLOW STRIP — Open → In Progress → Resolved
// ---------------------------------------------------------------------------

function FlowPill({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-800 border-t-zinc-700/50 bg-[#111111] px-3.5 py-1.5 text-xs font-medium text-zinc-300 shadow-lg shadow-black/30">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}55` }}
      />
      {label}
    </span>
  );
}

function FlowLine() {
  return (
    <svg
      aria-hidden
      className="h-px w-8 shrink-0 sm:w-16"
      viewBox="0 0 64 1"
      preserveAspectRatio="none"
    >
      <line x1="0" y1="0.5" x2="64" y2="0.5" stroke="#27272A" strokeWidth="1" />
      <line
        x1="0"
        y1="0.5"
        x2="64"
        y2="0.5"
        stroke="#52525B"
        strokeWidth="1"
        strokeDasharray="4 4"
        className="motion-safe:animate-dash-flow"
      />
    </svg>
  );
}

export function StatusFlowStrip({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative isolate flex items-center justify-center",
        className,
      )}
    >
      <Glow className="-inset-y-12" />
      <FlowPill label="Open" color={STATUS.open} />
      <FlowLine />
      <FlowPill label="In Progress" color={STATUS.inProgress} />
      <FlowLine />
      <FlowPill label="Resolved" color={STATUS.resolved} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. SHARE LINK — copy-link pill with cursor + "Copied" toast choreography
// ---------------------------------------------------------------------------

const cursorV: Variants = {
  hidden: { opacity: 0, x: -112, y: 64, scale: 1 },
  visible: {
    opacity: [0, 1, 1, 1, 1, 1],
    x: [-112, -112, 0, 0, 0, 0],
    y: [64, 64, 0, 0, 0, 0],
    scale: [1, 1, 1, 1, 0.8, 1],
    transition: {
      duration: 1.8,
      delay: 0.4,
      times: [0, 0.12, 0.55, 0.68, 0.78, 0.9],
      ease: "easeInOut",
    },
  },
};

const copyButtonV: Variants = {
  hidden: { scale: 1 },
  visible: {
    scale: [1, 1, 0.95, 1],
    transition: { duration: 1.8, delay: 0.4, times: [0, 0.68, 0.78, 0.88] },
  },
};

const toastV: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut", delay: 1.85 },
  },
};

export function ShareLinkIllustration({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const rootProps = reduced
    ? {}
    : ({ initial: "hidden", whileInView: "visible", viewport } as const);

  return (
    <motion.div
      aria-hidden
      className={cn("relative isolate mx-auto w-fit", className)}
      {...rootProps}
    >
      <Glow className="-inset-x-16 -inset-y-12" />

      {/* "Copied" toast — final state shown statically under reduced motion */}
      <motion.div
        variants={reduced ? undefined : toastV}
        className="absolute -top-10 right-0 z-10 flex items-center gap-1.5 rounded-md border border-zinc-800 bg-[#18181B] px-2.5 py-1.5 text-[10px] font-medium text-zinc-200 shadow-xl shadow-black/40"
      >
        <Check className="h-3 w-3 text-zinc-200" />
        Copied
      </motion.div>

      {/* Share-link input pill */}
      <div className="relative flex items-center gap-3 rounded-lg border border-zinc-800 border-t-zinc-700/50 bg-[#111111] py-2 pl-4 pr-2 shadow-2xl shadow-black/50">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
        <span className="font-mono text-xs text-zinc-300">
          orvelle.com/r/x7Kp2mQa
        </span>
        <motion.span
          variants={reduced ? undefined : copyButtonV}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900"
        >
          <Copy className="h-3 w-3 text-zinc-400" />
        </motion.span>

        {/* Cursor dot — omitted entirely under reduced motion */}
        {reduced ? null : (
          <motion.span
            variants={cursorV}
            className="absolute right-4 top-1/2 z-20 -mt-1.5 h-3 w-3 rounded-full border border-white/70 bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)]"
          />
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// 6. BEFORE/AFTER SPLIT — email chaos vs one pinned comment
// ---------------------------------------------------------------------------

const strikeV: Variants = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: 0.6, ease: "easeOut", delay: 0.5 },
  },
};

const EMAIL_FRAGMENTS = [
  { text: "“the thing on page 2…”", className: "-rotate-2" },
  { text: "“see attached screenshot”", className: "ml-10 rotate-1" },
  { text: "“as discussed on the call”", className: "ml-3 -rotate-1" },
] as const;

export function BeforeAfterSplit({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const rootProps = reduced
    ? {}
    : ({ initial: "hidden", whileInView: "visible", viewport } as const);

  return (
    <motion.div
      aria-hidden
      className={cn("relative isolate grid gap-4 sm:grid-cols-2", className)}
      {...rootProps}
    >
      <Glow />

      {/* Before — fragmented email feedback */}
      <div className="rounded-xl border border-zinc-800 border-t-zinc-700/50 bg-[#0A0A0A] p-5 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
          <Mail className="h-3 w-3" />
          Email feedback
        </div>
        <div className="relative mt-6 pb-1">
          {EMAIL_FRAGMENTS.map(({ text, className: fragmentClass }, i) => (
            <div
              key={text}
              className={cn(
                "w-fit rounded-lg border border-zinc-800 bg-[#111111] px-3 py-2 text-xs text-zinc-600 shadow-md shadow-black/30",
                i > 0 && "-mt-1.5",
                fragmentClass,
              )}
            >
              {text}
            </div>
          ))}
          {/* Strikethrough sweeps across the pile on reveal */}
          <motion.span
            variants={reduced ? undefined : strikeV}
            className="absolute left-0 right-3 top-1/2 h-px origin-left bg-zinc-500"
          />
        </div>
      </div>

      {/* After — one clean pinned comment */}
      <div className="rounded-xl border border-zinc-800 border-t-zinc-700/50 bg-[#0A0A0A] p-5 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-300">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-200 text-[7px] font-bold text-[#0A0A0A]">
            O
          </span>
          Orvelle
        </div>
        <div className="mt-6">
          <div className="relative w-fit rounded-lg border border-zinc-800 border-t-zinc-700/50 bg-[#111111] p-3 pl-4 shadow-2xl shadow-black/50">
            <PinDot n={1} className="absolute -left-2 -top-2" />
            <div className="flex items-center gap-2">
              <Avatar initials="SJ" className="h-5 w-5 text-[8px]" />
              <span className="text-[11px] font-medium text-zinc-200">
                Sarah · Client
              </span>
              <span className="ml-3 text-[9px] text-zinc-500">2m</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              Swap this for the team photo we sent over.
            </p>
            <div className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[9px] text-zinc-500">
              <MapPin className="h-2.5 w-2.5" />
              Pinned · /about · 412,318
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
