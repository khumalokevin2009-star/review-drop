import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "@/pages/auth/AuthLayout";

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
          <Link
            to="/login"
            className="font-medium text-brand hover:text-brand-hover"
          >
            Back to login
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <MailCheck className="h-10 w-10 text-success" />
          <p className="text-sm text-text-secondary">
            If an account exists for that email, a reset link is on its way.
            Check your inbox.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@studio.com"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={forgotPassword.isPending}
          >
            {forgotPassword.isPending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
