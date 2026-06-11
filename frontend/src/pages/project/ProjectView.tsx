import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  MoreVertical,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateReview,
  useDeleteReview,
  useProject,
  useReviewsForProject,
  useUpdateReview,
} from "@/hooks/useProjects";
import { cn, formatDate } from "@/lib/utils";
import type { ApiError, Project, Review } from "@/types";

// --- New-review form ----------------------------------------------------------

const createReviewSchema = z.object({
  name: z.string().optional(),
  expires_at: z.string().optional(),
});

type CreateReviewForm = z.infer<typeof createReviewSchema>;

interface NewReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  defaultName: string;
}

function NewReviewDialog({
  open,
  onOpenChange,
  projectId,
  defaultName,
}: NewReviewDialogProps) {
  const createReview = useCreateReview(projectId);
  const {
    register,
    handleSubmit,
    reset,
  } = useForm<CreateReviewForm>({
    resolver: zodResolver(createReviewSchema),
  });

  const onSubmit = (values: CreateReviewForm) => {
    const name = values.name?.trim() || defaultName;
    createReview.mutate(
      {
        name,
        ...(values.expires_at
          ? { expires_at: new Date(values.expires_at).toISOString() }
          : {}),
      },
      {
        onSuccess: () => {
          toast.success("Review link created");
          reset();
          onOpenChange(false);
        },
        onError: (error) => {
          const message =
            isAxiosError<ApiError>(error) && error.response?.data.detail
              ? error.response.data.detail
              : "Couldn't create the review. Please try again.";
          toast.error(message);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New review link</DialogTitle>
          <DialogDescription>
            Generate a shareable link your client can use to leave feedback —
            no account needed.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="name">
              Review name{" "}
              <span className="font-normal text-text-muted">(optional)</span>
            </Label>
            <Input id="name" placeholder={defaultName} {...register("name")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires_at">
              Expiry date{" "}
              <span className="font-normal text-text-muted">(optional)</span>
            </Label>
            <Input id="expires_at" type="date" {...register("expires_at")} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createReview.isPending}>
              {createReview.isPending ? "Creating…" : "Create review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Review row ---------------------------------------------------------------

interface ReviewRowProps {
  review: Review;
  projectId: string;
}

function ReviewRow({ review, projectId }: ReviewRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const updateReview = useUpdateReview(projectId);
  const deleteReview = useDeleteReview(projectId);

  const shareUrl = `${window.location.origin}/r/${review.slug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Share link copied to clipboard");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the share link. Please try again.");
    }
  };

  const handleToggleActive = () => {
    updateReview.mutate(
      { id: review.id, payload: { is_active: !review.is_active } },
      { onError: () => toast.error("Couldn't update the review.") },
    );
  };

  const handleDelete = () => {
    deleteReview.mutate(review.id, {
      onError: () => toast.error("Couldn't delete the review."),
    });
    setConfirmDelete(false);
  };

  return (
    <>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium text-text-primary">
                {review.name ?? "Untitled review"}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  review.is_active
                    ? "bg-status-resolved/10 text-status-resolved"
                    : "bg-surface-elevated text-text-secondary",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    review.is_active ? "bg-status-resolved" : "bg-text-muted",
                  )}
                />
                {review.is_active ? "active" : "inactive"}
              </span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Created {formatDate(review.created_at)}
              {review.expires_at
                ? ` · Expires ${formatDate(review.expires_at)}`
                : ""}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-text-secondary"
                aria-label={`Actions for ${review.name ?? "review"}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleToggleActive}>
                {review.is_active ? (
                  <>
                    <PowerOff className="h-4 w-4 text-text-secondary" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <Power className="h-4 w-4 text-text-secondary" />
                    Activate
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

        {/* Share URL + copy */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2">
          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
            {shareUrl}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-text-secondary"
            onClick={() => void handleCopy()}
            aria-label="Copy share link"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-status-resolved" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to={`/reviews/${review.id}/canvas`}>
              Open canvas
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </Card>

      {/* Destructive actions require confirmation (Section 10 UX rules) */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{review.name ?? "this review"}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the review link and all of its comments. Anyone with
              the link will no longer be able to access it. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete review
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// --- Loading / empty states ---------------------------------------------------

function ReviewRowSkeleton() {
  return (
    <Card className="space-y-3 p-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-1/4" />
      <Skeleton className="h-9 w-full" />
    </Card>
  );
}

interface EmptyStateProps {
  onCreate: () => void;
}

function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
        <LinkIcon className="h-6 w-6 text-brand" />
      </div>
      <div>
        <h2 className="text-base font-medium text-text-primary">
          Create your first review link
        </h2>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">
          Share a link with your client and they can click anywhere on the site
          to leave pinned feedback — no account needed.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4" />
        New review
      </Button>
    </div>
  );
}

// --- Header -------------------------------------------------------------------

function ProjectHeader({ project }: { project: Project }) {
  const isArchived = project.status === "archived";
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 mb-3 text-text-secondary"
        >
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">
                {project.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  isArchived
                    ? "bg-surface-elevated text-text-secondary"
                    : "bg-status-resolved/10 text-status-resolved",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isArchived ? "bg-text-muted" : "bg-status-resolved",
                  )}
                />
                {isArchived ? "archived" : "active"}
              </span>
            </div>
            {project.client_name ? (
              <p className="mt-0.5 text-sm text-text-secondary">
                {project.client_name}
              </p>
            ) : null}
            <a
              href={project.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-brand hover:underline"
            >
              {project.url}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

// --- Page ---------------------------------------------------------------------

export default function ProjectView() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const projectQuery = useProject(projectId);
  const reviewsQuery = useReviewsForProject(projectId);
  const [createOpen, setCreateOpen] = useState(false);

  const reviews = reviewsQuery.data ?? [];
  const defaultName =
    reviews.length === 0 ? "Round 1" : `Round ${reviews.length + 1}`;

  // Project failed to load → full-page error with retry.
  if (projectQuery.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-text-secondary">
          Couldn&apos;t load this project.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
          <Button onClick={() => void projectQuery.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {projectQuery.isLoading || !projectQuery.data ? (
        <header className="border-b border-border bg-surface">
          <div className="mx-auto max-w-4xl space-y-3 px-4 py-4 sm:px-6">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </header>
      ) : (
        <ProjectHeader project={projectQuery.data} />
      )}

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-text-primary">
              Reviews
            </h2>
            <p className="text-sm text-text-secondary">
              Shareable feedback links for this project
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={!projectQuery.data}
          >
            <Plus className="h-4 w-4" />
            New review
          </Button>
        </div>

        {reviewsQuery.isError ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center">
            <p className="text-sm text-text-secondary">
              Couldn&apos;t load the review links.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void reviewsQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : reviewsQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReviewRowSkeleton />
            <ReviewRowSkeleton />
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {reviews.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                projectId={projectId}
              />
            ))}
          </div>
        )}
      </main>

      <NewReviewDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        defaultName={defaultName}
      />
    </div>
  );
}
