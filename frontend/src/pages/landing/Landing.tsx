/**
 * Marketing landing page — dark monochrome skin (Vercel/Linear/Resend
 * reference). This design system intentionally OVERRIDES Section 10 for
 * the landing page only; the app keeps its light palette.
 */
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

import {
  BeforeAfterSplit,
  CommentThreadCard,
  DashboardMini,
  HeroIllustration,
  PlatformPills,
  ShareLinkIllustration,
  StatusFlowStrip,
} from "./illustrations";

// ---------------------------------------------------------------------------
// Motion presets
// ---------------------------------------------------------------------------

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const viewport = { once: true, margin: "-100px" } as const;

/** Section wrapper with the standard scroll reveal (static when reduced). */
function Reveal({
  children,
  className,
  as = "section",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div";
  id?: string;
}) {
  const reduced = useReducedMotion();
  const Comp = as === "div" ? motion.div : motion.section;

  if (reduced) {
    return (
      <Comp id={id} className={className}>
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      id={id}
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
    >
      {children}
    </Comp>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FAFAFA] text-xs font-bold text-[#0A0A0A]">
        R
      </span>
      <span className="font-semibold tracking-tight text-[#FAFAFA]">
        ReviewDrop
      </span>
    </div>
  );
}

const ctaWhite =
  "inline-flex items-center justify-center rounded-md bg-[#FAFAFA] px-5 py-2.5 text-sm font-medium text-[#0A0A0A] transition-all duration-150 hover:scale-[1.02] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

const ctaGhost =
  "inline-flex items-center justify-center rounded-md border border-[#27272A] px-5 py-2.5 text-sm font-medium text-[#FAFAFA] transition-all duration-150 hover:scale-[1.02] hover:border-[#52525B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20";

// ---------------------------------------------------------------------------
// Content data
// ---------------------------------------------------------------------------

const steps = [
  {
    n: "01",
    title: "Paste your staging URL",
    body: "WordPress, Webflow, Showit, Squarespace or custom. Add the link to the draft you want reviewed.",
  },
  {
    n: "02",
    title: "Share one link",
    body: "Your client opens it in their browser. No account, no signup, nothing to install.",
  },
  {
    n: "03",
    title: "Get pinned feedback",
    body: "They click anywhere to drop a comment. You get an organised inbox: open, in progress, resolved.",
  },
] as const;

const comparison = [
  { them: "$79/month, single plan", us: "From £0. Pro is £15/month, flat" },
  { them: "Card required to trial", us: "Free plan, no card, forever" },
  { them: "Price raised 172% on existing users", us: "Flat pricing we won't yank around" },
  { them: "Built for agencies & enterprise", us: "Built for solo designers & small studios" },
] as const;

interface Tier {
  name: string;
  price: string;
  period: string;
  blurb: string;
  features: string[];
  popular?: boolean;
}

const tiers: Tier[] = [
  {
    name: "Free",
    price: "£0",
    period: "forever",
    blurb: "Try it on a real project.",
    features: [
      "2 active projects",
      "1 review link per project",
      "Unlimited client commenters",
      "ReviewDrop watermark",
    ],
  },
  {
    name: "Pro",
    price: "£15",
    period: "/month",
    blurb: "Everything unlimited, for working freelancers.",
    features: [
      "Unlimited projects & review links",
      "Unlimited client commenters",
      "PDF & CSV export",
      "No watermark",
    ],
    popular: true,
  },
  {
    name: "Studio",
    price: "£39",
    period: "/month",
    blurb: "For small studios working together.",
    features: [
      "Everything in Pro",
      "3 team members",
      "Unlimited projects & reviews",
      "PDF & CSV export",
    ],
  },
];

const faqs = [
  {
    q: "Do my clients need an account?",
    a: "No — that's the whole point. You share a link, they open it, click anywhere on the page, and leave a comment. They type their name once and that's it. No signup, no password, no app.",
  },
  {
    q: "Is the free plan actually free?",
    a: "Yes. Two active projects, one review link each, unlimited client commenters — free forever, no card required. Upgrade only if you need more projects or exports.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes, self-serve from your billing page in two clicks. No emails to support, no retention hoops. Your account drops to the free plan at the end of the billing period.",
  },
  {
    q: "Does it work on any website?",
    a: "Almost. We render your site through a proxy so clients can browse and comment on live pages, and it works with the vast majority of staging sites. Heavy JavaScript apps, sites behind logins, or sites with strict security settings can't always be fully proxied — for those we automatically fall back to a pixel-perfect screenshot your client can still pin comments on.",
  },
] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const reduced = useReducedMotion();

  const heroStagger = reduced ? undefined : stagger;
  const heroFade = reduced ? undefined : fadeUp;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-[#27272A] bg-[#0A0A0A]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-[#A1A1AA] transition-colors duration-150 hover:text-[#FAFAFA]"
            >
              Log in
            </Link>
            <Link to="/register" className={ctaWhite}>
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Subtle radial glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2"
            style={{
              background:
                "radial-gradient(ellipse at center top, rgba(255,255,255,0.05), transparent 60%)",
            }}
          />
          {/* Faint grid pattern */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage:
                "radial-gradient(ellipse at center top, black 40%, transparent 75%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at center top, black 40%, transparent 75%)",
            }}
          />

          <motion.div
            className="relative mx-auto max-w-4xl px-4 pb-4 pt-24 text-center sm:px-6 sm:pt-32"
            variants={heroStagger}
            initial={reduced ? undefined : "hidden"}
            animate={reduced ? undefined : "visible"}
          >
            <motion.div variants={heroFade}>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#27272A] bg-[#111111] px-3 py-1 text-xs text-[#A1A1AA]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FAFAFA]" />
                Now in early access
              </span>
            </motion.div>

            <motion.h1
              variants={heroFade}
              className="mx-auto mt-6 max-w-3xl font-bold leading-[1.05] text-[#FAFAFA]"
              style={{
                fontSize: "clamp(3rem, 6vw, 4.5rem)",
                letterSpacing: "-0.02em",
              }}
            >
              Client feedback, exactly where it belongs.
            </motion.h1>

            <motion.p
              variants={heroFade}
              className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#A1A1AA] sm:text-lg"
            >
              Share a link. Your client clicks anywhere on the page to comment.
              No logins, no $79/month.
            </motion.p>

            <motion.div
              variants={heroFade}
              className="mt-8 flex items-center justify-center gap-3"
            >
              <Link to="/register" className={ctaWhite}>
                Start free
              </Link>
              <a href="#how-it-works" className={ctaGhost}>
                See how it works
              </a>
            </motion.div>

            <motion.p
              variants={heroFade}
              className="mt-4 text-xs text-[#52525B]"
            >
              Free plan · No credit card required
            </motion.p>
          </motion.div>

          {/* Centrepiece — site-under-review illustration */}
          <HeroIllustration />

          {/* Platform pills (honest stand-in for a logo strip) */}
          <Reveal as="div">
            <PlatformPills />
          </Reveal>
        </section>

        {/* How it works */}
        <Reveal id="how-it-works" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <h2
            className="text-3xl font-bold text-[#FAFAFA]"
            style={{ letterSpacing: "-0.02em" }}
          >
            How it works
          </h2>
          <p className="mt-2 text-[#A1A1AA]">
            From staging link to organised feedback in under a minute.
          </p>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-[#27272A] bg-[#27272A] sm:grid-cols-3">
            {steps.map(({ n, title, body }) => (
              <div key={n} className="bg-[#111111] p-8">
                <span className="font-mono text-sm text-[#52525B]">{n}</span>
                <h3 className="mt-3 font-semibold text-[#FAFAFA]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">
                  {body}
                </p>
              </div>
            ))}
          </div>

          {/* The link your client gets */}
          <div className="mt-20">
            <ShareLinkIllustration />
            <p className="mt-5 text-center text-xs text-[#52525B]">
              The link your client opens — no app, no account behind it.
            </p>
          </div>

          {/* Status flow strip */}
          <div className="mt-16">
            <StatusFlowStrip />
            <p className="mt-5 text-center text-xs text-[#52525B]">
              Every comment moves through one simple flow.
            </p>
          </div>
        </Reveal>

        {/* Problem → solution strip */}
        <section className="border-y border-[#27272A] bg-[#111111]">
          <Reveal as="div" className="mx-auto max-w-4xl px-4 py-24 sm:px-6">
            <h2
              className="text-3xl font-bold text-[#FAFAFA]"
              style={{ letterSpacing: "-0.02em" }}
            >
              Built for designers who are done with…
            </h2>
            <p className="mt-2 text-[#A1A1AA]">
              Feedback scattered across email, WhatsApp, and three-day-old
              calls.
            </p>

            {/* Before / after illustration */}
            <BeforeAfterSplit className="mt-10" />

            <p className="mt-10 text-lg text-[#FAFAFA]">
              One link. Pinned comments. An inbox that tracks what's open,
              in progress, and resolved.
            </p>
          </Reveal>
        </section>

        {/* Feature bento — dashboard + comment threads */}
        <Reveal className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <h2
            className="text-center text-3xl font-bold text-[#FAFAFA]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Feedback that stays organised
          </h2>
          <p className="mx-auto mt-2 max-w-md text-center text-[#A1A1AA]">
            Pins become threads, threads get statuses, and nothing gets lost
            in email.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="flex flex-col overflow-hidden rounded-xl border border-[#27272A] bg-[#111111] p-6 sm:p-8">
              <div className="flex flex-1 items-center">
                <DashboardMini className="w-full" />
              </div>
              <h3 className="mt-8 font-semibold text-[#FAFAFA]">
                Every project, one inbox
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">
                Project cards show open-comment counts at a glance, so you
                always know what's waiting on you.
              </p>
            </div>
            <div className="flex flex-col overflow-hidden rounded-xl border border-[#27272A] bg-[#111111] p-6 sm:p-8">
              <div className="flex flex-1 items-center justify-center py-2">
                <CommentThreadCard />
              </div>
              <h3 className="mt-8 font-semibold text-[#FAFAFA]">
                Threads, not email chains
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">
                Reply in context and set a status — open, in progress,
                resolved — without leaving the page.
              </p>
            </div>
          </div>
        </Reveal>

        {/* Markup.io comparison */}
        <Reveal className="mx-auto max-w-4xl px-4 py-24 sm:px-6">
          <h2
            className="text-center text-3xl font-bold text-[#FAFAFA]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Switching from Markup.io?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-center text-sm text-[#A1A1AA]">
            You shouldn't have to pay $79/month for pinned comments.
          </p>
          <div className="mt-10 overflow-hidden rounded-xl border border-[#27272A]">
            <div className="grid grid-cols-2 border-b border-[#27272A] bg-[#111111] text-sm font-medium">
              <div className="px-5 py-3 text-[#71717A]">Markup.io</div>
              <div className="border-l border-[#27272A] px-5 py-3 text-[#FAFAFA]">
                ReviewDrop
              </div>
            </div>
            {comparison.map(({ them, us }) => (
              <div
                key={them}
                className="grid grid-cols-2 border-b border-[#27272A] text-sm last:border-b-0"
              >
                <div className="px-5 py-4 text-[#71717A]">{them}</div>
                <div className="border-l border-[#27272A] px-5 py-4 text-[#FAFAFA]">
                  {us}
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Pricing */}
        <section className="border-t border-[#27272A] bg-[#111111]">
          <Reveal as="div" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <h2
              className="text-center text-3xl font-bold text-[#FAFAFA]"
              style={{ letterSpacing: "-0.02em" }}
            >
              Simple pricing
            </h2>
            <p className="mt-2 text-center text-[#A1A1AA]">
              Flat monthly price. Unlimited clients on every plan. Cancel
              anytime.
            </p>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className={cn(
                    "relative flex flex-col rounded-xl border bg-[#0A0A0A] p-7 transition-all duration-150 hover:-translate-y-0.5",
                    tier.popular
                      ? "border-[#FAFAFA]"
                      : "border-[#27272A] hover:border-[#52525B]",
                  )}
                >
                  {tier.popular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#FAFAFA] px-3 py-0.5 text-xs font-semibold text-[#0A0A0A]">
                      Most popular
                    </span>
                  ) : null}
                  <h3 className="font-semibold text-[#FAFAFA]">{tier.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span
                      className="text-4xl font-bold text-[#FAFAFA]"
                      style={{ letterSpacing: "-0.02em" }}
                    >
                      {tier.price}
                    </span>
                    <span className="text-sm text-[#71717A]">
                      {tier.period}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#A1A1AA]">{tier.blurb}</p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm text-[#A1A1AA]"
                      >
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#FAFAFA]" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/register"
                    className={cn(
                      "mt-7 w-full",
                      tier.popular ? ctaWhite : ctaGhost,
                    )}
                  >
                    Start free
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-[#52525B]">
              Annual billing saves ~20% — available at checkout.
            </p>
          </Reveal>
        </section>

        {/* FAQ */}
        <Reveal className="mx-auto max-w-2xl px-4 py-24 sm:px-6">
          <h2
            className="text-center text-3xl font-bold text-[#FAFAFA]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Questions, answered
          </h2>
          <AccordionPrimitive.Root type="single" collapsible className="mt-10">
            {faqs.map(({ q, a }) => (
              <AccordionPrimitive.Item
                key={q}
                value={q}
                className="border-b border-[#27272A]"
              >
                <AccordionPrimitive.Header>
                  <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between gap-4 py-5 text-left">
                    <span className="font-medium text-[#FAFAFA]">{q}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-[#71717A] transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>
                <AccordionPrimitive.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                  <p className="pb-5 text-sm leading-relaxed text-[#A1A1AA]">
                    {a}
                  </p>
                </AccordionPrimitive.Content>
              </AccordionPrimitive.Item>
            ))}
          </AccordionPrimitive.Root>
          <div className="mt-12 text-center">
            <Link to="/register" className={ctaWhite}>
              Start free
            </Link>
          </div>
        </Reveal>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#27272A]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-xs text-[#52525B]">
            © {new Date().getFullYear()} ReviewDrop. Built for freelance web
            designers.
          </p>
          <div className="flex gap-5 text-sm text-[#A1A1AA]">
            <Link
              to="/login"
              className="transition-colors duration-150 hover:text-[#FAFAFA]"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="transition-colors duration-150 hover:text-[#FAFAFA]"
            >
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
