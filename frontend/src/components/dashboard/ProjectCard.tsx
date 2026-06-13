import {
  AppWindow,
  Archive,
  ArchiveRestore,
  Link as LinkIcon,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusDot } from "@/components/dashboard/StatusDot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getShareUrl,
  useDeleteProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import { cn, formatRelative } from "@/lib/utils";
import type { Project } from "@/types";

/**
 * Thumbnail layer — the project's captured preview (CLAUDE.md Sections 5/7),
 * rendered as the card's hero. Three states, none of which shift layout (the
 * aspect-video box reserves its height up front):
 *
 *  • pending  → screenshot not captured yet (or failed): a branded
 *               "preview pending" placeholder, never a broken/empty box.
 *  • loading  → URL exists but the image is still fetching: a shimmer sweep.
 *  • loaded   → the screenshot fades in over the shimmer.
 */
function ProjectThumbnail({ project }: { project: Project }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const hasImage = Boolean(project.thumbnail_url) && !errored;

  return (
    <div className="absolute inset-0 bg-surface-elevated">
      {hasImage ? (
        <>
          {/* Shimmer placeholder, visible until the screenshot loads. */}
          <div
            className={cn(
              "absolute inset-0 overflow-hidden bg-surface-elevated transition-opacity duration-300 motion-reduce:transition-none",
              loaded ? "opacity-0" : "opacity-100",
            )}
            aria-hidden="true"
          >
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent motion-reduce:hidden" />
          </div>
          <img
            src={project.thumbnail_url ?? undefined}
            alt={`Preview of ${project.name}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={cn(
              "h-full w-full object-cover object-top transition-opacity duration-500 ease-out motion-reduce:transition-none",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : (
        // Intentional "preview pending" state — a faint browser-wireframe glyph
        // over the brand dot-grid. Reads as deliberate, not unfinished.
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2.5"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
          aria-hidden="true"
        >
          <AppWindow
            className="h-7 w-7 text-text-muted/45"
            strokeWidth={1.25}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70">
            Preview pending
          </span>
        </div>
      )}
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
}

/**
 * ProjectCard (CLAUDE.md Section 10): a Linear/Vercel-style cover card — the
 * captured site preview is the hero, with project name + client + last activity
 * laid over a bottom gradient scrim, an open-comment count, and a quick-action
 * menu (archive, delete with confirm, copy share link). Archived is the only
 * lifecycle state surfaced, and only as an understated marker.
 */
export function ProjectCard({ project }: ProjectCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();

  const isArchived = project.status === "archived";
  const openCount = project.open_comment_count ?? 0;
  const lastActivity = project.last_activity_at ?? project.updated_at;

  const handleCopyShareLink = async () => {
    try {
      const url = await getShareUrl(project.id);
      if (!url) {
        toast.error("No active review link yet. Create a review first.");
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the share link. Please try again.");
    }
  };

  const handleArchiveToggle = () => {
    updateProject.mutate(
      {
        id: project.id,
        payload: { status: isArchived ? "active" : "archived" },
      },
      {
        onError: () => toast.error("Couldn't update the project."),
      },
    );
  };

  const handleDelete = () => {
    deleteProject.mutate(project.id, {
      onError: () => toast.error("Couldn't delete the project."),
    });
    setConfirmDelete(false);
  };

  return (
    <>
      <Card className="group relative aspect-video overflow-hidden transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-white/20 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
        {/* The whole cover is the link target. */}
        <Link
          to={`/projects/${project.id}`}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          aria-label={`Open ${project.name}`}
        >
          <ProjectThumbnail project={project} />

          {/* Bottom scrim keeps the overlaid title legible over any screenshot. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

          {/* Title block, laid over the scrim. */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
            <div className="min-w-0">
              <h3 className="truncate text-[0.9375rem] font-medium text-white">
                {project.name}
              </h3>
              {project.client_name ? (
                <p className="truncate text-xs text-white/65">
                  {project.client_name}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 pb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
              {formatRelative(lastActivity)}
            </span>
          </div>
        </Link>

        {/* Top-left status markers (stacked): open count, then archived. */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {openCount > 0 ? (
            <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-status-open px-1.5 py-0.5 text-xs font-semibold text-white shadow-sm shadow-black/40">
              {openCount}
            </span>
          ) : null}
          {isArchived ? (
            <StatusDot
              label="archived"
              className="rounded-full bg-black/55 px-2 py-0.5 text-white/80 backdrop-blur-sm"
            />
          ) : null}
        </div>

        {/* Quick actions — always reachable (touch + keyboard), brighter on hover. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2.5 top-2.5 z-10 h-8 w-8 rounded-full bg-black/40 text-white/80 opacity-80 backdrop-blur-sm transition-opacity duration-200 hover:bg-black/55 hover:text-white hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none group-hover:opacity-100"
              aria-label={`Actions for ${project.name}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void handleCopyShareLink()}>
              <LinkIcon className="h-4 w-4 text-text-secondary" />
              Copy share link
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleArchiveToggle}>
              {isArchived ? (
                <>
                  <ArchiveRestore className="h-4 w-4 text-text-secondary" />
                  Unarchive
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 text-text-secondary" />
                  Archive
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10"
              onSelect={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Card>

      {/* Destructive actions require confirmation (Section 10 UX rules) */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the project, its review links, and all client
              comments. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
