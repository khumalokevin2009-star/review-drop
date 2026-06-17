/**
 * Shared TypeScript types — mirrors backend Pydantic schemas (CLAUDE.md Sections 7–8).
 */

export type Plan = "free" | "pro" | "studio";

/** How the account signs in (CLAUDE.md §8). 'google' users have no password. */
export type AuthProvider = "password" | "google";

/** Raw Stripe subscription status mirrored from the backend (CLAUDE.md §12). */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | null;

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  plan: Plan;
  /** How the user signs in — 'password' or 'google' (linked accounts stay 'password'). */
  auth_provider: AuthProvider;
  /** Billing state — `plan` is the access projection of this. */
  subscription_status: SubscriptionStatus;
  /** ISO timestamp; a cancelled sub keeps Pro until this moment. */
  current_period_end: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** POST /billing/checkout and /billing/portal both return a redirect URL. */
export interface BillingSessionUrl {
  url: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
}

/** PATCH /auth/me — v1 supports full_name only. */
export interface UserUpdatePayload {
  full_name?: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export type ProjectStatus = "active" | "archived";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
  url: string;
  thumbnail_url: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  /** Convenience counts the API includes on ProjectRead for the dashboard. */
  open_comment_count?: number;
  /** ISO timestamp of most recent comment/review activity, if any. */
  last_activity_at?: string | null;
}

export interface ProjectCreatePayload {
  name: string;
  client_name?: string;
  url: string;
}

export interface ProjectUpdatePayload {
  name?: string;
  client_name?: string | null;
  url?: string;
  status?: ProjectStatus;
}

export type CommentStatus = "open" | "in_progress" | "resolved";

export interface Comment {
  id: string;
  review_id: string;
  parent_id: string | null;
  author_user_id: string | null;
  author_guest_id: string | null;
  body: string;
  status: CommentStatus;
  page_url: string;
  pin_x_percent: number | null;
  pin_y_percent: number | null;
  element_selector: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  pin_x_absolute: number | null;
  pin_y_absolute: number | null;
  /** Region selection (drag-to-select) — all four null for point comments. */
  region_width: number | null;
  region_height: number | null;
  region_width_percent: number | null;
  region_height_percent: number | null;
  screenshot_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  project_id: string;
  slug: string;
  name: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewCreatePayload {
  name?: string;
  expires_at?: string | null;
}

export interface ReviewUpdatePayload {
  name?: string;
  is_active?: boolean;
  expires_at?: string | null;
}

export interface GuestSession {
  id: string;
  review_id: string;
  display_name: string;
  email: string | null;
  created_at: string;
}

/** Standard API error shape from FastAPI. */
export interface ApiError {
  detail: string;
}
