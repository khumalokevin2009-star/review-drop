/**
 * Hero ambient demo — a code-built browser-frame mockup of Orvelle running an
 * endless review loop: cursor clicks → pin 1 drops + comment types in → drag
 * region-select → pin 2 lands → sidebar thread resolves → crossfade, repeat.
 *
 * Driven by a phase state machine (setTimeout chain) so every actor reads its
 * cue from a single source of truth. Geometry is percentage-based inside the
 * canvas so the whole scene scales with the hero. Under reduced motion the
 * loop never starts and a fully-composed static scene renders instead.
 *
 * This file is lazy-imported by Landing.tsx after first paint.
 */
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { useEffect, useState } from "react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ---------------------------------------------------------------------------
// Phase machine
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

// Cursor waypoints, % of the canvas.
const CURSOR = {
  rest: { left: "92%", top: "96%" },
  pointA: { left: "62%", top: "26%" },
  pointB: { left: "37%", top: "60%" },
  dragEnd: { left: "63%", top: "82%" },
} as const;

// Region-select geometry, % of the canvas.
const REGION = { left: 37, top: 60, width: 26, height: 22 } as const;

// ---------------------------------------------------------------------------
// Scene fragments
// ---------------------------------------------------------------------------

/** Greyscale wireframe of the client site under review. */
function WireframeSite() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {/* site header */}
      <div className="absolute inset-x-0 top-0 flex h-[9%] items-center justify-between border-b border-white/[0.07] px-[3%]">
        <div className="h-[28%] w-[9%] rounded-sm bg-white/10" />
        <div className="flex w-[30%] items-center justify-end gap-[8%]">
          <div className="h-[18%] w-[22%] min-h-[3px] rounded-sm bg-white/[0.08]" />
          <div className="h-[18%] w-[22%] min-h-[3px] rounded-sm bg-white/[0.08]" />
          <div className="h-[18%] w-[22%] min-h-[3px] rounded-sm bg-white/[0.08]" />
        </div>
      </div>
      {/* hero copy block */}
      <div className="absolute left-[3%] top-[16%] w-[38%]">
        <div className="h-[7px] w-full rounded-sm bg-white/10" />
        <div className="mt-[6%] h-[7px] w-3/4 rounded-sm bg-white/10" />
        <div className="mt-[10%] h-[5px] w-5/6 rounded-sm bg-white/[0.06]" />
        <div className="mt-[4%] h-[5px] w-2/3 rounded-sm bg-white/[0.06]" />
        <div className="mt-[10%] h-[16px] w-[34%] rounded bg-white/10" />
      </div>
      {/* hero image block with wireframe cross */}
      <div className="absolute right-[3%] top-[14%] h-[32%] w-[50%] rounded border border-white/[0.09]">
        <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" fill="none">
          <line x1="0" y1="0" x2="100" y2="100" stroke="rgba(255,255,255,0.06)" vectorEffect="non-scaling-stroke" />
          <line x1="100" y1="0" x2="0" y2="100" stroke="rgba(255,255,255,0.06)" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      {/* three-card row */}
      {[3, 35.5, 68].map((left) => (
        <div
          key={left}
          className="absolute h-[36%] w-[29%] rounded border border-white/[0.07] p-[2%]"
          style={{ left: `${left}%`, top: "56%" }}
        >
          <div className="h-[22%] w-[55%] rounded-sm bg-white/[0.07]" />
          <div className="mt-[8%] h-[8%] w-[85%] rounded-sm bg-white/[0.05]" />
          <div className="mt-[5%] h-[8%] w-[70%] rounded-sm bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

/** Numbered indigo pin with a spring drop. */
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
      className="absolute z-20 flex h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#6366F1] text-[10px] font-semibold leading-none text-white shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
      style={{ left, top }}
    >
      {n}
    </motion.div>
  );
}

/** Comment popover anchored next to pin 1, with typing body text. */
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
          initial={instant ? false : { opacity: 0, scale: 0.92, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="absolute z-30 w-[34%] max-w-[230px] rounded-lg border border-white/10 bg-[#101113] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          style={{ left: "64.5%", top: "30%" }}
        >
          <div className="flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[8px] font-medium text-white/70">
              S
            </span>
            <span className="text-[10px] text-[#71717A]">Sarah · Client</span>
          </div>
          <p className="mt-1.5 min-h-[14px] text-[11px] leading-snug text-white/90">
            {typed}
            {!done ? (
              <span className="ml-px inline-block h-[11px] w-px translate-y-[2px] bg-white/70" />
            ) : null}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** One thread row in the Orvelle sidebar. */
function ThreadRow({
  n,
  title,
  resolved,
  show,
  instant,
}: {
  n: number;
  title: string;
  resolved: boolean;
  show: boolean;
  instant: boolean;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: show ? 1 : 0.25 }}
      transition={{ duration: 0.35 }}
      className="rounded-md border border-white/[0.07] p-2"
    >
      <div className="flex items-start gap-1.5">
        <span
          className={`mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold leading-none ${
            show ? "bg-[#6366F1] text-white" : "bg-white/10 text-white/40"
          }`}
        >
          {n}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] leading-tight text-white/80">
            {show ? title : "—"}
          </p>
          <div className="mt-1 flex h-[12px] items-center gap-1">
            <AnimatePresence mode="wait" initial={false}>
              {resolved ? (
                <motion.span
                  key="resolved"
                  initial={instant ? false : { opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.15em] text-white"
                >
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none">
                    <motion.path
                      d="M2 5.2 L4.2 7.4 L8 3"
                      stroke="white"
                      strokeWidth={1.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={instant ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.35, ease: EASE, delay: 0.1 }}
                    />
                  </svg>
                  Resolved
                </motion.span>
              ) : (
                <motion.span
                  key="open"
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.2 }}
                  className="font-mono text-[8px] uppercase tracking-[0.15em] text-[#71717A]"
                >
                  Open
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** SVG arrow cursor. */
function Cursor({ left, top, duration }: { left: string; top: string; duration: number }) {
  return (
    <motion.div
      initial={false}
      animate={{ left, top }}
      transition={{ duration, ease: EASE }}
      className="absolute z-40"
      style={{ left: CURSOR.rest.left, top: CURSOR.rest.top }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" fill="none">
        <path
          d="M3 1.5 L13 8.2 L8.4 9.3 L6.2 14 Z"
          fill="white"
          stroke="black"
          strokeWidth={0.75}
        />
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

  // Region-select drag: animate width/height motion values; derive the badge.
  const regionW = useMotionValue(0);
  const regionH = useMotionValue(0);
  const regionWPct = useTransform(regionW, (w) => `${w}%`);
  const regionHPct = useTransform(regionH, (h) => `${h}%`);
  // Synthetic but plausible px readout for the dimension badge.
  const dims = useTransform([regionW, regionH], (values) => {
    const [w, h] = values as [number, number];
    return `${Math.round(w * 7.2)} × ${Math.round(h * 5.4)}`;
  });

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

  // Static composed scene for reduced motion: everything placed, no timers.
  const isStatic = Boolean(reduced);

  const cursorTarget =
    phase === "cursorA" || phase === "click" || phase === "pinA" || phase === "popover" || phase === "typing" || phase === "hold1"
      ? CURSOR.pointA
      : phase === "cursorB"
        ? CURSOR.pointB
        : phase === "drag" || phase === "pinB" || phase === "resolve" || phase === "hold2" || phase === "fade"
          ? CURSOR.dragEnd
          : CURSOR.rest;
  const cursorDuration = phase === "cursorA" || phase === "cursorB" ? 0.85 : 0.9;

  const showPinA = isStatic || after("pinA");
  const showPinB = isStatic || after("pinB");
  const showPopover = isStatic || (after("popover") && !after("cursorB"));
  const popoverText = isStatic ? COMMENT_TEXT : typed;
  const typingDone = isStatic || popoverText.length === COMMENT_TEXT.length;
  const showRegion = isStatic || after("drag");
  const resolved = isStatic || after("resolve");

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0A0B0D]"
      role="img"
      aria-label="Animated demo of Orvelle: a client clicks the page to drop a numbered comment pin, drags to select a region, and the designer resolves the thread"
    >
      {/* browser chrome */}
      <div className="flex h-9 items-center gap-3 border-b border-white/[0.08] px-3.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-white/10" />
          <span className="h-2 w-2 rounded-full bg-white/10" />
          <span className="h-2 w-2 rounded-full bg-white/10" />
        </div>
        <div className="mx-auto rounded bg-white/[0.05] px-2.5 py-0.5 font-mono text-[10px] text-[#71717A]">
          orvellehq.com/r/x7k2m9
        </div>
        <div className="w-9" aria-hidden="true" />
      </div>

      <div className="relative flex">
        {/* review canvas */}
        <div className="relative aspect-[16/10] min-w-0 flex-1 bg-[#0C0D0F]">
          <WireframeSite />

          {/* click ripple at point A — spans two phases so the fade completes */}
          {!isStatic && (phase === "click" || phase === "pinA") ? (
            <motion.span
              initial={{ scale: 0.3, opacity: 0.9 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50"
              style={{ left: CURSOR.pointA.left, top: CURSOR.pointA.top }}
              aria-hidden="true"
            />
          ) : null}

          <Pin n={1} left={CURSOR.pointA.left} top={CURSOR.pointA.top} show={showPinA} instant={isStatic} />
          <Popover show={showPopover} typed={popoverText} done={typingDone} instant={isStatic} />

          {/* region-select rectangle + live dimension badge */}
          {showRegion ? (
            <motion.div
              className="absolute z-10 border border-dashed border-white/40 bg-white/[0.03]"
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
            >
              <span className="absolute -bottom-5 right-0 rounded-sm bg-white/10 px-1 py-px font-mono text-[8px] tabular-nums text-white/70">
                {isStatic ? (
                  `${Math.round(REGION.width * 7.2)} × ${Math.round(REGION.height * 5.4)}`
                ) : (
                  <motion.span>{dims}</motion.span>
                )}
              </span>
            </motion.div>
          ) : null}

          <Pin n={2} left={`${REGION.left}%`} top={`${REGION.top}%`} show={showPinB} instant={isStatic} />

          {!isStatic ? (
            <Cursor left={cursorTarget.left} top={cursorTarget.top} duration={cursorDuration} />
          ) : null}
        </div>

        {/* Orvelle sidebar — hidden on small screens to keep the demo legible */}
        <div className="hidden w-44 shrink-0 flex-col gap-2 border-l border-white/[0.08] p-3 md:flex">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#52525B]">
            Comments
          </span>
          <ThreadRow n={1} title="Logo feels too small" resolved={resolved} show={showPinA} instant={isStatic} />
          <ThreadRow n={2} title="Tighten this section" resolved={false} show={showPinB} instant={isStatic} />
          <div className="mt-auto rounded-md border border-white/[0.05] p-2" aria-hidden="true">
            <div className="h-1.5 w-3/4 rounded-sm bg-white/[0.05]" />
            <div className="mt-1.5 h-1.5 w-1/2 rounded-sm bg-white/[0.05]" />
          </div>
        </div>

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
