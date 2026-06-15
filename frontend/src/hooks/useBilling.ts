/**
 * Billing actions (CLAUDE.md Section 12). Checkout and the Customer Portal are
 * Stripe-hosted, so each mutation just asks the backend for a redirect URL and
 * sends the browser there — the frontend never touches card data.
 */
import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";

import api from "@/lib/api";
import type { ApiError, BillingSessionUrl } from "@/types";

async function createCheckoutSession(): Promise<string> {
  const { data } = await api.post<BillingSessionUrl>("/billing/checkout");
  return data.url;
}

async function createPortalSession(): Promise<string> {
  const { data } = await api.post<BillingSessionUrl>("/billing/portal");
  return data.url;
}

function billingErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiError>(error)) {
    if (error.response?.status === 503) {
      return "Billing isn't available right now. Please try again shortly.";
    }
    if (error.response?.data?.detail) return error.response.data.detail;
  }
  return fallback;
}

export function useBilling() {
  const startCheckout = useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: (url) => {
      // Redirect to Stripe Checkout (hosted).
      window.location.assign(url);
    },
    onError: (error) => {
      toast.error(
        billingErrorMessage(error, "Couldn't start checkout. Please try again."),
      );
    },
  });

  const openPortal = useMutation({
    mutationFn: createPortalSession,
    onSuccess: (url) => {
      window.location.assign(url);
    },
    onError: (error) => {
      toast.error(
        billingErrorMessage(error, "Couldn't open billing. Please try again."),
      );
    },
  });

  return { startCheckout, openPortal };
}
