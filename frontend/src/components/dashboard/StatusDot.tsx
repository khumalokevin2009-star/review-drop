import { cn } from "@/lib/utils";

interface StatusDotProps {
  label: string;
  className?: string;
}

/**
 * Understated lifecycle indicator for *exceptional* project/review states
 * (archived, expired, closed) — a muted dot + mono uppercase label, never a
 * coloured filled pill. Default/active states render nothing at all; only a
 * state worth flagging earns this marker.
 *
 * Deliberately separate from {@link StatusBadge}, which carries functional
 * comment status (open / in_progress / resolved) inside the canvas and keeps
 * its red/amber/green dot. Lifecycle ≠ workflow status, so they don't share a
 * component.
 */
export function StatusDot({ label, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted"
      />
      {label}
    </span>
  );
}
