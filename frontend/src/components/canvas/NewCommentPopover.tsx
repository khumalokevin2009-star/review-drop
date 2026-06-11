/**
 * NewCommentPopover — appears at the click/release point after a comment-mode
 * click or region drag. Collects the comment body, adds the captured pin
 * coordinates (+ region dims) and navigator metadata, and submits the full
 * CommentCreate payload.
 */

import { motion, useReducedMotion } from "framer-motion";
import { Scan } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CanvasClickCoords, CommentCreatePayload } from "@/types/canvas";

const POPOVER_WIDTH = 360;
const POPOVER_EST_HEIGHT = 190;
const REGION_STRIP_HEIGHT = 34;

const IS_MAC = /Mac|iP(hone|ad|od)/.test(
  typeof navigator !== "undefined" ? navigator.platform : "",
);

interface ClientMetadata {
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  screen_width: number | null;
  screen_height: number | null;
}

/** Best-effort UA parse for the developer-facing client metadata. */
function getClientMetadata(): ClientMetadata {
  const ua = navigator.userAgent;
  let browser_name: string | null = null;
  let browser_version: string | null = null;

  const matchers: Array<[string, RegExp]> = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of matchers) {
    const m = ua.match(re);
    if (m) {
      browser_name = name;
      browser_version = m[1] ?? null;
      break;
    }
  }

  let os_name: string | null = null;
  if (/Windows/.test(ua)) os_name = "Windows";
  else if (/Mac OS X/.test(ua)) os_name = "macOS";
  else if (/Android/.test(ua)) os_name = "Android";
  else if (/(iPhone|iPad|iPod)/.test(ua)) os_name = "iOS";
  else if (/Linux/.test(ua)) os_name = "Linux";

  return {
    browser_name,
    browser_version,
    os_name,
    screen_width: window.screen?.width ?? null,
    screen_height: window.screen?.height ?? null,
  };
}

interface NewCommentPopoverProps {
  coords: CanvasClickCoords;
  /** Position in the parent's coordinate space (iframe rect + click point). */
  anchor: { x: number; y: number };
  onSubmit: (payload: CommentCreatePayload) => void;
  onCancel: () => void;
  pending?: boolean;
}

export function NewCommentPopover({
  coords,
  anchor,
  onSubmit,
  onCancel,
  pending,
}: NewCommentPopoverProps) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const isRegion = coords.regionWidth !== null && coords.regionHeight !== null;

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onSubmit({
      body: text,
      page_url: coords.pageUrl,
      pin_x_percent: coords.percentX,
      pin_y_percent: coords.percentY,
      element_selector: coords.selector,
      viewport_width: coords.viewportWidth,
      viewport_height: coords.viewportHeight,
      pin_x_absolute: coords.absX,
      pin_y_absolute: coords.absY,
      region_width: coords.regionWidth,
      region_height: coords.regionHeight,
      region_width_percent: coords.regionWidthPercent,
      region_height_percent: coords.regionHeightPercent,
      ...getClientMetadata(),
    });
  };

  // Keep the popover on-screen.
  const left = Math.min(
    Math.max(8, anchor.x),
    window.innerWidth - POPOVER_WIDTH - 8,
  );
  const estHeight = POPOVER_EST_HEIGHT + (isRegion ? REGION_STRIP_HEIGHT : 0);
  const top = Math.min(anchor.y + 12, window.innerHeight - estHeight);

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="fixed z-30 overflow-hidden rounded-xl border border-border bg-surface shadow-xl ring-1 ring-black/5"
      style={{ left, top, width: POPOVER_WIDTH, transformOrigin: "top left" }}
    >
      {isRegion ? (
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-surface-elevated/50 px-4 py-2">
          <Scan className="h-3 w-3 text-brand" />
          <span className="text-[11px] font-medium text-text-secondary">
            Selected area · {Math.round(coords.regionWidth ?? 0)}×
            {Math.round(coords.regionHeight ?? 0)}
          </span>
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="Leave your feedback…"
        rows={3}
        className="w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
      />

      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
        <span className="pl-1 text-[11px] text-text-muted">
          {IS_MAC ? "⌘↵" : "Ctrl↵"} to send
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={body.trim().length === 0 || pending}
            className="transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97] motion-reduce:transform-none"
          >
            {pending ? "Sending…" : "Comment"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
