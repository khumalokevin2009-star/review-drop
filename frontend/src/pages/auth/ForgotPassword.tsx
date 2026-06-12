import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "@/hooks/useAuth";
import {
  AuthButton,
  AuthInput,
  AuthLabel,
  AuthLayout,
  AuthTextLink,
} from "@/pages/auth/AuthLayout";

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = (values: ForgotForm) => {
    forgotPassword.mutate(values.email, {
      // Always show success — never reveal whether an email exists.
      onSuccess: () => setSent(true),
      onError: () => {
        toast.error("Something went wrong. Please try again.");
      },
    });
  };

  return (
    <AuthLayout
      title="Reset your password"
      description="We'll email you a link to reset it"
      footer={
        <>
          Remembered it?{" "}
          <AuthTextLink to="/login">Back to login</AuthTextLink>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <MailCheck className="h-10 w-10 text-white/70" />
          <p className="text-sm text-[#A1A1AA]">
            If an account exists for that email, a reset link is on its way.
            Check your inbox.
          </p>
        </div>
      ) : (
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
              <p className="text-xs text-[#EF4444]">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <AuthButton type="submit" disabled={forgotPassword.isPending}>
            {forgotPassword.isPending ? "Sending…" : "Send reset link"}
          </AuthButton>
        </form>
      )}
    </AuthLayout>
  );
}
