/**
 * Blueprint figures for the landing page — Linear-style "FIG" wireframe
 * illustrations (1px strokes, white/15 base) and the small feature-grid
 * glyphs. Figures draw in on scroll (pathLength 0 → 1); under reduced motion
 * they render fully drawn and static.
 *
 * Two deliberate deviations from the strict "white/15, no fills" treatment,
 * matching the Linear reference figures: a single brighter accent tier
 * (white/35) marks each figure's key element, and pin markers keep a small
 * solid indigo centre — pins are the sanctioned indigo element inside
 * product visuals.
 */
import { motion, useReducedMotion, type Variants } from "framer-motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const STROKE = "rgba(255,255,255,0.15)";
const STROKE_BRIGHT = "rgba(255,255,255,0.35)";
const INDIGO = "#6366F1";

/** Stroke draw-in, staggered by the `custom` index. */
const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: (i: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 1.2, ease: EASE, delay: i * 0.12 },
      opacity: { duration: 0.25, delay: i * 0.12 },
    },
  }),
};

/** Plain fade for elements that can't draw (dashed strokes, filled dots). */
const fade: Variants = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { duration: 0.5, ease: EASE, delay: i * 0.12 + 0.5 },
  }),
};

function FigSvg({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 240 180"
      fill="none"
      role="img"
      aria-label={label}
      className="h-44 w-full"
      initial={reduced ? "visible" : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
    >
      {children}
    </motion.svg>
  );
}

const strokeProps = {
  stroke: STROKE,
  strokeWidth: 1,
  vectorEffect: "non-scaling-stroke",
} as const;

// ---------------------------------------------------------------------------
// FIG 0.1 — pin dropping onto a layered page plane ("Click anywhere")
// ---------------------------------------------------------------------------

export function FigClickAnywhere() {
  return (
    <FigSvg label="A comment pin dropping onto a layered page plane">
      {/* three stacked isometric planes */}
      <motion.path
        variants={draw}
        custom={0}
        d="M40 132 L120 92 L200 132 L120 172 Z"
        {...strokeProps}
      />
      <motion.path
        variants={draw}
        custom={1}
        d="M40 112 L120 72 L200 112 L120 152 Z"
        {...strokeProps}
      />
      <motion.path
        variants={draw}
        custom={2}
        d="M40 92 L120 52 L200 92 L120 132 Z"
        {...strokeProps}
        stroke={STROKE_BRIGHT}
      />
      {/* content hints on the top plane */}
      <motion.path
        variants={draw}
        custom={3}
        d="M88 92 L120 76 L152 92"
        {...strokeProps}
      />
      {/* dotted drop line from the pin to the plane */}
      <motion.line
        variants={fade}
        custom={3}
        x1="120"
        y1="40"
        x2="120"
        y2="86"
        stroke={STROKE_BRIGHT}
        strokeWidth={1}
        strokeDasharray="2 4"
        vectorEffect="non-scaling-stroke"
      />
      {/* the pin — indigo, the only colour in the figure */}
      <motion.circle
        variants={draw}
        custom={4}
        cx="120"
        cy="26"
        r="12"
        stroke={INDIGO}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <motion.circle variants={fade} custom={4} cx="120" cy="26" r="3" fill={INDIGO} />
      {/* landing mark on the plane */}
      <motion.circle
        variants={fade}
        custom={5}
        cx="120"
        cy="92"
        r="2"
        fill={INDIGO}
      />
    </FigSvg>
  );
}

// ---------------------------------------------------------------------------
// FIG 0.2 — dashed region rectangle with corner handles ("Select a region")
// ---------------------------------------------------------------------------

export function FigSelectRegion() {
  return (
    <FigSvg label="A dashed selection rectangle with corner handles over a page">
      {/* page outline behind the selection */}
      <motion.rect
        variants={draw}
        custom={0}
        x="36"
        y="22"
        width="168"
        height="136"
        rx="4"
        {...strokeProps}
      />
      <motion.line variants={draw} custom={1} x1="36" y1="44" x2="204" y2="44" {...strokeProps} />
      <motion.line variants={draw} custom={1} x1="48" y1="60" x2="124" y2="60" {...strokeProps} />
      <motion.line variants={draw} custom={2} x1="48" y1="72" x2="100" y2="72" {...strokeProps} />
      {/* dashed region rectangle (dashes can't draw-in, so it fades) */}
      <motion.rect
        variants={fade}
        custom={2}
        x="76"
        y="88"
        width="104"
        height="52"
        stroke={STROKE_BRIGHT}
        strokeWidth={1}
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
      {/* corner handles */}
      {(
        [
          [76, 88],
          [180, 88],
          [76, 140],
          [180, 140],
        ] as const
      ).map(([x, y], i) => (
        <motion.rect
          key={`${x}-${y}`}
          variants={draw}
          custom={3 + i * 0.5}
          x={x - 3}
          y={y - 3}
          width="6"
          height="6"
          stroke={STROKE_BRIGHT}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* region pin */}
      <motion.circle
        variants={draw}
        custom={5}
        cx="180"
        cy="88"
        r="8"
        stroke={INDIGO}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <motion.circle variants={fade} custom={5} cx="180" cy="88" r="2" fill={INDIGO} />
    </FigSvg>
  );
}

// ---------------------------------------------------------------------------
// FIG 0.3 — stacked comment cards, top one ticked ("Track to resolved")
// ---------------------------------------------------------------------------

export function FigTrackResolved() {
  return (
    <FigSvg label="A stack of comment cards with the top one marked resolved">
      {/* stacked cards, bottom to top */}
      <motion.rect variants={draw} custom={0} x="56" y="116" width="128" height="36" rx="5" {...strokeProps} />
      <motion.rect variants={draw} custom={1} x="48" y="74" width="144" height="36" rx="5" {...strokeProps} />
      <motion.rect
        variants={draw}
        custom={2}
        x="40"
        y="28"
        width="160"
        height="40"
        rx="5"
        {...strokeProps}
        stroke={STROKE_BRIGHT}
      />
      {/* text placeholder lines */}
      <motion.line variants={draw} custom={3} x1="76" y1="42" x2="156" y2="42" {...strokeProps} />
      <motion.line variants={draw} custom={3} x1="76" y1="54" x2="132" y2="54" {...strokeProps} />
      <motion.line variants={draw} custom={4} x1="60" y1="88" x2="140" y2="88" {...strokeProps} />
      <motion.line variants={draw} custom={4} x1="60" y1="98" x2="116" y2="98" {...strokeProps} />
      <motion.line variants={draw} custom={4} x1="68" y1="130" x2="148" y2="130" {...strokeProps} />
      {/* resolved tick on the top card */}
      <motion.circle
        variants={draw}
        custom={5}
        cx="58"
        cy="48"
        r="9"
        stroke={STROKE_BRIGHT}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <motion.path
        variants={draw}
        custom={6}
        d="M53.5 48 L57 51.5 L63 44.5"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </FigSvg>
  );
}

// ---------------------------------------------------------------------------
// Feature-grid glyphs — 24×24, 1px wireframe strokes, static
// ---------------------------------------------------------------------------

function Glyph({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={label}
      className="h-6 w-6"
      stroke="rgba(255,255,255,0.4)"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function GlyphNoLogin() {
  return (
    <Glyph label="No client logins">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20 C4.5 15.5 8 13.5 12 13.5 C16 13.5 19.5 15.5 19.5 20" />
      <path d="M19 4 L23 8 M23 4 L19 8" stroke="rgba(255,255,255,0.25)" />
    </Glyph>
  );
}

export function GlyphAnySite() {
  return (
    <Glyph label="Works on any site">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3.5 9 H20.5 M3.5 15 H20.5" />
    </Glyph>
  );
}

export function GlyphRegion() {
  return (
    <Glyph label="Region comments">
      <path d="M7 5 H17 M7 19 H17 M5 7 V17 M19 7 V17" strokeDasharray="2 2.5" />
      <rect x="3.5" y="3.5" width="3" height="3" />
      <rect x="17.5" y="3.5" width="3" height="3" />
      <rect x="3.5" y="17.5" width="3" height="3" />
      <rect x="17.5" y="17.5" width="3" height="3" />
    </Glyph>
  );
}

export function GlyphStatus() {
  return (
    <Glyph label="Status workflow">
      <circle cx="4.5" cy="12" r="2.5" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="19.5" cy="12" r="2.5" />
      <path d="M7 12 H9.5 M14.5 12 H17" />
      <path d="M18.4 12 L19.2 12.9 L20.8 11.1" stroke="rgba(255,255,255,0.7)" />
    </Glyph>
  );
}

export function GlyphScreenshot() {
  return (
    <Glyph label="A screenshot with every comment">
      <path d="M3.5 7.5 V4.5 Q3.5 3.5 4.5 3.5 H7.5 M16.5 3.5 H19.5 Q20.5 3.5 20.5 4.5 V7.5 M20.5 16.5 V19.5 Q20.5 20.5 19.5 20.5 H16.5 M7.5 20.5 H4.5 Q3.5 20.5 3.5 19.5 V16.5" />
      <circle cx="12" cy="12" r="3.5" />
    </Glyph>
  );
}

export function GlyphExport() {
  return (
    <Glyph label="Export for handoff">
      <path d="M20.5 13.5 V19.5 Q20.5 20.5 19.5 20.5 H4.5 Q3.5 20.5 3.5 19.5 V13.5" />
      <path d="M12 3.5 V14.5 M7.5 8 L12 3.5 L16.5 8" />
    </Glyph>
  );
}
