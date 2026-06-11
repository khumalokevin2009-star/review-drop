/**
 * Auth state hook — TanStack Query for the /auth/me server state,
 * mutations for login/register/logout (CLAUDE.md Sections 5, 8).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import api from "@/lib/api";
import {
  clearTokens,
  hasSession,
  refreshAccessToken,
  setTokens,
} from "@/lib/auth";
import type {
  AuthTokens,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload,
  User,
  UserUpdatePayload,
} from "@/types";

const ME_QUERY_KEY = ["auth", "me"] as const;

async function fetchMe(): Promise<User> {
  // After a hard reload the in-memory access token is gone; restore it
  // from the refresh token before hitting /auth/me.
  await refreshAccessToken();
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    enabled: hasSession(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const login = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await api.post<AuthTokens>("/auth/login", payload);
      setTokens(data);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });

  const register = useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      await api.post("/auth/register", payload);
      // Auto-login after successful registration
      const { data } = await api.post<AuthTokens>("/auth/login", {
        email: payload.email,
        password: payload.password,
      });
      setTokens(data);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });

  const forgotPassword = useMutation({
    mutationFn: async (email: string) => {
      await api.post("/auth/forgot-password", { email });
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (payload: UserUpdatePayload) => {
      const { data } = await api.patch<User>("/auth/me", payload);
      return data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<User>(ME_QUERY_KEY, updated);
    },
  });

  const changePassword = useMutation({
    mutationFn: async (payload: ChangePasswordPayload) => {
      await api.post("/auth/change-password", payload);
    },
  });

  const logout = (): void => {
    clearTokens();
    queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
    window.location.assign("/login");
  };

  return {
    user: meQuery.data ?? null,
    isAuthenticated: hasSession(),
    isLoading: hasSession() && meQuery.isLoading,
    login,
    register,
    forgotPassword,
    updateProfile,
    changePassword,
    logout,
  };
}
