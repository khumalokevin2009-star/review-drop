/**
 * Review comment export (CLAUDE.md Sections 8, 9) — a Pro-only feature.
 *
 * The endpoint streams a file (CSV or PDF), so the request uses
 * `responseType: "blob"` and we trigger the download client-side from an object
 * URL (revoked immediately after) rather than navigating away from the canvas.
 * Pro-gating is enforced by the backend; a Free user hitting this gets a 403.
 */
import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";

import api from "@/lib/api";

export type ExportFormat = "csv" | "pdf";

/** Pull the server-suggested filename out of a Content-Disposition header,
 * falling back to a sensible name the browser can still save under (the header
 * may be unreadable cross-origin if CORS doesn't expose it). */
function filenameFromDisposition(
  header: string | undefined,
  fallback: string,
): string {
  if (!header) return fallback;
  // RFC 5987 `filename*=UTF-8''…` wins over a plain `filename="…"` when present.
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* malformed encoding — fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
}

/** Read a FastAPI `{ detail }` message out of an error body that arrived as a
 * Blob (this request is `responseType: "blob"`, so error bodies are blobs too). */
async function detailFromBlob(blob: Blob, fallback: string): Promise<string> {
  try {
    const parsed: unknown = JSON.parse(await blob.text());
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "detail" in parsed &&
      typeof (parsed as { detail: unknown }).detail === "string"
    ) {
      return (parsed as { detail: string }).detail;
    }
  } catch {
    /* not JSON — use the fallback */
  }
  return fallback;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revocation: some browsers cancel an in-flight download if the object
  // URL is revoked synchronously right after click(). One tick is enough for
  // the navigation to be captured; the timeout still guarantees no leak.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useExportComments(reviewId: string) {
  return useMutation<string, unknown, ExportFormat>({
    mutationFn: async (format) => {
      const response = await api.get<Blob>(`/reviews/${reviewId}/export`, {
        params: { format },
        responseType: "blob",
      });
      const filename = filenameFromDisposition(
        response.headers["content-disposition"] as string | undefined,
        `orvelle-feedback.${format}`,
      );
      triggerDownload(response.data, filename);
      return filename;
    },
    onSuccess: (filename) => {
      toast.success(`Exported ${filename}`);
    },
    onError: async (error) => {
      let message = "Couldn't export your comments. Please try again.";
      if (isAxiosError(error) && error.response?.data instanceof Blob) {
        message = await detailFromBlob(error.response.data, message);
      }
      toast.error(message);
    },
  });
}
