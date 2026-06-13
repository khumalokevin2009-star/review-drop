import {
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
import { formatRelative } from "@/lib/utils";
import type { Project } from "@/types";

interface ProjectCardProps {
  project: Project;
}

/**
 * ProjectCard (CLAUDE.md Section 10): thumbnail, project name, client name,
 * open-comment count (red badge), last activity, quick-action menu
 * (archive, delete with confirm, copy share link).
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
      <Card className="group overflow-hidden transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-white/20 motion-reduce:hover:translate-y-0">
        {/* Thumbnail (click navigates to the project detail page) */}
        <Link
          to={`/projects/${project.id}`}
          className="relative block aspect-video w-full overflow-hidden border-b border-border bg-surface-elevated"
          aria-label={`Open ${project.name}`}
        >
          {project.thumbnail_url ? (
            <img
              src={project.thumbnail_url}
              alt={`${project.name} preview`}
              className="h-full w-full object-cover object-top"
              loading="lazy"
            />
          ) : (
            // Dark gradient block with the indigo dot motif (the brand mark).
            <div
              className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#101113] to-[#0A0B0D]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_24px_4px_rgba(99,102,241,0.45)]" />
            </div>
          )}
          {openCount > 0 ? (
            <span className="absolute right-2 top-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[#DC2626] px-1.5 py-0.5 text-xs font-semibold text-white">
              {openCount}
            </span>
          ) : null}
          {isArchived ? (
            <span className="absolute left-2 top-2 rounded-full bg-surface-elevated px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary">
              archived
            </span>
          ) : null}
        </Link>

        {/* Body */}
        <div className="flex items-start justify-between gap-2 p-4">
          <Link to={`/projects/${project.id}`} className="min-w-0">
            <h3 className="truncate font-medium text-text-primary">
              {project.name}
            </h3>
            {project.client_name ? (
              <p className="truncate text-sm text-text-secondary">
                {project.client_name}
              </p>
            ) : null}
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {formatRelative(lastActivity)}
            </p>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-text-secondary"
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
        </div>
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
