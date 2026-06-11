/**
 * Guest session token, persisted in localStorage under `rd_guest_{slug}`
 * (CLAUDE.md Section 9). Name/email are captured once, on the first comment
 * attempt — not on page load. While there is no token, `needsName` is true.
 */

import { useCallback, useState } from "react";

import api from "@/lib/api";

interface GuestSessionTokenResponse {
  session_token: string;
}

export interface UseGuestSession {
  token: string | null;
  needsName: boolean;
  displayName: string | null;
  isCreating: boolean;
  createSession: (name: string, email?: string) => Promise<string>;
}

const tokenKey = (slug: string) => `rd_guest_${slug}`;
const nameKey = (slug: string) => `rd_guest_name_${slug}`;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useGuestSession(slug: string): UseGuestSession {
  const [token, setToken] = useState<string | null>(() => readStorage(tokenKey(slug)));
  const [displayName, setDisplayName] = useState<string | null>(() =>
    readStorage(nameKey(slug)),
  );
  const [isCreating, setIsCreating] = useState(false);

  const createSession = useCallback(
    async (name: string, email?: string): Promise<string> => {
      setIsCreating(true);
      try {
        const { data } = await api.post<GuestSessionTokenResponse>(
          `/r/${slug}/session`,
          { display_name: name, email: email && email.length > 0 ? email : undefined },
        );
        try {
          localStorage.setItem(tokenKey(slug), data.session_token);
          localStorage.setItem(nameKey(slug), name);
        } catch {
          /* private mode / storage disabled — token still held in memory */
        }
        setToken(data.session_token);
        setDisplayName(name);
        return data.session_token;
      } finally {
        setIsCreating(false);
      }
    },
    [slug],
  );

  return { token, needsName: token === null, displayName, isCreating, createSession };
}
