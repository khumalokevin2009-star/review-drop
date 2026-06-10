import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
}

/**
 * Note (Section 10 UX rules): spinners are for full-page / route-level
 * loading only — content areas must use skeleton screens.
 */
export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2
        className={cn("h-6 w-6 animate-spin text-brand", className)}
        aria-label="Loading"
      />
    </div>
  );
}
