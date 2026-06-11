/**
 * NewCommentPopover — appears at the click point after a comment-mode click.
 * Collects the comment body, adds the captured pin coordinates + navigator
 * metadata, and submits the full CommentCreate payload.
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CanvasClickCoords, CommentCreatePayload } from "@/types/canvas";

const POPOVER_WIDTH = 288;

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

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
      ...getClientMetadata(),
    });
  };

  // Keep the popover on-screen.
  const left = Math.min(
    Math.max(8, anchor.x),
    window.innerWidth - POPOVER_WIDTH - 8,
  );
  const top = Math.min(anchor.y + 12, window.innerHeight - 180);

  return (
    <div
      className="fixed z-30 rounded-lg border border-border bg-surface p-3 shadow-lg"
      style={{ left, top, width: POPOVER_WIDTH }}
    >
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="Add your feedback…"
        rows={3}
        className={cn(
          "w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm",
          "text-text-primary placeholder:text-text-muted",
          "focus:outline-none focus:ring-2 focus:ring-brand",
        )}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={body.trim().length === 0 || pending}>
          {pending ? "Sending…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
