/**
 * CanvasView — the designer review workspace (protected /reviews/:reviewId/canvas).
 *
 * Loads the project site through the AUTHENTICATED proxy (fetched via axios and
 * handed to the iframe as srcDoc, because an iframe can't send a Bearer header),
 * renders the client's pins, and lets the designer browse/triage. In Comment
 * mode the designer can also drop their own top-level pins (click or region
 * drag) via NewCommentPopover → POST /reviews/{id}/comments, authored as the
 * designer.
 */

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Link2, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { CanvasFrame } from "@/components/canvas/CanvasFrame";
import { CommentThread } from "@/components/canvas/CommentThread";
import { NewCommentPopover } from "@/components/canvas/NewCommentPopover";
import {
  numberCommentsForPage,
  repliesOf,
  toPinData,
} from "@/components/canvas/pins";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import {
  useCreateDesignerComment,
  useDeleteComment,
  useReplyToComment,
  useReviewComments,
  useUpdateCommentStatus,
} from "@/hooks/useComments";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CommentStatus, Project, Review } from "@/types";
import type { CanvasClickCoords, CanvasMode } from "@/types/canvas";

interface ReviewDetail {
  review: Review;
  project: Project;
}

const STATUS_FILTERS: Array<{ value: CommentStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

export default function CanvasView() {
  const { reviewId = "" } = useParams<{ reviewId: string }>();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: ["review-detail", reviewId],
    queryFn: async () => {
      const { data } = await api.get<ReviewDetail>(`/reviews/${reviewId}`);
      return data;
    },
    enabled: reviewId.length > 0,
  });

  const projectUrl = detailQuery.data?.project.url ?? null;
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  useEffect(() => {
    if (projectUrl) setCurrentUrl((prev) => prev ?? projectUrl);
  }, [projectUrl]);

  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("browse");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CommentStatus | "all">("all");
  const [unplacedCount, setUnplacedCount] = useState(0);
  const [pendingCoords, setPendingCoords] = useState<CanvasClickCoords | null>(
    null,
  );

  const canvasRef = useRef<HTMLElement>(null);

  const proxyQuery = useQuery({
    queryKey: ["proxy", currentUrl],
    queryFn: async () => {
      const { data } = await api.get<string>("/proxy", {
        params: { url: currentUrl },
        responseType: "text",
      });
      return data;
    },
    enabled: currentUrl !== null,
    retry: false,
  });

  const commentsQuery = useReviewComments(reviewId);
  const comments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);

  const updateStatus = useUpdateCommentStatus(reviewId);
  const reply = useReplyToComment(reviewId);
  const remove = useDeleteComment(reviewId);
  const createComment = useCreateDesignerComment(reviewId);

  // Position the new-comment popover in the parent's coordinate space (canvas
  // rect + the click point reported from inside the iframe).
  const newCommentAnchor = useMemo(() => {
    if (!pendingCoords) return { x: 0, y: 0 };
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: (rect?.left ?? 0) + pendingCoords.clientX,
      y: (rect?.top ?? 0) + pendingCoords.clientY,
    };
  }, [pendingCoords]);

  const matchUrl = pageUrl ?? currentUrl ?? "";
  const numbered = useMemo(
    () => numberCommentsForPage(comments, matchUrl),
    [comments, matchUrl],
  );
  const pins = useMemo(
    () => toPinData(numbered, showResolved),
    [numbered, showResolved],
  );

  const focused = useMemo(
    () => numbered.find((n) => n.comment.id === focusedId) ?? null,
    [numbered, focusedId],
  );
  const focusedReplies = useMemo(
    () => (focusedId ? repliesOf(comments, focusedId) : []),
    [comments, focusedId],
  );

  const sidebarItems = useMemo(
    () =>
      numbered.filter(
        (n) =>
          (statusFilter === "all" || n.comment.status === statusFilter) &&
          (showResolved || n.comment.status !== "resolved"),
      ),
    [numbered, statusFilter, showResolved],
  );

  // Keyboard B / C mode toggle (ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "b" || e.key === "B") setMode("browse");
      if (e.key === "c" || e.key === "C") setMode("comment");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleNavigate = (path: string) => {
    if (!currentUrl) return;
    try {
      setFocusedId(null);
      setPendingCoords(null);
      setUnplacedCount(0);
      setCurrentUrl(new URL(path, currentUrl).toString());
    } catch {
      /* ignore malformed path */
    }
  };

  const copyShareLink = () => {
    const slug = detailQuery.data?.review.slug;
    if (!slug) return;
    const link = `${window.location.origin}/r/${slug}`;
    void navigator.clipboard?.writeText(link);
    toast.success("Share link copied");
  };

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-text-secondary">This review could not be found.</p>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const { review, project } = detailQuery.data;
  const path = (() => {
    try {
      return new URL(currentUrl ?? project.url).pathname;
    } catch {
      return "/";
    }
  })();

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link to="/dashboard" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {project.name}
              {review.name ? (
                <span className="font-normal text-text-secondary"> · {review.name}</span>
              ) : null}
            </p>
            <p className="truncate font-mono text-xs text-text-muted">{path}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode("browse")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                mode === "browse"
                  ? "bg-brand text-white"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              Browse <span className="opacity-60">B</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("comment")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                mode === "comment"
                  ? "bg-brand text-white"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              Comment <span className="opacity-60">C</span>
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={copyShareLink}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Share
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* canvas */}
        <main ref={canvasRef} className="relative min-w-0 flex-1 bg-surface-elevated">
          {proxyQuery.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : proxyQuery.isError ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-sm rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
                <p className="text-sm font-medium text-text-primary">
                  This page couldn’t be loaded
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  The site may block embedding or be unreachable.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <a href={currentUrl ?? project.url} target="_blank" rel="noreferrer">
                    Open site directly
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <CanvasFrame
              srcDoc={proxyQuery.data}
              mode={mode}
              pins={pins}
              focusPinId={focusedId}
              onReady={(info) => {
                setPageUrl(info.pageUrl);
                setUnplacedCount(0);
              }}
              onNavigate={handleNavigate}
              onPinClick={(id) => {
                setPendingCoords(null);
                setFocusedId(id);
              }}
              onUnplaced={(ids) => setUnplacedCount(ids.length)}
              onCanvasClick={(coords) => {
                // Comment mode only fires this (the agent gates rd:click on
                // mode); drop any open thread and start a new comment here.
                setFocusedId(null);
                setPendingCoords(coords);
              }}
            />
          )}

          {pendingCoords ? (
            <NewCommentPopover
              coords={pendingCoords}
              anchor={newCommentAnchor}
              pending={createComment.isPending}
              onCancel={() => setPendingCoords(null)}
              onSubmit={(payload) => {
                createComment.mutate({
                  payload,
                  displayName: user?.full_name ?? null,
                });
                setPendingCoords(null);
              }}
            />
          ) : null}

          {focused ? (
            <CommentThread
              comment={focused.comment}
              replies={focusedReplies}
              number={focused.number}
              canManage
              onClose={() => setFocusedId(null)}
              onStatusChange={(status) =>
                updateStatus.mutate({ commentId: focused.comment.id, status })
              }
              onReply={(body) =>
                reply.mutate({ commentId: focused.comment.id, body })
              }
              onDelete={() => {
                remove.mutate(focused.comment.id);
                setFocusedId(null);
              }}
              replyPending={reply.isPending}
            />
          ) : null}
        </main>

        {/* sidebar */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-surface">
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  statusFilter === f.value
                    ? "bg-brand text-white"
                    : "text-text-secondary hover:bg-surface-elevated",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {unplacedCount > 0 ? (
            <p className="border-b border-border bg-status-in-progress/10 px-3 py-2 text-xs text-status-in-progress">
              {unplacedCount} pin{unplacedCount > 1 ? "s" : ""} couldn’t be placed
              on this page.
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {commentsQuery.isLoading ? (
              <div className="space-y-3 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : sidebarItems.length === 0 ? (
              <div className="p-6 text-center text-sm text-text-secondary">
                No comments on this page yet. Share the link with your client to
                collect feedback.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {sidebarItems.map(({ comment, number }) => (
                  <li key={comment.id}>
                    <button
                      type="button"
                      onClick={() => setFocusedId(comment.id)}
                      className={cn(
                        "flex w-full gap-2 px-3 py-3 text-left hover:bg-surface-elevated",
                        focusedId === comment.id && "bg-surface-elevated",
                      )}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pin text-[10px] font-semibold text-white">
                        {number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-text-primary">
                            {comment.author_name ?? "Anonymous"}
                          </span>
                          <StatusBadge status={comment.status} />
                        </div>
                        <p className="line-clamp-2 text-xs text-text-secondary">
                          {comment.body}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => {
                const next = e.target.checked;
                setShowResolved(next);
                // Hiding resolved pins must also close a focused resolved
                // thread — otherwise the panel outlives its pin.
                if (!next && focused?.comment.status === "resolved") {
                  setFocusedId(null);
                }
              }}
            />
            <MessageSquare className="h-3.5 w-3.5" />
            Show resolved
          </label>
        </aside>
      </div>
    </div>
  );
}
