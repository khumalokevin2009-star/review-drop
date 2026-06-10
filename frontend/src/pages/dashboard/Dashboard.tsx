import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { LogOut, MousePointerClick, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useCreateProject, useProjects } from "@/hooks/useProjects";
import type { ApiError } from "@/types";

// --- Create-project form ------------------------------------------------------

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  client_name: z.string().optional(),
  url: z
    .string()
    .min(1, "Staging URL is required")
    .url("Enter a full URL, including https://"),
});

type CreateProjectForm = z.infer<typeof createProjectSchema>;

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const createProject = useCreateProject();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProjectForm>({
    resolver: zodResolver(createProjectSchema),
  });

  const onSubmit = (values: CreateProjectForm) => {
    createProject.mutate(
      {
        name: values.name,
        url: values.url,
        ...(values.client_name ? { client_name: values.client_name } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Project created");
          reset();
          onOpenChange(false);
        },
        onError: (error) => {
          const message =
            isAxiosError<ApiError>(error) && error.response?.data.detail
              ? error.response.data.detail
              : "Couldn't create the project. Please try again.";
          toast.error(message);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New review</DialogTitle>
          <DialogDescription>
            Add the staging site you want your client to review.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="name">Project name</Label>
            <Input
              id="name"
              placeholder="Acme homepage redesign"
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_name">
              Client name{" "}
              <span className="font-normal text-text-muted">(optional)</span>
            </Label>
            <Input
              id="client_name"
              placeholder="Acme Ltd"
              {...register("client_name")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">Staging URL</Label>
            <Input
              id="url"
              type="url"
              inputMode="url"
              placeholder="https://staging.acme.com"
              className="font-mono"
              {...register("url")}
            />
            {errors.url ? (
              <p className="text-xs text-destructive">{errors.url.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Loading / empty states ----------------------------------------------------

function ProjectCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </Card>
  );
}

interface EmptyStateProps {
  onCreate: () => void;
}

function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-surface px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
        <MousePointerClick className="h-6 w-6 text-brand" />
      </div>
      <div>
        <h2 className="text-base font-medium text-text-primary">
          Create your first review
        </h2>
        <p className="mt-1 max-w-sm text-sm text-text-secondary">
          Add a staging site, share the link, and your client can click
          anywhere to leave feedback — no account needed.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4" />
        New review
      </Button>
    </div>
  );
}

// --- Page -----------------------------------------------------------------------

export default function Dashboard() {
  const { user, logout } = useAuth();
  const projectsQuery = useProjects();
  const [createOpen, setCreateOpen] = useState(false);

  const projects = projectsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
              R
            </span>
            <span className="font-semibold text-text-primary">ReviewDrop</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <span className="hidden text-sm text-text-secondary sm:inline">
                {user.email}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-text-secondary"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              Projects
            </h1>
            <p className="text-sm text-text-secondary">
              Your client review sites
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New review
          </Button>
        </div>

        {projectsQuery.isError ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center">
            <p className="text-sm text-text-secondary">
              Couldn&apos;t load your projects.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void projectsQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projectsQuery.isLoading ? (
              <>
                <ProjectCardSkeleton />
                <ProjectCardSkeleton />
                <ProjectCardSkeleton />
              </>
            ) : projects.length === 0 ? (
              <EmptyState onCreate={() => setCreateOpen(true)} />
            ) : (
              projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))
            )}
          </div>
        )}
      </main>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
