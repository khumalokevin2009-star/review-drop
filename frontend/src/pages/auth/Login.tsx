import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  AuthButton,
  AuthDivider,
  authFocusRing,
  AuthInput,
  AuthLabel,
  AuthLayout,
  AuthTextLink,
  GoogleAuthButton,
} from "@/pages/auth/AuthLayout";
import type { ApiError } from "@/types";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Maps the ?error= code the OAuth callback redirects back with to a message. */
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  unverified:
    "That Google account's email isn't verified — please sign in with your password.",
  unavailable: "This account is no longer active.",
  config: "Google sign-in isn't available right now.",
  state: "Google sign-in failed a security check. Please try again.",
  failed: "Google sign-in failed. Please try again.",
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const from =
    (location.state as { from?: string } | null)?.from ?? "/dashboard";

  // Surface an OAuth callback error (?error=...) once, then strip it from the URL.
  useEffect(() => {
    const code = searchParams.get("error");
    if (!code) return;
    toast.error(GOOGLE_ERROR_MESSAGES[code] ?? GOOGLE_ERROR_MESSAGES.failed);
    searchParams.delete("error");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (values: LoginForm) => {
    login.mutate(values, {
      onSuccess: () => {
        navigate(from, { replace: true });
      },
      onError: (error) => {
        const message =
          isAxiosError<ApiError>(error) && error.response?.data.detail
            ? error.response.data.detail
            : "Login failed. Check your email and password.";
        toast.error(message);
      },
    });
  };

  return (
    <AuthLayout
      title="Welcome back"
      description="Log in to your Orvelle account"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <AuthTextLink to="/register">Sign up</AuthTextLink>
        </>
      }
    >
      <div className="space-y-5">
        <GoogleAuthButton label="Continue with Google" />
        <AuthDivider>or</AuthDivider>
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-5"
          noValidate
        >
          <div className="space-y-2">
            <AuthLabel htmlFor="email">Email</AuthLabel>
            <AuthInput
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@studio.com"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-xs text-[#EF4444]">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <AuthLabel htmlFor="password">Password</AuthLabel>
              <Link
                to="/forgot-password"
                className={cn(
                  "rounded-sm text-xs text-[#A1A1AA] transition-colors hover:text-white",
                  authFocusRing,
                )}
              >
                Forgot password?
              </Link>
            </div>
            <AuthInput
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-[#EF4444]">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <AuthButton type="submit" disabled={login.isPending}>
            {login.isPending ? "Logging in…" : "Log in"}
          </AuthButton>
        </form>
      </div>
    </AuthLayout>
  );
}
