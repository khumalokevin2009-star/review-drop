/**
 * CommentThread — the panel anchored to the right of the canvas when a pin is
 * focused. Shows the comment, its replies (indented), and — for the designer —
 * a status dropdown, a reply box, and delete. Guests see it read-only.
 */

import { formatDistanceToNow } from "date-fns";
import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CommentStatus } from "@/types";
import type { CanvasComment } from "@/types/canvas";

const STATUS_OPTIONS: CommentStatus[] = ["open", "in_progress", "resolved"];

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
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
      {initials(name)}
    </span>
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

  const submitReply = () => {
    const body = reply.trim();
    if (!body || !onReply) return;
    onReply(body);
    setReply("");
  };

  return (
    <div className="absolute right-4 top-4 bottom-4 z-20 flex w-80 flex-col rounded-lg border border-border bg-surface shadow-lg">
      {/* header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pin text-xs font-semibold text-white">
            {number}
          </span>
          {canManage && onStatusChange ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded outline-none focus:ring-2 focus:ring-brand">
                <StatusBadge status={comment.status} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {STATUS_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option}
                    onSelect={() => onStatusChange(option)}
                  >
                    <StatusBadge status={option} />
                    {option === comment.status ? (
                      <Check className="ml-auto h-3.5 w-3.5 text-text-muted" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <StatusBadge status={comment.status} />
          )}
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

      {/* body + replies */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div className="flex gap-2">
          <Avatar name={comment.author_name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-medium text-text-primary">
                {comment.author_name ?? "Anonymous"}
              </span>
              <span className="shrink-0 text-xs text-text-muted">
                {timeAgo(comment.created_at)}
              </span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-text-secondary">
              {comment.body}
            </p>
          </div>
        </div>

        {replies.map((r) => (
          <div key={r.id} className="ml-9 flex gap-2">
            <Avatar name={r.author_name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium text-text-primary">
                  {r.author_name ?? "Anonymous"}
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {timeAgo(r.created_at)}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-text-secondary">
                {r.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* reply box (designer only) */}
      {canManage && onReply ? (
        <div className="border-t border-border p-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReply();
            }}
            placeholder="Reply…"
            rows={2}
            className={cn(
              "w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm",
              "text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-brand",
            )}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={submitReply}
              disabled={reply.trim().length === 0 || replyPending}
            >
              {replyPending ? "Sending…" : "Reply"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
