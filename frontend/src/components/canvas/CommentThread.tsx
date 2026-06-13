/**
 * CommentThread — the panel anchored to the right of the canvas when a pin is
 * focused. Shows the comment, its replies (on an indigo rail), and — for the
 * designer — a segmented status control, a reply box, and delete. Guests see
 * it read-only.
 */

import { formatDistanceToNow } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommentStatus } from "@/types";
import type { CanvasComment } from "@/types/canvas";

const IS_MAC = /Mac|iP(hone|ad|od)/.test(
  typeof navigator !== "undefined" ? navigator.platform : "",
);

const STATUS_SEGMENTS: Array<{
  value: CommentStatus;
  label: string;
  dot: string;
  activeText: string;
}> = [
  { value: "open", label: "open", dot: "bg-status-open", activeText: "text-status-open" },
  {
    value: "in_progress",
    label: "in progress",
    dot: "bg-status-in-progress",
    activeText: "text-status-in-progress",
  },
  {
    value: "resolved",
    label: "resolved",
    dot: "bg-status-resolved",
    activeText: "text-status-resolved",
  },
];

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function timeAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}

function Avatar({ name }: { name: string | null }) {
  return (
    <span className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
      {initials(name)}
    </span>
  );
}

function CommentBlock({ comment }: { comment: CanvasComment }) {
  return (
    <div className="flex gap-3">
      <Avatar name={comment.author_name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-text-secondary">
          <span className="font-medium text-text-primary">
            {comment.author_name ?? "Anonymous"}
          </span>{" "}
          · {timeAgo(comment.created_at)}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
          {comment.body}
        </p>
      </div>
    </div>
  );
}

interface StatusSegmentedControlProps {
  status: CommentStatus;
  onChange: (status: CommentStatus) => void;
}

function StatusSegmentedControl({ status, onChange }: StatusSegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Comment status"
      className="flex w-full rounded-lg bg-surface-elevated p-0.5"
    >
      {STATUS_SEGMENTS.map((segment) => {
        const active = segment.value === status;
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium lowercase transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand/70",
              active
                ? cn("bg-white/[0.08]", segment.activeText)
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", segment.dot)} />
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

interface CommentThreadProps {
  comment: CanvasComment;
  replies: CanvasComment[];
  number: number;
  canManage: boolean;
  onClose: () => void;
  onStatusChange?: (status: CommentStatus) => void;
  onReply?: (body: string) => void;
  onDelete?: () => void;
  replyPending?: boolean;
}

export function CommentThread({
  comment,
  replies,
  number,
  canManage,
  onClose,
  onStatusChange,
  onReply,
  onDelete,
  replyPending,
}: CommentThreadProps) {
  const [reply, setReply] = useState("");
  const reduceMotion = useReducedMotion();

  const submitReply = () => {
    const body = reply.trim();
    if (!body || !onReply) return;
    onReply(body);
    setReply("");
  };

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-4 right-4 top-4 z-20 flex w-80 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/50"
    >
      {/* header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 select-none items-center justify-center rounded-full bg-pin text-xs font-semibold text-white">
            {number}
          </span>
          <span className="text-sm font-medium text-text-primary">Comment</span>
          {!canManage || !onStatusChange ? (
            <StatusBadge status={comment.status} />
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {canManage && onDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-text-muted hover:text-destructive"
              onClick={onDelete}
              aria-label="Delete comment"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-text-muted"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* status (designer only) */}
      {canManage && onStatusChange ? (
        <div className="border-b border-border/60 px-4 py-2.5">
          <StatusSegmentedControl status={comment.status} onChange={onStatusChange} />
        </div>
      ) : null}

      {/* body + replies */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <CommentBlock comment={comment} />

        {replies.length > 0 ? (
          <div className="ml-3.5 space-y-4 border-l-2 border-brand/15 pl-4">
            {replies.map((r) => (
              <CommentBlock key={r.id} comment={r} />
            ))}
          </div>
        ) : null}
      </div>

      {/* reply box (designer only) */}
      {canManage && onReply ? (
        <div className="border-t border-border p-3">
          <div className="rounded-lg border border-border bg-surface-elevated/50 transition-colors duration-150 focus-within:border-brand/40 focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand/10">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReply();
              }}
              placeholder="Reply…"
              rows={2}
              className="w-full resize-none border-0 bg-transparent px-3 pb-1 pt-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="text-[11px] text-text-muted">
                {IS_MAC ? "⌘↵" : "Ctrl↵"} to send
              </span>
              <Button
                size="sm"
                onClick={submitReply}
                disabled={reply.trim().length === 0 || replyPending}
                className="transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97] motion-reduce:transform-none"
              >
                {replyPending ? "Sending…" : "Reply"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
