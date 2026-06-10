/**
 * Token storage + refresh logic (CLAUDE.md Section 5: JWT, 15min access / 7d refresh).
 *
 * Access token lives in memory only (XSS-safer); refresh token is persisted
 * in localStorage so sessions survive page reloads.
 */
import axios from "axios";

import type { AuthTokens } from "@/types";

const REFRESH_TOKEN_KEY = "rd_refresh_token";

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: AuthTokens): void {
  accessToken = tokens.access_token;
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearTokens(): void {
  accessToken = null;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function hasSession(): boolean {
  return getRefreshToken() !== null;
}

const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

/**
 * Exchange the refresh token for a new access token.
 * Uses a bare axios call (NOT the shared instance) to avoid interceptor loops.
 * Deduplicates concurrent refresh attempts.
 */
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return Promise.reject(new Error("No refresh token"));
  }

  refreshPromise = axios
    .post<{ access_token: string }>(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    })
    .then((res) => {
      setAccessToken(res.data.access_token);
      return res.data.access_token;
    })
    .catch((err: unknown) => {
      clearTokens();
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export { API_BASE_URL };
