/**
 * TanStack Query hooks for the comments API (CLAUDE.md Section 8).
 *
 * Designer surface (JWT via the api interceptor): list a review's comments,
 * change status, reply, delete. Guest surface (X-Guest-Token header): list and
 * create comments for a share slug. Status changes and creates are optimistic
 * with rollback.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import api from "@/lib/api";
import type { CommentStatus } from "@/types";
import type { CanvasComment, CommentCreatePayload } from "@/types/canvas";

export const commentKeys = {
  review: (reviewId: string) => ["comments", "review", reviewId] as const,
  guest: (slug: string) => ["comments", "guest", slug] as const,
};

let tempIdCounter = 0;
const nextTempId = () => `temp-${Date.now()}-${(tempIdCounter += 1)}`;

const guestHeaders = (token: string) => ({ headers: { "X-Guest-Token": token } });

/* -------- designer surface -------- */

export function useReviewComments(
  reviewId: string,
): UseQueryResult<CanvasComment[]> {
  return useQuery({
    queryKey: commentKeys.review(reviewId),
    queryFn: async () => {
      const { data } = await api.get<CanvasComment[]>(
        `/reviews/${reviewId}/comments`,
      );
      return data;
    },
    enabled: reviewId.length > 0,
  });
}

export function useUpdateCommentStatus(reviewId: string) {
  const qc = useQueryClient();
  const key = commentKeys.review(reviewId);
  return useMutation({
    mutationFn: async (vars: { commentId: string; status: CommentStatus }) => {
      const { data } = await api.patch<CanvasComment>(
        `/comments/${vars.commentId}`,
        { status: vars.status },
      );
      return data;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CanvasComment[]>(key);
      qc.setQueryData<CanvasComment[]>(key, (old) =>
        old?.map((c) =>
          c.id === vars.commentId ? { ...c, status: vars.status } : c,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useReplyToComment(reviewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { commentId: string; body: string }) => {
      const { data } = await api.post<CanvasComment>(
        `/comments/${vars.commentId}/reply`,
        { body: vars.body },
      );
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: commentKeys.review(reviewId) });
    },
  });
}

export function useDeleteComment(reviewId: string) {
  const qc = useQueryClient();
  const key = commentKeys.review(reviewId);
  return useMutation({
    mutationFn: async (commentId: string) => {
      await api.delete(`/comments/${commentId}`);
      return commentId;
    },
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CanvasComment[]>(key);
      // Drop the comment and any of its replies.
      qc.setQueryData<CanvasComment[]>(key, (old) =>
        old?.filter((c) => c.id !== commentId && c.parent_id !== commentId),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/* -------- guest surface -------- */

export function useGuestComments(
  slug: string,
  token: string | null,
): UseQueryResult<CanvasComment[]> {
  return useQuery({
    queryKey: commentKeys.guest(slug),
    queryFn: async () => {
      const { data } = await api.get<CanvasComment[]>(
        `/r/${slug}/comments`,
        guestHeaders(token as string),
      );
      return data;
    },
    enabled: slug.length > 0 && token !== null,
  });
}

export interface CreateGuestCommentVars {
  payload: CommentCreatePayload;
  token: string;
  displayName: string | null;
}

export function useCreateGuestComment(slug: string) {
  const qc = useQueryClient();
  const key = commentKeys.guest(slug);
  return useMutation({
    mutationFn: async ({ payload, token }: CreateGuestCommentVars) => {
      const { data } = await api.post<CanvasComment>(
        `/r/${slug}/comments`,
        payload,
        guestHeaders(token),
      );
      return data;
    },
    onMutate: async ({ payload, displayName }: CreateGuestCommentVars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CanvasComment[]>(key);
      const now = new Date().toISOString();
      const optimistic: CanvasComment = {
        id: nextTempId(),
        review_id: "",
        parent_id: null,
        author_user_id: null,
        author_guest_id: "self",
        author_name: displayName ?? "You",
        author_type: "guest",
        is_mine: true,
        body: payload.body,
        status: "open",
        page_url: payload.page_url,
        pin_x_percent: payload.pin_x_percent,
        pin_y_percent: payload.pin_y_percent,
        element_selector: payload.element_selector,
        viewport_width: payload.viewport_width,
        viewport_height: payload.viewport_height,
        pin_x_absolute: payload.pin_x_absolute,
        pin_y_absolute: payload.pin_y_absolute,
        region_width: payload.region_width,
        region_height: payload.region_height,
        region_width_percent: payload.region_width_percent,
        region_height_percent: payload.region_height_percent,
        screenshot_url: null,
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData<CanvasComment[]>(key, (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}
