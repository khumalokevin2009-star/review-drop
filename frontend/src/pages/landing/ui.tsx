/**
 * Shared marketing-surface primitives: the dark editorial design language
 * (near-black #08090A, 1400px ruled frame, hairlines, Geist + Geist Mono,
 * monochrome + indigo discipline) plus the motion vocabulary — scroll
 * reveals, masked word reveals, hairline draw-ins, tactile press states.
 * Used by the landing page and the /pricing, /faq and /contact pages.
 */
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Plus } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const HAIRLINE = "border-white/[0.08]";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090A]";

export const dotGrid = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
} as const;

/** Frame paddings — kept in one place so every section breathes identically. */
export const SECTION_X = "px-8 md:px-16";

// ---------------------------------------------------------------------------
// Brand marks
// ---------------------------------------------------------------------------

/** The logo dot, echoed as a full stop on key headlines. */
export function BrandDot() {
  return (
    <span aria-hidden="true" className="text-[#6366F1]">
      .
    </span>
  );
}

/** Numbered indigo pin chip — the product's pin, used as a section marker. */
export function PinChip({ n, className }: { n: number; className?: string }) {
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

export function MonoLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-xs uppercase tracking-[0.2em] text-[#8A8A93]",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons — tactile press (kept under reduced motion: it is direct
// interaction feedback) + gentle hover lift.
// ---------------------------------------------------------------------------

export const MotionLink = motion(Link);

export const pressProps = {
  whileTap: { scale: 0.97 },
  whileHover: { y: -1 },
  transition: { type: "spring", stiffness: 600, damping: 30 } as const,
} as const;

export const pillWhite = cn(
  "inline-flex h-11 touch-manipulation items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition-[background-color,filter] duration-150 hover:bg-[#E4E4E7] active:brightness-90 active:[box-shadow:inset_0_2px_6px_rgba(0,0,0,0.35)]",
  focusRing,
);

export const pillGhost = cn(
  "inline-flex h-11 touch-manipulation items-center justify-center rounded-full border border-white/[0.15] px-6 text-sm font-medium text-white transition-colors duration-150 hover:border-white/30 hover:bg-white/[0.04] active:bg-white/[0.08]",
  focusRing,
);

// ---------------------------------------------------------------------------
// Scroll-reveal vocabulary
// ---------------------------------------------------------------------------

export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export const VIEWPORT = { once: true, amount: 0.2 } as const;

/** Single scroll reveal: opacity 0→1, y 12→0. Static under reduced motion. */
export function Reveal({
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
export function RevealGroup({
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

export function RevealItem({
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

/**
 * Masked per-word reveal for section headlines: each word rises out of its
 * own overflow clip and fades in, staggered. Travel is capped at 24px (the
 * page's hard motion limit) rather than a full line-height, with opacity
 * concealing the gap on large headings; the clip box carries a small vertical
 * allowance so descenders are never cut at rest.
 */
export function RevealHeading({
  text,
  dot = false,
  as = "h2",
  className,
}: {
  text: string;
  dot?: boolean;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const reduced = useReducedMotion();
  const Comp = as;
  const words = text.split(" ");

  if (reduced) {
    return (
      <Comp className={className}>
        {text}
        {dot ? <BrandDot /> : null}
      </Comp>
    );
  }

  return (
    <Comp className={className}>
      <motion.span
        className="inline"
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.045 } } }}
      >
        {words.map((word, i) => (
          <Fragment key={`${word}-${i}`}>
            <span className="inline-block overflow-hidden py-[0.1em] -my-[0.1em] align-top">
              <motion.span
                className="inline-block"
                variants={{
                  hidden: { y: 24, opacity: 0 },
                  visible: { y: 0, opacity: 1, transition: { duration: 0.7, ease: EASE } },
                }}
              >
                {word}
                {i === words.length - 1 && dot ? <BrandDot /> : null}
              </motion.span>
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </motion.span>
    </Comp>
  );
}

/**
 * Hairline rule that draws in (scaleX 0→1, origin-left) when it enters view.
 * Replaces border-t on major sections; occupies a constant 1px — zero shift.
 */
export function SectionRule() {
  const reduced = useReducedMotion();
  if (reduced) return <div aria-hidden="true" className="h-px w-full bg-white/[0.08]" />;
  return (
    <motion.div
      aria-hidden="true"
      className="h-px w-full origin-left bg-white/[0.08]"
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 1 }}
      transition={{ duration: 0.8, ease: EASE }}
    />
  );
}

// ---------------------------------------------------------------------------
// FAQ accordion (Radix) — shared by the landing teaser, /faq and /pricing
// ---------------------------------------------------------------------------

export interface FaqItem {
  q: string;
  a: string;
}

export function FaqAccordion({
  items,
  headingLevel: Heading = "h3",
}: {
  items: readonly FaqItem[];
  /** Heading tag wrapping each trigger — set to keep the document outline
   *  unbroken (e.g. "h2" on /faq where the accordion follows the page h1). */
  headingLevel?: "h2" | "h3";
}) {
  return (
    <AccordionPrimitive.Root type="single" collapsible className={cn("border-t", HAIRLINE)}>
      {items.map(({ q, a }) => (
        <AccordionPrimitive.Item key={q} value={q} className={cn("border-b", HAIRLINE)}>
          <AccordionPrimitive.Header asChild>
            <Heading>
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
            </Heading>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
            <p className="max-w-prose pb-5 text-sm leading-relaxed text-[#A1A1AA]">{a}</p>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
