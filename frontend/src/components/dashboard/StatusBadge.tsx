import { cn } from "@/lib/utils";
import type { CommentStatus } from "@/types";

/**
 * Pill with coloured dot (CLAUDE.md Section 10).
 * open = red, in_progress = amber, resolved = green.
 * Always lowercase text.
 */
const config: Record<
  CommentStatus,
  { label: string; dot: string; pill: string }
> = {
  open: {
    label: "open",
    dot: "bg-status-open",
    pill: "bg-status-open/10 text-status-open",
  },
  in_progress: {
    label: "in progress",
    dot: "bg-status-in-progress",
    pill: "bg-status-in-progress/10 text-status-in-progress",
  },
  resolved: {
    label: "resolved",
    dot: "bg-status-resolved",
    pill: "bg-status-resolved/10 text-status-resolved",
  },
};

interface StatusBadgeProps {
  status: CommentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, dot, pill } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium lowercase",
        pill,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
