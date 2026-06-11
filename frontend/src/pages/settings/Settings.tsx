/**
 * Settings — account profile, password change, and plan summary
 * (CLAUDE.md Sections 6, 8, 9, 10). Protected route /settings.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { ApiError, Plan, User } from "@/types";

// --- Account card ---------------------------------------------------------

const accountSchema = z.object({
  full_name: z.string().min(1, "Your name is required").max(255),
});
type AccountForm = z.infer<typeof accountSchema>;

function AccountCard({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: { full_name: user.full_name ?? "" },
  });

  const onSubmit = (values: AccountForm) => {
    updateProfile.mutate(
      { full_name: values.full_name },
      {
        onSuccess: (updated) => {
          toast.success("Profile saved");
          reset({ full_name: updated.full_name ?? "" });
        },
        onError: (error) => {
          const message =
            isAxiosError<ApiError>(error) && error.response?.data.detail
              ? error.response.data.detail
              : "Couldn't save your profile. Please try again.";
          toast.error(message);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your profile details</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" {...register("full_name")} />
            {errors.full_name ? (
              <p className="text-xs text-destructive">
                {errors.full_name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} readOnly disabled />
            <p className="text-xs text-text-muted">
              Email changes aren&apos;t supported yet — contact support if you
              need to switch address.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!isDirty || updateProfile.isPending}
            >
              {updateProfile.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// --- Password card ----------------------------------------------------------

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: z
      .string()
      .min(8, "At least 8 characters")
      .max(72, "At most 72 characters"),
    confirm_password: z.string(),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

function PasswordCard() {
  const { changePassword } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const onSubmit = (values: PasswordForm) => {
    changePassword.mutate(
      {
        current_password: values.current_password,
        new_password: values.new_password,
      },
      {
        onSuccess: () => {
          toast.success("Password changed");
          reset();
        },
        onError: (error) => {
          // Generic message — the backend doesn't confirm which part failed.
          const message =
            isAxiosError(error) && error.response?.status === 401
              ? "Incorrect password. Please try again."
              : "Couldn't change your password. Please try again.";
          toast.error(message);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Use at least 8 characters — a password manager helps
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="current_password">Current password</Label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              {...register("current_password")}
            />
            {errors.current_password ? (
              <p className="text-xs text-destructive">
                {errors.current_password.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              {...register("new_password")}
            />
            {errors.new_password ? (
              <p className="text-xs text-destructive">
                {errors.new_password.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              {...register("confirm_password")}
            />
            {errors.confirm_password ? (
              <p className="text-xs text-destructive">
                {errors.confirm_password.message}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={changePassword.isPending}>
              {changePassword.isPending ? "Changing…" : "Change password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// --- Plan card ----------------------------------------------------------------

interface PlanLimit {
  label: string;
  included: boolean;
}

/** Plan limits summary (CLAUDE.md Section 9). */
const PLAN_LIMITS: Record<Plan, PlanLimit[]> = {
  free: [
    { label: "2 active projects", included: true },
    { label: "1 review link per project", included: true },
    { label: "Unlimited guest commenters", included: true },
    { label: "PDF / CSV export", included: false },
    { label: "ReviewDrop watermark shown", included: false },
  ],
  pro: [
    { label: "Unlimited projects", included: true },
    { label: "Unlimited reviews per project", included: true },
    { label: "Unlimited guest commenters", included: true },
    { label: "PDF / CSV export", included: true },
    { label: "No watermark", included: true },
  ],
  studio: [
    { label: "Unlimited projects", included: true },
    { label: "Unlimited reviews per project", included: true },
    { label: "Unlimited guest commenters", included: true },
    { label: "PDF / CSV export", included: true },
    { label: "3 team members", included: true },
  ],
};

function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium lowercase",
        plan === "free"
          ? "bg-surface-elevated text-text-secondary"
          : "bg-brand/10 text-brand",
      )}
    >
      {plan}
    </span>
  );
}

function PlanCard({ user }: { user: User }) {
  const limits = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Plan</CardTitle>
            <CardDescription className="mt-1.5">
              What&apos;s included on your current plan
            </CardDescription>
          </div>
          <PlanBadge plan={user.plan} />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {limits.map((limit) => (
            <li
              key={limit.label}
              className="flex items-center gap-2 text-sm text-text-secondary"
            >
              {limit.included ? (
                <Check className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <Minus className="h-4 w-4 shrink-0 text-text-muted" />
              )}
              {limit.label}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex justify-end">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span wrapper: disabled buttons don't fire hover events */}
                <span tabIndex={0}>
                  <Button disabled>Upgrade</Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Billing coming soon</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Page -----------------------------------------------------------------------

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-3 w-48" />
          <Skeleton className="mt-6 h-9 w-full" />
          <Skeleton className="mt-3 h-9 w-full" />
        </Card>
      ))}
    </div>
  );
}

export default function Settings() {
  const { user, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 mb-3 text-text-secondary"
          >
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to projects
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Settings
          </h1>
          <p className="text-sm text-text-secondary">
            Manage your account and plan
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {isLoading || !user ? (
          <SettingsSkeleton />
        ) : (
          <div className="space-y-6">
            <AccountCard user={user} />
            <PasswordCard />
            <PlanCard user={user} />
          </div>
        )}
      </main>
    </div>
  );
}
