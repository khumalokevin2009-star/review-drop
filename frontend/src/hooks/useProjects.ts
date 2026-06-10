/**
 * TanStack Query hooks for /projects (CLAUDE.md Section 8 contract).
 * Destructive/status mutations (delete, archive) are optimistic per
 * Section 10 UX rules: update UI immediately, roll back on error.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import api from "@/lib/api";
import type {
  Project,
  ProjectCreatePayload,
  ProjectUpdatePayload,
  Review,
} from "@/types";

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
  reviews: (id: string) => ["projects", id, "reviews"] as const,
};

// --- Queries ----------------------------------------------------------------

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: async () => {
      const { data } = await api.get<Project[]>("/projects");
      return data;
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: async () => {
      const { data } = await api.get<Project>(`/projects/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });
}

export function useProjectReviews(id: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.reviews(id),
    queryFn: async () => {
      const { data } = await api.get<Review[]>(`/projects/${id}/reviews`);
      return data;
    },
    enabled: Boolean(id) && enabled,
  });
}

// --- Mutations ---------------------------------------------------------------

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProjectCreatePayload) => {
      const { data } = await api.post<Project>("/projects", payload);
      return data;
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Project[]>(projectKeys.all, (old) =>
        old ? [created, ...old] : [created],
      );
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: ProjectUpdatePayload;
    }) => {
      const { data } = await api.patch<Project>(`/projects/${id}`, payload);
      return data;
    },
    // Optimistic: apply the patch to the cached list immediately.
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const previous = queryClient.getQueryData<Project[]>(projectKeys.all);
      queryClient.setQueryData<Project[]>(projectKeys.all, (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...payload } : p)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(projectKeys.all, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${id}`);
    },
    // Optimistic: remove from cached list immediately, roll back on error.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const previous = queryClient.getQueryData<Project[]>(projectKeys.all);
      queryClient.setQueryData<Project[]>(projectKeys.all, (old) =>
        old?.filter((p) => p.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(projectKeys.all, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

/**
 * Fetch the project's reviews and return the share URL of the first
 * active review, or null if none exists yet.
 */
export async function getShareUrl(projectId: string): Promise<string | null> {
  const { data } = await api.get<Review[]>(`/projects/${projectId}/reviews`);
  const active = data.find((r) => r.is_active);
  if (!active) return null;
  return `${window.location.origin}/r/${active.slug}`;
}
