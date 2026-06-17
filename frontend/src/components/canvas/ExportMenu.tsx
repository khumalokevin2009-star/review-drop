/**
 * ExportMenu — the "Export" control in the canvas comment sidebar
 * (CLAUDE.md Sections 9, 10). Export is Pro-only:
 *
 * - Pro: a dropdown of formats (Spreadsheet / Document) that downloads the
 *   review's feedback as CSV or PDF via {@link useExportComments}.
 * - Free: the control stays VISIBLE but locked — opening it surfaces an inline
 *   "Export is a Pro feature" nudge that starts the upgrade-to-Pro checkout or
 *   links to /pricing. Seeing the locked feature is part of the upsell.
 *
 * The Pro gate here is purely cosmetic; the backend enforces it for real.
 */
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useBilling } from "@/hooks/useBilling";
import { useExportComments, type ExportFormat } from "@/hooks/useExport";

interface FormatOption {
  format: ExportFormat;
  label: string;
  hint: string;
  icon: typeof FileText;
}

const FORMATS: FormatOption[] = [
  { format: "csv", label: "Spreadsheet", hint: "CSV", icon: FileSpreadsheet },
  { format: "pdf", label: "Document", hint: "PDF", icon: FileText },
];

export function ExportMenu({ reviewId }: { reviewId: string }) {
  const { user } = useAuth();
  // Only surface the locked upsell once we KNOW the user is free. While
  // /auth/me is loading `user` is null, so a paying Pro user is never shown the
  // "upgrade" nudge (and the backend enforces the gate regardless).
  const locked = user !== null && user.plan === "free";
  const exporter = useExportComments(reviewId);
  const { startCheckout } = useBilling();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          // Compact, to sit in the sidebar header next to the "Comments" label.
          // Not disabled while pending: a disabled trigger would drop keyboard
          // focus on menu-close and block reopening — the spinner conveys state.
          className="h-7 gap-1.5 rounded-md px-2.5 text-xs"
          aria-busy={exporter.isPending}
          aria-label={
            locked ? "Export feedback (Pro feature)" : "Export feedback"
          }
        >
          {exporter.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : locked ? (
            <Lock className="h-3.5 w-3.5 text-text-muted" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {!locked ? (
          <>
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Export feedback
            </DropdownMenuLabel>
            {FORMATS.map(({ format, label, hint, icon: Icon }) => (
              <DropdownMenuItem
                key={format}
                onSelect={() => exporter.mutate(format)}
                disabled={exporter.isPending}
                className="gap-2"
              >
                <Icon className="h-4 w-4 text-text-secondary" />
                <span className="flex-1">{label}</span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
                  {hint}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : (
          <div className="p-1">
            <div className="flex items-center gap-2 px-1.5 pb-1 pt-0.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Lock className="h-3 w-3" />
              </span>
              <p className="text-xs font-semibold text-text-primary">
                Export is a Pro feature
              </p>
            </div>
            <p className="px-1.5 pb-2 text-xs leading-relaxed text-text-secondary">
              Hand clients and developers a clean PDF or CSV of every comment.
            </p>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault(); // keep the menu's focus until we redirect
                startCheckout.mutate();
              }}
              disabled={startCheckout.isPending}
              className="gap-2 font-medium text-brand focus:bg-brand/10 focus:text-brand"
            >
              <Sparkles className="h-4 w-4" />
              {startCheckout.isPending ? "Redirecting…" : "Upgrade to Pro"}
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2 text-text-secondary">
              <Link to="/pricing">See plans &amp; pricing</Link>
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
