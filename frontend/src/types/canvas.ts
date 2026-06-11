/**
 * Canvas / pin-system contract shared between the React parent and the proxy-
 * injected agent script. The postMessage protocol is modelled as discriminated
 * unions (tag = `type`, always prefixed `rd:`). All protocol logic lives in
 * CanvasFrame; everything else consumes these types.
 */

import type { Comment, CommentStatus } from "@/types";

export type CanvasMode = "browse" | "comment";

/** A comment enriched with the derived fields the comments API returns
 * (author_name/type and the per-guest is_mine flag). */
export interface CanvasComment extends Comment {
  author_name: string | null;
  author_type: "designer" | "guest" | null;
  is_mine?: boolean | null;
}

/** What the parent hands the agent to render a single pin. */
export interface PinData {
  id: string;
  number: number;
  status: CommentStatus;
  selector: string | null;
  percentX: number | null;
  percentY: number | null;
  absX: number | null;
  absY: number | null;
}

/** Coordinates captured from a comment-mode click inside the iframe. */
export interface CanvasClickCoords {
  selector: string | null;
  percentX: number | null;
  percentY: number | null;
  absX: number;
  absY: number;
  /** Viewport-relative within the iframe — used to anchor the parent popover. */
  clientX: number;
  clientY: number;
  viewportWidth: number;
  viewportHeight: number;
  pageUrl: string;
}

/** Payload for POST /r/{slug}/comments (mirrors backend CommentCreate). */
export interface CommentCreatePayload {
  body: string;
  page_url: string;
  pin_x_percent: number | null;
  pin_y_percent: number | null;
  element_selector: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  pin_x_absolute: number | null;
  pin_y_absolute: number | null;
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  screen_width: number | null;
  screen_height: number | null;
}

/* -------- postMessage protocol -------- */

/** Parent → iframe agent (commands). */
export type RdOutboundMessage =
  | { type: "rd:set-mode"; mode: CanvasMode }
  | { type: "rd:render-pins"; pins: PinData[] }
  | { type: "rd:focus-pin"; id: string };

/** iframe agent → parent (events). */
export type RdInboundMessage =
  | { type: "rd:ready"; pageUrl: string; docHeight: number }
  | ({ type: "rd:click" } & CanvasClickCoords)
  | { type: "rd:navigate"; path: string }
  | { type: "rd:pin-click"; id: string }
  | { type: "rd:unplaced"; ids: string[] };

/** Narrowing guard for messages claiming to come from the agent. The caller
 * MUST also verify event.source === the iframe's contentWindow (origin is
 * opaque "null" for the sandboxed proxy, so source identity is the real gate). */
export function isRdInboundMessage(value: unknown): value is RdInboundMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "rd:ready" ||
    type === "rd:click" ||
    type === "rd:navigate" ||
    type === "rd:pin-click" ||
    type === "rd:unplaced"
  );
}
