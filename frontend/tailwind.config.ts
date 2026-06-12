import animate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

/**
 * Orvelle design system — CLAUDE.md Section 10.
 * Colours are defined as CSS variables in src/index.css and
 * referenced here so Tailwind utilities (bg-brand, text-status-open, …)
 * map 1:1 to the canonical palette.
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
        background: "#FAFAFA",
        surface: {
          DEFAULT: "#FFFFFF",
          elevated: "#F4F4F5",
        },
        border: "#E4E4E7",
        text: {
          primary: "#09090B",
          secondary: "#71717A",
          muted: "#A1A1AA",
        },
        status: {
          open: "#EF4444",
          "in-progress": "#F59E0B",
          resolved: "#22C55E",
        },
        pin: "#6366F1",
        destructive: "#EF4444",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pin-pulse": "pin-pulse 3s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "dash-flow": "dash-flow 2s linear infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
