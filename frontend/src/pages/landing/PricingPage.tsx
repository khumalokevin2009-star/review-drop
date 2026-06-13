/**
 * /pricing — full plans (CLAUDE.md Section 9), a plan-comparison matrix and
 * the billing FAQ. Matches the landing's dark editorial design language.
 */
import { Footer } from "@/components/shared/Footer";
import { Nav } from "@/components/shared/Nav";
import { cn } from "@/lib/utils";

import { billingFaqs, planMatrix, plans } from "./content";
import {
  FaqAccordion,
  HAIRLINE,
  MonoLabel,
  MotionLink,
  PageDepth,
  pillGhost,
  pillWhite,
  pressProps,
  Reveal,
  RevealGroup,
  RevealHeading,
  RevealItem,
  SECTION_X,
} from "./ui";

function PlanCards() {
  return (
    <RevealGroup className="mt-14 grid gap-6 pl-px pt-px md:grid-cols-3 md:gap-0">
      {plans.map(({ name, price, period, features, cta, popular }) => (
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
            <h2 className="text-sm font-medium text-white">{name}</h2>
            {popular ? <MonoLabel>Most popular</MonoLabel> : null}
          </div>
          <div className="mt-6 flex items-baseline gap-1.5">
            <span className="text-4xl font-medium tracking-tight text-white">
              {price}
            </span>
            <span className="font-mono text-xs text-[#8A8A93]">{period}</span>
          </div>
          <ul className="mt-8 flex-1 space-y-3">
            {features.map((f) => (
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
  );
}

/** A matrix value, giving the bare em-dash an accessible "Not included". */
function MatrixValue({ value }: { value: string }) {
  if (value === "—") {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <>{value}</>;
}

function PlanMatrix() {
  return (
    <Reveal className="mt-20">
      <MonoLabel>Compare plans</MonoLabel>
      <div className={cn("mt-6 border-t", HAIRLINE)} role="table" aria-label="Plan comparison">
        <div
          role="row"
          className={cn(
            "grid gap-2 border-b py-3.5 max-sm:grid-cols-3 sm:grid-cols-4",
            HAIRLINE,
          )}
        >
          <span role="columnheader" aria-label="Feature" className="sr-only sm:not-sr-only sm:block" />
          <span role="columnheader" className="text-xs font-medium text-white max-sm:text-[11px]">
            Free
          </span>
          <span role="columnheader" className="text-xs font-medium text-white max-sm:text-[11px]">
            Pro
          </span>
          <span role="columnheader" className="text-xs font-medium text-white max-sm:text-[11px]">
            Studio
          </span>
        </div>
        {planMatrix.map(({ feature, free, pro, studio }) => (
          <div
            key={feature}
            role="row"
            className={cn(
              "grid gap-x-2 gap-y-1 border-b py-3.5 max-sm:grid-cols-3 sm:grid-cols-4",
              HAIRLINE,
            )}
          >
            <span
              role="rowheader"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#A1A1AA] max-sm:col-span-3 sm:self-center sm:text-xs sm:tracking-[0.2em]"
            >
              {feature}
            </span>
            <span role="cell" className="text-sm text-[#A1A1AA]">
              <MatrixValue value={free} />
            </span>
            <span role="cell" className="text-sm text-white">
              <MatrixValue value={pro} />
            </span>
            <span role="cell" className="text-sm text-[#A1A1AA]">
              <MatrixValue value={studio} />
            </span>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

export default function PricingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#08090A] font-sans text-white antialiased selection:bg-white/20">
      <PageDepth />
      <div className="mx-auto w-full max-w-[1680px]">
        <Nav />
        <main>
          <section className={cn("pb-24 pt-20 md:pt-28", SECTION_X)}>
            <Reveal>
              <MonoLabel>Pricing</MonoLabel>
            </Reveal>
            <RevealHeading
              text="Flat pricing. No per-seat nonsense."
              as="h1"
              className="mt-4 max-w-2xl text-[clamp(2.25rem,4.5vw,3.5rem)] font-medium leading-[1.08] tracking-tight text-white"
            />
            <Reveal>
              <p className="mt-5 max-w-md text-base leading-relaxed text-[#A1A1AA]">
                No credit card to start. Upgrade when a client project needs it,
                cancel any time.
              </p>
            </Reveal>
            <PlanCards />
            <PlanMatrix />
          </section>

          <section>
            <div className={cn("py-24", SECTION_X)}>
              <div className="grid gap-12 md:grid-cols-[1fr_2fr] md:gap-16">
                <Reveal>
                  <MonoLabel>Billing</MonoLabel>
                  <RevealHeading
                    text="The fine print, minus the fine print"
                    className="mt-4 max-w-[14ch] text-3xl font-medium tracking-tight text-white md:text-4xl"
                  />
                </Reveal>
                <Reveal>
                  <FaqAccordion items={billingFaqs} />
                </Reveal>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
