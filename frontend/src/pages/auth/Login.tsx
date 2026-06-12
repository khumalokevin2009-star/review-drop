import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  AuthButton,
  authFocusRing,
  AuthInput,
  AuthLabel,
  AuthLayout,
  AuthTextLink,
} from "@/pages/auth/AuthLayout";
import type { ApiError } from "@/types";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? "/dashboard";

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
    </AuthLayout>
  );
}
