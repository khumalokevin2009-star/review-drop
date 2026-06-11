/**
 * Pure helpers for turning comments into numbered pins (CLAUDE.md Section 9).
 * Numbering is per page_url, ordered by created_at, and STABLE: a pin keeps its
 * number even when resolved pins are hidden (so the sidebar and canvas agree).
 */

import type { CanvasComment, PinData } from "@/types/canvas";

export interface NumberedComment {
  comment: CanvasComment;
  number: number;
}

/** Normalise a page URL for matching (drop hash + trailing slash). */
export function normalizePageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

/** Top-level comments on the given page, numbered 1..N by created_at. */
export function numberCommentsForPage(
  comments: CanvasComment[],
  pageUrl: string,
): NumberedComment[] {
  const target = normalizePageUrl(pageUrl);
  return comments
    .filter(
      (c) => c.parent_id === null && normalizePageUrl(c.page_url) === target,
    )
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((comment, index) => ({ comment, number: index + 1 }));
}

/** Pins to render — hides resolved unless asked, preserving numbers. */
export function toPinData(
  numbered: NumberedComment[],
  showResolved: boolean,
): PinData[] {
  return numbered
    .filter((n) => showResolved || n.comment.status !== "resolved")
    .map((n) => ({
      id: n.comment.id,
      number: n.number,
      status: n.comment.status,
      selector: n.comment.element_selector,
      percentX: n.comment.pin_x_percent,
      percentY: n.comment.pin_y_percent,
      absX: n.comment.pin_x_absolute,
      absY: n.comment.pin_y_absolute,
    }));
}

/** Replies to a given comment, oldest first. */
export function repliesOf(
  comments: CanvasComment[],
  parentId: string,
): CanvasComment[] {
  return comments
    .filter((c) => c.parent_id === parentId)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
