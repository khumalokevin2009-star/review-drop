/**
 * ReviewPage — the public guest canvas (/r/:slug). No auth, no sidebar.
 *
 * Loads the target site via the public page endpoint (iframe src, since it
 * needs no Bearer header). Existing pins load immediately on page load — the
 * unguessable slug is the access credential (CLAUDE.md Section 9), so no token
 * is needed to READ. Guests click to drop pins; only on the first comment
 * SUBMIT (not page load) does a name-capture modal appear, then the pending
 * comment is sent and subsequent reads carry the new token (flagging is_mine).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { CanvasFrame } from "@/components/canvas/CanvasFrame";
import { CommentThread } from "@/components/canvas/CommentThread";
import {
  numberCommentsForPage,
  repliesOf,
  toPinData,
} from "@/components/canvas/pins";
import { NewCommentPopover } from "@/components/canvas/NewCommentPopover";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateGuestComment, useGuestComments } from "@/hooks/useComments";
import { useGuestSession } from "@/hooks/useGuestSession";
import api from "@/lib/api";
import { API_BASE_URL } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Project, Review } from "@/types";
import type { CanvasClickCoords, CanvasMode, CommentCreatePayload } from "@/types/canvas";

interface ReviewMeta {
  review: Review;
  project: Project;
}

const nameSchema = z.object({
  name: z.string().min(1, "Your name is required"),
  email: z.union([z.string().email("Enter a valid email"), z.literal("")]),
});
type NameForm = z.infer<typeof nameSchema>;

function metaErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response?.status === 410) return "This review link has expired.";
    if (error.response?.status === 403) return "This review link is no longer active.";
    if (error.response?.status === 404) return "This review link wasn’t found.";
  }
  return "This review couldn’t be loaded.";
}

export default function ReviewPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const session = useGuestSession(slug);

  const metaQuery = useQuery({
    queryKey: ["review-meta", slug],
    queryFn: async () => {
      const { data } = await api.get<ReviewMeta>(`/r/${slug}`);
      return data;
    },
    enabled: slug.length > 0,
    retry: false,
  });

  const commentsQuery = useGuestComments(slug, session.token);
  const comments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);
  const createComment = useCreateGuestComment(slug);

  const [mode, setMode] = useState<CanvasMode>("comment");
  const [currentPath, setCurrentPath] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pendingCoords, setPendingCoords] = useState<CanvasClickCoords | null>(null);
  const [pendingPayload, setPendingPayload] = useState<CommentCreatePayload | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [hasCommented, setHasCommented] = useState(false);
  const [unplacedCount, setUnplacedCount] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NameForm>({ resolver: zodResolver(nameSchema) });

  const projectUrl = metaQuery.data?.project.url ?? "";
  const matchUrl = pageUrl ?? projectUrl;
  const numbered = useMemo(
    () => numberCommentsForPage(comments, matchUrl),
    [comments, matchUrl],
  );
  const pins = useMemo(() => toPinData(numbered, false), [numbered]);

  const focused = useMemo(
    () => numbered.find((n) => n.comment.id === focusedId) ?? null,
    [numbered, focusedId],
  );
  const focusedReplies = useMemo(
    () => (focusedId ? repliesOf(comments, focusedId) : []),
    [comments, focusedId],
  );

  const src = `${API_BASE_URL}/r/${slug}/page${
    currentPath ? `?path=${encodeURIComponent(currentPath)}` : ""
  }`;

  const anchor = useMemo(() => {
    if (!pendingCoords) return { x: 0, y: 0 };
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: (rect?.left ?? 0) + pendingCoords.clientX,
      y: (rect?.top ?? 0) + pendingCoords.clientY,
    };
  }, [pendingCoords]);

  const onNameSubmit = async (values: NameForm) => {
    try {
      const token = await session.createSession(
        values.name,
        values.email || undefined,
      );
      if (pendingPayload) {
        createComment.mutate({
          payload: pendingPayload,
          token,
          displayName: values.name,
        });
      }
      setPendingPayload(null);
      setPendingCoords(null);
      setShowNameModal(false);
      setHasCommented(true);
    } catch {
      toast.error("Couldn’t save your name. Please try again.");
    }
  };

  if (metaQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }
  if (metaQuery.isError || !metaQuery.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="max-w-sm rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-text-primary">{metaErrorMessage(metaQuery.error)}</p>
          <p className="mt-1 text-sm text-text-secondary">
            Ask the designer for an updated link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div ref={containerRef} className="relative min-h-0 flex-1 bg-surface-elevated">
        <CanvasFrame
          src={src}
          mode={mode}
          pins={pins}
          focusPinId={focusedId}
          onReady={(info) => {
            setPageUrl(info.pageUrl);
            setUnplacedCount(0);
          }}
          onNavigate={(path) => {
            setFocusedId(null);
            setUnplacedCount(0);
            setCurrentPath(path);
          }}
          onPinClick={(id) => setFocusedId(id)}
          onUnplaced={(ids) => setUnplacedCount(ids.length)}
          onCanvasClick={(coords) => {
            setFocusedId(null);
            setPendingCoords(coords);
          }}
        />

        {pendingCoords && !showNameModal ? (
          <NewCommentPopover
            coords={pendingCoords}
            anchor={anchor}
            pending={createComment.isPending}
            onCancel={() => setPendingCoords(null)}
            onSubmit={(payload) => {
              if (session.token) {
                createComment.mutate({
                  payload,
                  token: session.token,
                  displayName: session.displayName,
                });
                setPendingCoords(null);
                setHasCommented(true);
              } else {
                setPendingPayload(payload);
                setShowNameModal(true);
              }
            }}
          />
        ) : null}

        {focused ? (
          <CommentThread
            comment={focused.comment}
            replies={focusedReplies}
            number={focused.number}
            canManage={false}
            onClose={() => setFocusedId(null)}
          />
        ) : null}
      </div>

      {/* floating bottom bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-lg">
          {!hasCommented ? (
            <span className="text-sm text-text-secondary">
              {mode === "comment"
                ? "Click anywhere to leave feedback"
                : "Browsing — switch to Comment to add feedback"}
            </span>
          ) : null}
          {unplacedCount > 0 ? (
            <span className="text-xs text-status-in-progress">
              {unplacedCount} pin{unplacedCount > 1 ? "s" : ""} couldn’t be placed
            </span>
          ) : null}
          <div className="flex rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode("comment")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                mode === "comment" ? "bg-brand text-white" : "text-text-secondary",
              )}
            >
              Comment
            </button>
            <button
              type="button"
              onClick={() => setMode("browse")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                mode === "browse" ? "bg-brand text-white" : "text-text-secondary",
              )}
            >
              Browse
            </button>
          </div>
        </div>
      </div>

      {/* brand watermark (guest-facing — CLAUDE.md Section 9) */}
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto absolute bottom-4 right-4 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary shadow-lg transition-colors hover:text-text-primary"
      >
        Powered by <span className="font-semibold text-text-primary">Orvelle</span>
      </a>

      {/* name capture (first comment only) */}
      <Dialog
        open={showNameModal}
        onOpenChange={(open) => {
          // Ignore dismissals while the session is being created (don't drop the
          // pending comment mid-flight).
          if (!open && !session.isCreating) {
            setShowNameModal(false);
            setPendingPayload(null);
            setPendingCoords(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add your name</DialogTitle>
            <DialogDescription>
              So the designer knows who left this feedback.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => void handleSubmit(onNameSubmit)(e)}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Jane Doe" {...register("name")} />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="jane@company.com"
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" disabled={session.isCreating}>
              {session.isCreating ? "Saving…" : "Continue"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
