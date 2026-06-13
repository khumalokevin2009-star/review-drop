import animate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

/**
 * Orvelle design system — dark premium skin shared with the landing page.
 * Semantic tokens (bg-surface, border-border, text-text-*, bg-brand, …) map
 * the whole post-login app to the near-black palette; the landing and auth
 * pages use hardcoded hex of the same values. Status colours stay functional
 * (CLAUDE.md Section 9/10): open/in-progress/resolved = red/amber/green.
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6366F1",
          hover: "#4F46E5",
        },
        background: "#08090A",
        surface: {
          DEFAULT: "#0C0D0F",
          elevated: "#101113",
        },
        // hairline — matches the landing's border-white/[0.08]
        border: "rgba(255,255,255,0.08)",
        text: {
          primary: "#FAFAFA",
          secondary: "#A1A1AA",
          muted: "#8A8A93",
        },
        status: {
          open: "#EF4444",
          "in-progress": "#F59E0B",
          resolved: "#22C55E",
        },
        pin: "#6366F1",
        destructive: "#F87171",
        success: "#22C55E",
      },
      fontFamily: {
        sans: ["Geist Sans", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Landing illustrations — looping pulse ring on comment pins.
        "pin-pulse": {
          "0%": { transform: "scale(1)", opacity: "0.5" },
          "55%": { transform: "scale(2.1)", opacity: "0" },
          "100%": { transform: "scale(2.1)", opacity: "0" },
        },
        // Landing illustrations — dashes flowing left-to-right (dash period 8).
        "dash-flow": {
          from: { strokeDashoffset: "0" },
          to: { strokeDashoffset: "-16" },
        },
        // Thumbnail loading shimmer — a single highlight sweeps left→right over
        // the placeholder fill (the element sits at -translate-x-full at rest).
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pin-pulse": "pin-pulse 3s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "dash-flow": "dash-flow 2s linear infinite",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
