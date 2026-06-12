/**
 * Feature-grid glyphs for the landing page — 24×24 wireframe icons,
 * 1px strokes, no fills. Static by design (the motion lives in the page's
 * scroll reveals, not inside these marks). Decorative: each sits directly
 * above a heading with the same text, so they are hidden from assistive
 * tech to avoid double announcements.
 */

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
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
    <Glyph>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20 C4.5 15.5 8 13.5 12 13.5 C16 13.5 19.5 15.5 19.5 20" />
      <path d="M19 4 L23 8 M23 4 L19 8" stroke="rgba(255,255,255,0.25)" />
    </Glyph>
  );
}

export function GlyphAnySite() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3.5 9 H20.5 M3.5 15 H20.5" />
    </Glyph>
  );
}

export function GlyphRegion() {
  return (
    <Glyph>
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
    <Glyph>
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
    <Glyph>
      <path d="M3.5 7.5 V4.5 Q3.5 3.5 4.5 3.5 H7.5 M16.5 3.5 H19.5 Q20.5 3.5 20.5 4.5 V7.5 M20.5 16.5 V19.5 Q20.5 20.5 19.5 20.5 H16.5 M7.5 20.5 H4.5 Q3.5 20.5 3.5 19.5 V16.5" />
      <circle cx="12" cy="12" r="3.5" />
    </Glyph>
  );
}

export function GlyphExport() {
  return (
    <Glyph>
      <path d="M20.5 13.5 V19.5 Q20.5 20.5 19.5 20.5 H4.5 Q3.5 20.5 3.5 19.5 V13.5" />
      <path d="M12 3.5 V14.5 M7.5 8 L12 3.5 L16.5 8" />
    </Glyph>
  );
}
