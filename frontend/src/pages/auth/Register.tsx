import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "@/hooks/useAuth";
import {
  AuthButton,
  AuthDivider,
  AuthInput,
  AuthLabel,
  AuthLayout,
  AuthTextLink,
  GoogleAuthButton,
} from "@/pages/auth/AuthLayout";
import type { ApiError } from "@/types";

const registerSchema = z.object({
  full_name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const { register: registerMutation } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = (values: RegisterForm) => {
    registerMutation.mutate(values, {
      onSuccess: () => {
        toast.success("Welcome to Orvelle!");
        navigate("/dashboard", { replace: true });
      },
      onError: (error) => {
        const message =
          isAxiosError<ApiError>(error) && error.response?.data.detail
            ? error.response.data.detail
            : "Registration failed. Please try again.";
        toast.error(message);
      },
    });
  };

  return (
    <AuthLayout
      title="Create your account"
      description="Free plan — no credit card required"
      footer={
        <>
          Already have an account?{" "}
          <AuthTextLink to="/login">Log in</AuthTextLink>
        </>
      }
    >
      <div className="space-y-5">
        <GoogleAuthButton label="Sign up with Google" />
        <AuthDivider>or</AuthDivider>
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-5"
          noValidate
        >
          <div className="space-y-2">
            <AuthLabel htmlFor="full_name">Full name</AuthLabel>
            <AuthInput
              id="full_name"
              type="text"
              autoComplete="name"
              placeholder="Sam Taylor"
              {...register("full_name")}
            />
            {errors.full_name ? (
              <p className="text-xs text-[#EF4444]">
                {errors.full_name.message}
              </p>
            ) : null}
          </div>

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
            <AuthLabel htmlFor="password">Password</AuthLabel>
            <AuthInput
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-[#EF4444]">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <AuthButton type="submit" disabled={registerMutation.isPending}>
            {registerMutation.isPending
              ? "Creating account…"
              : "Create account"}
          </AuthButton>
        </form>
      </div>
    </AuthLayout>
  );
}
