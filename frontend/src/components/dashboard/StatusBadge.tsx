import { cn } from "@/lib/utils";
import type { CommentStatus } from "@/types";

/**
 * Status indicator — a coloured dot + uppercase mono label, matching the
 * landing's comment-sidebar aesthetic. The dot keeps the functional status
 * colour (CLAUDE.md Section 9/10: open = red, in_progress = amber,
 * resolved = green); the label carries the meaning in text so colour is never
 * the sole indicator.
 */
const config: Record<CommentStatus, { label: string; dot: string }> = {
  open: { label: "Open", dot: "bg-status-open" },
  in_progress: { label: "In progress", dot: "bg-status-in-progress" },
  resolved: { label: "Resolved", dot: "bg-status-resolved" },
};

interface StatusBadgeProps {
  status: CommentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, dot } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      {label}
    </span>
  );
}
