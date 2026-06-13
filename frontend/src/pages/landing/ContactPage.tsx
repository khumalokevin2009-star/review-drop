/**
 * /contact — editorial headline and a styled mailto card. No form yet; the
 * email backend lands later.
 */
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

import { Footer } from "@/components/shared/Footer";
import { Nav } from "@/components/shared/Nav";
import { cn } from "@/lib/utils";

import {
  focusRing,
  HAIRLINE,
  MonoLabel,
  pressProps,
  Reveal,
  RevealHeading,
  SECTION_X,
} from "./ui";

export default function ContactPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#08090A] font-sans text-white antialiased selection:bg-white/20">
      <div className={cn("mx-auto w-full max-w-[1400px] border-x", HAIRLINE)}>
        <Nav />
        <main>
          <section className={cn("pb-32 pt-20 md:pt-28", SECTION_X)}>
            <Reveal>
              <MonoLabel>Contact</MonoLabel>
            </Reveal>
            <RevealHeading
              text="Get in touch"
              dot
              as="h1"
              className="mt-4 max-w-[12ch] text-[clamp(2.5rem,5.5vw,4.25rem)] font-medium leading-[1.05] tracking-tight text-white"
            />
            <Reveal>
              <p className="mt-6 max-w-md text-base leading-relaxed text-[#A1A1AA]">
                Questions about plans, a site that won&rsquo;t proxy, or an idea
                that would make client review better — we read everything.
              </p>
            </Reveal>

            <Reveal className="mt-14">
              <motion.a
                href="mailto:hello@orvellehq.com"
                {...pressProps}
                className={cn(
                  "group inline-flex max-w-full touch-manipulation items-center gap-5 rounded-lg border p-6 transition-colors duration-200 hover:border-white/25 sm:p-8",
                  HAIRLINE,
                  focusRing,
                )}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-xs uppercase tracking-[0.2em] text-[#8A8A93]">
                    Email
                  </span>
                  <span className="mt-2 block truncate font-mono text-base text-white sm:text-xl">
                    hello@orvellehq.com
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                    "border-white/[0.15] group-hover:border-white/40 group-active:bg-white/[0.06]",
                  )}
                >
                  <ArrowUpRight className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
              </motion.a>
            </Reveal>

            <Reveal>
              <p className="mt-8 max-w-md text-sm leading-relaxed text-[#8A8A93]">
                Orvelle is an independent product built in Milton Keynes —
                you&rsquo;ll usually hear back within one business day.
              </p>
            </Reveal>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
