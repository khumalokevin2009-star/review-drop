import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import Dashboard from "@/pages/dashboard/Dashboard";

// Code-split the marketing pages (they carry framer-motion) so the
// app bundle stays lean for logged-in users.
const Landing = lazy(() => import("@/pages/landing/Landing"));
const PricingPage = lazy(() => import("@/pages/landing/PricingPage"));
const FaqPage = lazy(() => import("@/pages/landing/FaqPage"));
const ContactPage = lazy(() => import("@/pages/landing/ContactPage"));
// Code-split the canvas (iframe bridge + pin system) — only loaded when reviewing.
const CanvasView = lazy(() => import("@/pages/canvas/CanvasView"));
const ProjectView = lazy(() => import("@/pages/project/ProjectView"));
const ReviewPage = lazy(() => import("@/pages/review/ReviewPage"));
const Settings = lazy(() => import("@/pages/settings/Settings"));
const BillingSuccess = lazy(() => import("@/pages/billing/BillingSuccess"));
const BillingCancel = lazy(() => import("@/pages/billing/BillingCancel"));

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Public marketing pages */}
      <Route
        path="/pricing"
        element={
          <Suspense fallback={<LoadingSpinner />}>
            <PricingPage />
          </Suspense>
        }
      />
      <Route
        path="/faq"
        element={
          <Suspense fallback={<LoadingSpinner />}>
            <FaqPage />
          </Suspense>
        }
      />
      <Route
        path="/contact"
        element={
          <Suspense fallback={<LoadingSpinner />}>
            <ContactPage />
          </Suspense>
        }
      />

      {/* Public guest review canvas (no auth — slug-gated). */}
      <Route
        path="/r/:slug"
        element={
          <Suspense fallback={<LoadingSpinner />}>
            <ReviewPage />
          </Suspense>
        }
      />

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/projects/:projectId"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <ProjectView />
            </Suspense>
          }
        />
        <Route
          path="/reviews/:reviewId/canvas"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <CanvasView />
            </Suspense>
          }
        />
        <Route
          path="/settings"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <Settings />
            </Suspense>
          }
        />
        {/* Stripe Checkout redirect landing pages (CLAUDE.md §12). */}
        <Route
          path="/billing/success"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <BillingSuccess />
            </Suspense>
          }
        />
        <Route
          path="/billing/cancel"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <BillingCancel />
            </Suspense>
          }
        />
      </Route>

      {/* Landing: unauthenticated marketing page; authed users are
          redirected to /dashboard inside the component. */}
      <Route
        path="/"
        element={
          <Suspense fallback={<LoadingSpinner />}>
            <Landing />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
