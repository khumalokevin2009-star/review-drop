/**
 * Configured Axios instance (CLAUDE.md Section 5).
 * - Base URL from env
 * - Injects Bearer access token on every request
 * - On 401: attempts one token refresh, replays the request, otherwise
 *   clears the session and redirects to /login.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import {
  API_BASE_URL,
  clearTokens,
  getAccessToken,
  refreshAccessToken,
} from "@/lib/auth";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// --- Request: attach access token -----------------------------------------
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Response: refresh-and-retry on 401 ------------------------------------
interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableRequestConfig | undefined;
    const isAuthRoute = original?.url?.startsWith("/auth/") ?? false;

    if (
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !isAuthRoute
    ) {
      original._retried = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        clearTokens();
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  },
);

export default api;
