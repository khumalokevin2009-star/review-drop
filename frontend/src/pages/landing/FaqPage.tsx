/**
 * /faq — the full question set in the landing's dark editorial language,
 * with a pointer to /contact for anything unanswered.
 */
import { ArrowRight } from "lucide-react";

import { Footer } from "@/components/shared/Footer";
import { Nav } from "@/components/shared/Nav";
import { cn } from "@/lib/utils";

import { faqs } from "./content";
import {
  BrandDot,
  FaqAccordion,
  HAIRLINE,
  MonoLabel,
  MotionLink,
  pillGhost,
  pressProps,
  Reveal,
  RevealHeading,
  SECTION_X,
  SectionRule,
} from "./ui";

export default function FaqPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#08090A] font-sans text-white antialiased selection:bg-white/20">
      <div className={cn("mx-auto w-full max-w-[1400px] border-x", HAIRLINE)}>
        <Nav />
        <main>
          <section className={cn("pb-24 pt-20 md:pt-28", SECTION_X)}>
            <div className="grid gap-12 md:grid-cols-[1fr_2fr] md:gap-16">
              <div>
                <Reveal>
                  <MonoLabel>FAQ</MonoLabel>
                </Reveal>
                <RevealHeading
                  text="Questions, answered"
                  as="h1"
                  className="mt-4 max-w-[12ch] text-[clamp(2.25rem,4.5vw,3.5rem)] font-medium leading-[1.08] tracking-tight text-white"
                />
                <Reveal>
                  <p className="mt-5 max-w-sm text-base leading-relaxed text-[#A1A1AA]">
                    Everything freelancers and studios ask before putting a
                    client project on Orvelle.
                  </p>
                </Reveal>
              </div>
              <Reveal>
                {/* h2 keeps the outline h1 → h2 (page h1 is "Questions, answered") */}
                <FaqAccordion items={faqs} headingLevel="h2" />
              </Reveal>
            </div>
          </section>

          <section>
            <SectionRule />
            <div className={cn("py-20", SECTION_X)}>
              <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-medium tracking-tight text-white md:text-3xl">
                  Something we didn&rsquo;t cover
                  <BrandDot />
                </h2>
                <MotionLink to="/contact" {...pressProps} className={pillGhost}>
                  Get in touch
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </MotionLink>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
