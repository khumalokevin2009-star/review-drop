import animate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

/**
 * ReviewDrop design system — CLAUDE.md Section 10.
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
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
