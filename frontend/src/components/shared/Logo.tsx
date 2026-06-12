/**
 * Orvelle wordmark — lowercase "orvelle" with the indigo dot sitting on the
 * baseline like a full stop. Text colour inherits from the parent so the mark
 * works on both the dark landing page and light app surfaces.
 */
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { text: "text-[15px]", dot: "h-[5px] w-[5px]" },
  md: { text: "text-[17px]", dot: "h-1.5 w-1.5" },
  lg: { text: "text-[22px]", dot: "h-[7px] w-[7px]" },
} as const;

export type LogoSize = keyof typeof SIZES;

export function Logo({
  size = "md",
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-[3px] font-medium lowercase tracking-tight",
        s.text,
        className,
      )}
    >
      orvelle
      <span
        className={cn("inline-block rounded-full bg-[#6366F1]", s.dot)}
        aria-hidden="true"
      />
    </span>
  );
}
