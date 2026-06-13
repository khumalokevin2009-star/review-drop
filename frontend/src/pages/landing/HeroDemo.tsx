/**
 * Hero ambient demo — a code-built, high-fidelity miniature of the REAL Orvelle
 * review canvas reviewing a believable client website (Linear's "show the real
 * product" hero). A light, detailed mock site ("Aurora") sits inside the dark
 * Orvelle shell; the contrast — light page, dark toolbar/sidebar, indigo pins —
 * is exactly how the real canvas looks, and is what sells the realism.
 *
 * Endless loop (phase state machine, unchanged choreography):
 *   cursor → clicks the logo → indigo pin 1 drops → the real comment popover
 *   opens and types "Logo feels too small here" → thread 1 fills into the
 *   populated sidebar inbox as OPEN → cursor drags an indigo region over the
 *   feature row → pin 2 lands → thread 1 ticks to RESOLVED → crossfade → repeat.
 *
 * Mirrors the real surfaces (CanvasView toolbar/sidebar, NewCommentPopover, the
 * proxy agent's pin/region, the real StatusBadge component). The OUTER frame
 * (chrome bar + aspect-[16/10] canvas + w-44 sidebar) is held identical to
 * Landing's DemoPlaceholder so lazy-mount can't shift layout. The light site
 * is sized in container-query units (cqw) so it scales like a screenshot at any
 * width without measurement JS. Under reduced motion a single fully-composed
 * static scene renders. Lazy-imported by Landing.tsx after first paint.
 */
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { ArrowLeft, Link2, Lock, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { cn } from "@/lib/utils";
import type { CommentStatus } from "@/types";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// The fake client brand's accent — one warm colour, distinct from Orvelle indigo.
const ACCENT = "#F2663B";
const ACCENT_TINT = "#FDEAE1";
const PIN = "#6366F1"; // Orvelle indigo — pins pop against the white client site.

// ---------------------------------------------------------------------------
// Phase machine (unchanged choreography)
// ---------------------------------------------------------------------------

const PHASES = [
  ["rest", 600],
  ["cursorA", 850],
  ["click", 300],
  ["pinA", 480],
  ["popover", 320],
  ["typing", 1450],
  ["hold1", 750],
  ["cursorB", 850],
  ["drag", 950],
  ["pinB", 550],
  ["resolve", 1000],
  ["hold2", 1200],
  ["fade", 550],
] as const;

type Phase = (typeof PHASES)[number][0];

const INDEX: Record<Phase, number> = Object.fromEntries(
  PHASES.map(([name], i) => [name, i]),
) as Record<Phase, number>;

const COMMENT_TEXT = "Logo feels too small here";

// Cursor waypoints, % of the canvas SITE AREA (below the toolbar). Pin 1 lands
// on the client logo (top-left); the region is dragged over the feature row.
const CURSOR = {
  rest: { left: "93%", top: "94%" },
  pointA: { left: "7.5%", top: "8%" },
  pointB: { left: "7%", top: "78%" },
  dragEnd: { left: "61%", top: "93%" },
} as const;

// Region-select geometry over the feature row, % of the canvas site area.
const REGION = { left: 5, top: 76, width: 56, height: 17 } as const;

// ---------------------------------------------------------------------------
// Scene fragments
// ---------------------------------------------------------------------------

/** The real CanvasView toolbar, scaled. Comment is the active segment. */
function Toolbar() {
  return (
    <div
      className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0C0D0F] px-2.5 py-1.5"
      aria-hidden="true"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#A1A1AA]">
          <ArrowLeft className="h-3 w-3" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold leading-tight text-[#FAFAFA]">
            Aurora — Homepage{" "}
            <span className="font-normal text-[#A1A1AA]">· Round 1</span>
          </p>
          <p className="truncate font-mono text-[8px] leading-tight text-[#8A8A93]">
            /
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex rounded-md border border-white/[0.08] p-0.5">
          <span className="rounded px-1.5 py-0.5 text-[8px] font-medium text-[#A1A1AA]">
            Browse
          </span>
          <span className="rounded bg-[#6366F1] px-1.5 py-0.5 text-[8px] font-medium text-white">
            Comment
          </span>
        </div>
        <span className="hidden items-center gap-1 rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[8px] font-medium text-[#A1A1AA] sm:inline-flex">
          <Link2 className="h-2.5 w-2.5" />
          Share
        </span>
      </div>
    </div>
  );
}

/**
 * The "client website" under review — a believable light landing page. Sized in
 * container-query units so it scales like a real screenshot. Decorative only.
 */
function MockClientSite() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col bg-gradient-to-b from-white to-[#F6F8FA] [container-type:inline-size]"
    >
      {/* nav */}
      <nav className="flex shrink-0 items-center justify-between border-b border-[#EEF1F4] px-[4cqw] py-[1.6cqw]">
        <div className="flex items-center gap-[1.1cqw]">
          <div
            className="h-[2.8cqw] w-[2.8cqw] rounded-[0.8cqw]"
            style={{ backgroundColor: ACCENT }}
          />
          <span className="text-[2cqw] font-semibold tracking-tight text-[#0F172A]">
            Aurora
          </span>
        </div>
        <div className="flex items-center gap-[2.6cqw]">
          {["Product", "Features", "Pricing", "About"].map((l) => (
            <span key={l} className="text-[1.5cqw] font-medium text-[#475569]">
              {l}
            </span>
          ))}
          <span
            className="rounded-[0.9cqw] px-[1.8cqw] py-[0.8cqw] text-[1.5cqw] font-semibold text-white"
            style={{ backgroundColor: ACCENT }}
          >
            Get started
          </span>
        </div>
      </nav>

      {/* hero */}
      <div className="flex min-h-0 flex-1 items-center gap-[3cqw] px-[4cqw] py-[2cqw]">
        <div className="flex w-[52%] flex-col">
          <span
            className="mb-[1.4cqw] inline-flex w-fit items-center gap-[0.8cqw] rounded-full px-[1.4cqw] py-[0.6cqw] text-[1.3cqw] font-medium"
            style={{ backgroundColor: ACCENT_TINT, color: ACCENT }}
          >
            <span
              className="h-[1cqw] w-[1cqw] rounded-full"
              style={{ backgroundColor: ACCENT }}
            />
            Aurora 2.0 is here
          </span>
          <h2 className="text-[4.2cqw] font-semibold leading-[1.08] tracking-[-0.02em] text-[#0F172A]">
            Build a brand your customers remember
          </h2>
          <p className="mt-[1.6cqw] text-[1.7cqw] leading-relaxed text-[#64748B]">
            The all-in-one studio for modern teams to design, launch, and grow —
            without the busywork.
          </p>
          <div className="mt-[2.4cqw] flex items-center gap-[1.3cqw]">
            <span
              className="rounded-[0.9cqw] px-[2.2cqw] py-[1cqw] text-[1.6cqw] font-semibold text-white shadow-sm"
              style={{ backgroundColor: ACCENT }}
            >
              Start free
            </span>
            <span className="rounded-[0.9cqw] border border-[#D8DDE3] px-[2.2cqw] py-[1cqw] text-[1.6cqw] font-semibold text-[#334155]">
              Book a demo
            </span>
          </div>
          <div className="mt-[2.2cqw] flex items-center gap-[1.1cqw]">
            <div className="flex -space-x-[0.7cqw]">
              {["#FBBF24", "#34D399", "#60A5FA", "#F472B6"].map((c) => (
                <span
                  key={c}
                  className="h-[2cqw] w-[2cqw] rounded-full border-[0.3cqw] border-white"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <span className="text-[1.2cqw] text-[#94A3B8]">
              Trusted by 2,000+ teams
            </span>
          </div>
        </div>

        {/* hero visual — a polished product-shot card */}
        <div
          className="relative h-[82%] w-[48%] overflow-hidden rounded-[1.6cqw] border border-[#EAEDF1]"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}1A, #F4F7FA 62%)`,
          }}
        >
          <div className="absolute left-[8%] top-[11%] h-[15%] w-[42%] rounded-[1.1cqw] bg-white shadow-sm" />
          <div className="absolute left-[8%] top-[33%] h-[7%] w-[66%] rounded-full bg-white/85" />
          <div className="absolute left-[8%] top-[45%] h-[7%] w-[52%] rounded-full bg-white/70" />
          <div
            className="absolute bottom-[9%] left-[8%] h-[24%] w-[37%] rounded-[1.1cqw] shadow-sm"
            style={{ backgroundColor: ACCENT }}
          />
          <div className="absolute bottom-[9%] right-[8%] h-[36%] w-[40%] rounded-[1.1cqw] bg-white shadow-sm" />
        </div>
      </div>

      {/* feature row */}
      <div className="grid shrink-0 grid-cols-3 gap-[2.4cqw] border-t border-[#EEF1F4] px-[4cqw] py-[2.2cqw]">
        {[
          ["Fast by default", "Ship polished pages in minutes, not weeks."],
          ["Made to scale", "From first launch to millions of visits."],
          ["Truly yours", "Own every pixel of your brand, end to end."],
        ].map(([title, desc]) => (
          <div key={title} className="flex flex-col gap-[0.8cqw]">
            <div
              className="flex h-[3.2cqw] w-[3.2cqw] items-center justify-center rounded-[1cqw]"
              style={{ backgroundColor: ACCENT_TINT }}
            >
              <div
                className="h-[1.3cqw] w-[1.3cqw] rounded-[0.4cqw]"
                style={{ backgroundColor: ACCENT }}
              />
            </div>
            <span className="text-[1.6cqw] font-semibold text-[#0F172A]">
              {title}
            </span>
            <span className="text-[1.3cqw] leading-snug text-[#64748B]">
              {desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The real agent pin marker: a 24px indigo circle with a white ring and white
 * number, dropped with a spring. Pops against the light client site.
 */
function Pin({
  n,
  left,
  top,
  show,
  instant,
}: {
  n: number;
  left: string;
  top: string;
  show: boolean;
  instant: boolean;
}) {
  if (!show) return null;
  return (
    <motion.div
      initial={instant ? false : { scale: 0, y: -14, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className="absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[12px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
      style={{ left, top, backgroundColor: PIN }}
    >
      {n}
    </motion.div>
  );
}

/** NewCommentPopover, scaled: the textarea types the comment in. */
function Popover({
  show,
  typed,
  done,
  instant,
}: {
  show: boolean;
  typed: string;
  done: boolean;
  instant: boolean;
}) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={instant ? false : { opacity: 0, scale: 0.96, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="absolute z-30 w-[42%] max-w-[212px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0C0D0F] shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
          style={{ left: "12%", top: "15%", transformOrigin: "top left" }}
        >
          <p className="min-h-[30px] px-2.5 pb-1 pt-2 text-[10px] leading-snug text-[#FAFAFA]">
            {typed.length ? (
              typed
            ) : (
              <span className="text-[#8A8A93]">Leave your feedback…</span>
            )}
            {!done ? (
              <span className="ml-px inline-block h-[10px] w-px translate-y-[1.5px] bg-white/70 align-middle" />
            ) : null}
          </p>
          <div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-0.5">
            <span className="pl-0.5 text-[8px] text-[#8A8A93]">⌘↵ to send</span>
            <div className="flex items-center gap-1">
              <span className="rounded px-1.5 py-0.5 text-[8px] font-medium text-[#A1A1AA]">
                Cancel
              </span>
              <span className="rounded bg-[#6366F1] px-1.5 py-0.5 text-[8px] font-medium text-white">
                Comment
              </span>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** One row of the real CanvasView sidebar inbox (or its skeleton). */
function SidebarRow({
  n,
  author,
  initials,
  body,
  time,
  status,
  show,
  instant,
}: {
  n: number;
  author: string;
  initials: string;
  body: string;
  time: string;
  status: CommentStatus;
  show: boolean;
  instant: boolean;
}) {
  return (
    <div className="flex gap-2 px-2.5 py-2">
      <span
        className={cn(
          "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none",
          show ? "bg-[#6366F1] text-white" : "bg-white/[0.07] text-transparent",
        )}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        {show ? (
          <>
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#6366F1]/15 text-[7px] font-semibold text-[#A5B4FC]">
                  {initials}
                </span>
                <span className="truncate text-[10px] font-medium text-[#FAFAFA]">
                  {author}
                </span>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={status}
                  initial={instant ? false : { opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  transition={{ duration: 0.22, ease: EASE }}
                >
                  <StatusBadge status={status} className="text-[8px]" />
                </motion.span>
              </AnimatePresence>
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#A1A1AA]">
              {body}
            </p>
            <span className="mt-0.5 block font-mono text-[8px] text-[#8A8A93]">
              {time}
            </span>
          </>
        ) : (
          <div className="space-y-1.5 py-1">
            <div className="h-1.5 w-2/3 rounded-sm bg-white/[0.07]" />
            <div className="h-1.5 w-5/6 rounded-sm bg-white/[0.05]" />
          </div>
        )}
      </div>
    </div>
  );
}

/** The real CanvasView <aside>, scaled and populated like a working inbox. */
function Sidebar({
  showA,
  showB,
  resolved,
  instant,
}: {
  showA: boolean;
  showB: boolean;
  resolved: boolean;
  instant: boolean;
}) {
  return (
    <div className="hidden w-44 shrink-0 flex-col border-l border-white/[0.08] bg-[#0C0D0F] md:flex">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-3 pb-2 pt-2.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8A8A93]">
          Comments
        </span>
        <span className="rounded-full bg-white/[0.06] px-1.5 text-[8px] font-medium text-[#A1A1AA]">
          3
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] px-2.5 py-1.5">
        {["All", "Open", "In progress", "Resolved"].map((f, i) => (
          <span
            key={f}
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
              i === 0 ? "bg-[#6366F1] text-white" : "text-[#A1A1AA]",
            )}
          >
            {f}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 divide-y divide-white/[0.08] overflow-hidden">
        <SidebarRow
          n={1}
          author="Sarah Chen"
          initials="SC"
          body="Logo feels too small here"
          time="2m ago"
          status={resolved ? "resolved" : "open"}
          show={showA}
          instant={instant}
        />
        <SidebarRow
          n={2}
          author="Sarah Chen"
          initials="SC"
          body="Tighten this section spacing"
          time="just now"
          status="open"
          show={showB}
          instant={instant}
        />
        <SidebarRow
          n={3}
          author="Mike Ross"
          initials="MR"
          body="Love the new CTA colour 👌"
          time="1h ago"
          status="resolved"
          show
          instant={instant}
        />
      </div>
      <div className="mt-auto flex items-center gap-1.5 border-t border-white/[0.08] px-2.5 py-1.5 text-[9px] text-[#A1A1AA]">
        <span
          className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-[3px] border border-[#6366F1] bg-[#6366F1]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none">
            <path
              d="M2 5.2 L4.2 7.4 L8 3"
              stroke="white"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <MessageSquare className="h-2.5 w-2.5 shrink-0" />
        Show resolved
      </div>
    </div>
  );
}

/** SVG arrow cursor. */
function Cursor({
  left,
  top,
  duration,
}: {
  left: string;
  top: string;
  duration: number;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ left, top }}
      transition={{ duration, ease: EASE }}
      className="absolute z-40"
      style={{ left: CURSOR.rest.left, top: CURSOR.rest.top }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]"
        fill="none"
      >
        <path d="M3 1.5 L13 8.2 L8.4 9.3 L6.2 14 Z" fill="white" stroke="black" strokeWidth={0.75} />
      </svg>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The demo
// ---------------------------------------------------------------------------

export default function HeroDemo() {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");

  const [phase, phaseDuration] = PHASES[idx] ?? PHASES[0];
  const after = (p: Phase) => idx >= INDEX[p];

  // Advance the phase machine. Each phase owns its duration; "fade" wraps to 0.
  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => {
      setIdx((i) => (i + 1) % PHASES.length);
    }, phaseDuration);
    return () => clearTimeout(timer);
  }, [idx, phaseDuration, reduced]);

  // Reset the typed comment at the top of each loop (kept out of the setIdx
  // updater — updaters must stay pure under StrictMode).
  useEffect(() => {
    if (phase === "rest") setTyped("");
  }, [phase]);

  // Typewriter for the comment body.
  useEffect(() => {
    if (reduced || phase !== "typing") return;
    const interval = setInterval(() => {
      setTyped((t) =>
        t.length < COMMENT_TEXT.length ? COMMENT_TEXT.slice(0, t.length + 1) : t,
      );
    }, 48);
    return () => clearInterval(interval);
  }, [phase, reduced]);

  // Region-select drag: animate width/height motion values.
  const regionW = useMotionValue(0);
  const regionH = useMotionValue(0);
  const regionWPct = useTransform(regionW, (w) => `${w}%`);
  const regionHPct = useTransform(regionH, (h) => `${h}%`);

  useEffect(() => {
    if (reduced) return;
    if (phase === "drag") {
      const aw = animate(regionW, REGION.width, { duration: 0.9, ease: EASE });
      const ah = animate(regionH, REGION.height, { duration: 0.9, ease: EASE });
      return () => {
        aw.stop();
        ah.stop();
      };
    }
    if (phase === "rest") {
      regionW.set(0);
      regionH.set(0);
    }
    return undefined;
  }, [phase, reduced, regionW, regionH]);

  // Static composed scene for reduced motion: a fully-populated frame — both
  // pins placed, region drawn, the comment written, the sidebar inbox filled.
  const isStatic = Boolean(reduced);

  const cursorTarget =
    phase === "cursorA" ||
    phase === "click" ||
    phase === "pinA" ||
    phase === "popover" ||
    phase === "typing" ||
    phase === "hold1"
      ? CURSOR.pointA
      : phase === "cursorB"
        ? CURSOR.pointB
        : phase === "drag" ||
            phase === "pinB" ||
            phase === "resolve" ||
            phase === "hold2" ||
            phase === "fade"
          ? CURSOR.dragEnd
          : CURSOR.rest;
  const cursorDuration = phase === "cursorA" || phase === "cursorB" ? 0.85 : 0.9;

  const showPinA = isStatic || after("pinA");
  const showPinB = isStatic || after("pinB");
  // Static renders the loop's settled END state: comment submitted (popover
  // closed) and thread 1 resolved — a coherent screenshot, not a mid-edit
  // moment with a compose popover hanging over an already-resolved comment.
  const showPopover = !isStatic && after("popover") && !after("cursorB");
  const popoverText = isStatic ? COMMENT_TEXT : typed;
  const typingDone = isStatic || popoverText.length === COMMENT_TEXT.length;
  const showRegion = isStatic || after("drag");
  const resolved = isStatic || after("resolve");

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0A0B0D]"
      role="img"
      aria-label="Animated demo of the Orvelle review canvas reviewing a client website: a client clicks the logo to drop a numbered comment pin, a feedback popover types in, the thread fills the sidebar inbox, a region is selected for a second pin, and the first thread is marked resolved"
    >
      {/* browser chrome */}
      <div className="flex h-9 items-center border-b border-white/[0.08] px-3.5">
        <div className="flex w-16 items-center gap-2" aria-hidden="true">
          <span className="h-[11px] w-[11px] rounded-full bg-[#FF5F57]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#FEBC2E]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#28C840]" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-white/[0.05] px-3 py-1 font-mono text-[10px] text-[#A1A1AA]">
          <Lock className="h-2.5 w-2.5 text-[#8A8A93]" />
          orvellehq.com/r/x7k2m9
        </div>
        <div className="w-16" aria-hidden="true" />
      </div>

      <div className="relative flex">
        {/* canvas column: real toolbar + the light client site with overlays */}
        <div className="relative flex aspect-[16/10] min-w-0 flex-1 flex-col bg-[#0C0D0F]">
          <Toolbar />

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <MockClientSite />

            {/* click ripple at point A — spans two phases so the fade completes */}
            {!isStatic && (phase === "click" || phase === "pinA") ? (
              <motion.span
                initial={{ scale: 0.3, opacity: 0.9 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#6366F1]/70"
                style={{ left: CURSOR.pointA.left, top: CURSOR.pointA.top }}
                aria-hidden="true"
              />
            ) : null}

            <Pin
              n={1}
              left={CURSOR.pointA.left}
              top={CURSOR.pointA.top}
              show={showPinA}
              instant={isStatic}
            />
            <Popover
              show={showPopover}
              typed={popoverText}
              done={typingDone}
              instant={isStatic}
            />

            {/* region-select rectangle (real agent styling) */}
            {showRegion ? (
              <motion.div
                className="absolute z-10 rounded-[2px] border-[1.5px] border-[#6366F1] bg-[rgba(99,102,241,0.10)]"
                style={
                  isStatic
                    ? {
                        left: `${REGION.left}%`,
                        top: `${REGION.top}%`,
                        width: `${REGION.width}%`,
                        height: `${REGION.height}%`,
                      }
                    : {
                        left: `${REGION.left}%`,
                        top: `${REGION.top}%`,
                        width: regionWPct,
                        height: regionHPct,
                      }
                }
                aria-hidden="true"
              />
            ) : null}

            <Pin
              n={2}
              left={`${REGION.left}%`}
              top={`${REGION.top}%`}
              show={showPinB}
              instant={isStatic}
            />

            {!isStatic ? (
              <Cursor
                left={cursorTarget.left}
                top={cursorTarget.top}
                duration={cursorDuration}
              />
            ) : null}
          </div>
        </div>

        {/* the real sidebar inbox — hidden on small screens to keep it legible */}
        <Sidebar
          showA={showPinA}
          showB={showPinB}
          resolved={resolved}
          instant={isStatic}
        />

        {/* crossfade between loops — covers canvas AND sidebar so the
            thread-state reset is never visible */}
        {!isStatic ? (
          <motion.div
            initial={false}
            animate={{ opacity: phase === "fade" ? 1 : 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="pointer-events-none absolute inset-0 z-50 bg-[#0B0C0E]"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}
