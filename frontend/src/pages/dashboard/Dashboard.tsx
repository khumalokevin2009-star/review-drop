import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { UserMenu } from "@/components/layout/UserMenu";
import { Logo } from "@/components/shared/Logo";
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
    <div className="col-span-full flex flex-col items-start gap-5 rounded-xl border border-border px-8 py-16 sm:px-12 sm:py-20">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">
        No projects yet
      </span>
      <h2 className="max-w-xl text-[clamp(1.75rem,3vw,2.5rem)] font-medium leading-[1.1] tracking-tight text-text-primary">
        Create your first review
        <span aria-hidden="true" className="text-brand">
          .
        </span>
      </h2>
      <p className="max-w-md text-sm leading-relaxed text-text-secondary">
        Add a staging site, share the link, and your client can click anywhere
        to leave feedback — no account needed.
      </p>
      <Button onClick={onCreate} className="mt-2">
        <Plus className="h-4 w-4" />
        New review
      </Button>
    </div>
  );
}

// --- Page -----------------------------------------------------------------------

export default function Dashboard() {
  const projectsQuery = useProjects();
  const [createOpen, setCreateOpen] = useState(false);
  const reduced = useReducedMotion();

  const projects = projectsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 sm:px-8">
          <Link
            to="/dashboard"
            aria-label="Orvelle dashboard"
            className="rounded-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Logo size="md" />
          </Link>
          <UserMenu />
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">
              Workspace
            </span>
            <h1 className="mt-2 text-2xl font-medium tracking-tight text-text-primary">
              Projects
            </h1>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New review
          </Button>
        </div>

        {projectsQuery.isError ? (
          <div className="rounded-xl border border-border px-6 py-12 text-center">
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
              projects.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    ease: [0.16, 1, 0.3, 1],
                    delay: reduced ? 0 : Math.min(i * 0.04, 0.24),
                  }}
                >
                  <ProjectCard project={project} />
                </motion.div>
              ))
            )}
          </div>
        )}
      </main>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
