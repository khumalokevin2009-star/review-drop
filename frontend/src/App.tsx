import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import Dashboard from "@/pages/dashboard/Dashboard";

// Code-split the marketing page (it carries framer-motion) so the
// app bundle stays lean for logged-in users.
const Landing = lazy(() => import("@/pages/landing/Landing"));
// Code-split the canvas (iframe bridge + pin system) — only loaded when reviewing.
const CanvasView = lazy(() => import("@/pages/canvas/CanvasView"));
const ProjectView = lazy(() => import("@/pages/project/ProjectView"));
const ReviewPage = lazy(() => import("@/pages/review/ReviewPage"));

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

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
