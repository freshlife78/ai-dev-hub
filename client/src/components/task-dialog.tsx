import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppState } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, FileSearch } from "lucide-react";
import type { Task, Project, RepositorySafe } from "@shared/schema";

function getProjectDefaultRepo(projects: Project[], projectId: string): string {
  const project = projects.find((p) => p.id === projectId);
  return project?.defaultRepositoryId || "";
}

const COLORS = [
  "#58a6ff", "#3fb950", "#d29922", "#f85149",
  "#bc8cff", "#f778ba", "#79c0ff", "#7ee787",
];

const formSchema = z.object({
  type: z.enum(["Bug", "Feature", "Task"]),
  status: z.enum(["Open", "In Progress", "Quality Review", "Done"]),
  priority: z.enum(["High", "Medium", "Low"]),
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  reasoning: z.string(),
  fixSteps: z.string(),
  replitPrompt: z.string(),
  repositoryId: z.string().optional().default(""),
  filePath: z.string().optional().default(""),
});

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  task?: Task | null;
}

export function TaskDialog({ open, onOpenChange, projectId: initialProjectId, task }: TaskDialogProps) {
  const { toast } = useToast();
  const { selectedBusinessId } = useAppState();
  const isEditing = !!task;
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(COLORS[0]);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "projects"],
    enabled: !!selectedBusinessId,
  });

  const { data: repositories = [] } = useQuery<RepositorySafe[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "repositories"],
    enabled: !!selectedBusinessId,
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: task?.type || "Task",
      status: task?.status || "Open",
      priority: task?.priority || "Medium",
      title: task?.title || "",
      description: task?.description || "",
      reasoning: task?.reasoning || "",
      fixSteps: task?.fixSteps || "",
      replitPrompt: task?.replitPrompt || "",
      repositoryId: task?.repositoryId || "",
      filePath: task?.filePath || "",
    },
  });

  const prevTaskId = useRef<string | null>(null);
  useEffect(() => {
    const currentTaskId = task?.id || null;
    const justOpened = open && !prevTaskId.current && !task;
    const taskChanged = open && currentTaskId !== prevTaskId.current;

    if (open && (justOpened || taskChanged || !prevTaskId.current)) {
      setActiveProjectId(initialProjectId);
      setShowInlineCreate(false);
      setNewProjectName("");
      setNewProjectColor(COLORS[0]);
      const defaultRepoId = task?.repositoryId || getProjectDefaultRepo(projects, initialProjectId);
      form.reset({
        type: task?.type || "Task",
        status: task?.status || "Open",
        priority: task?.priority || "Medium",
        title: task?.title || "",
        description: task?.description || "",
        reasoning: task?.reasoning || "",
        fixSteps: task?.fixSteps || "",
        replitPrompt: task?.replitPrompt || "",
        repositoryId: defaultRepoId,
        filePath: task?.filePath || "",
      });
    }

    if (open) {
      prevTaskId.current = currentTaskId;
    } else {
      prevTaskId.current = null;
    }
  }, [open, initialProjectId, task]);

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const res = await apiRequest("POST", `/api/businesses/${selectedBusinessId}/projects`, data);
      return res.json();
    },
    onSuccess: (newProject: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects"] });
      setActiveProjectId(newProject.id);
      setShowInlineCreate(false);
      setNewProjectName("");
      toast({ title: `Project "${newProject.name}" created` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (isEditing) {
        return apiRequest("PUT", `/api/businesses/${selectedBusinessId}/projects/${activeProjectId}/tasks/${task.id}`, data);
      }
      return apiRequest("POST", `/api/businesses/${selectedBusinessId}/projects/${activeProjectId}/tasks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", activeProjectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "changelog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      toast({ title: isEditing ? "Task updated" : "Task created" });
      form.reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (!activeProjectId) {
      toast({ title: "Select a project first", variant: "destructive" });
      return;
    }
    if (isEditing && task) {
      const partial: Record<string, any> = {};
      const fields = ["type", "status", "priority", "title", "description", "reasoning", "fixSteps", "replitPrompt", "repositoryId", "filePath"] as const;
      for (const key of fields) {
        const newVal = data[key] ?? "";
        const oldVal = task[key] ?? "";
        if (newVal !== oldVal) {
          partial[key] = newVal;
        }
      }
      if (Object.keys(partial).length === 0) {
        toast({ title: "No changes detected" });
        onOpenChange(false);
        return;
      }
      mutation.mutate(partial as any);
    } else {
      mutation.mutate(data);
    }
  };

  const handleInlineCreateProject = () => {
    if (!newProjectName.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }
    createProjectMutation.mutate({ name: newProjectName, color: newProjectColor });
  };

  const handleProjectChange = (value: string) => {
    if (value === "__create_new__") {
      setShowInlineCreate(true);
    } else {
      setActiveProjectId(value);
      if (!isEditing) {
        const defaultRepoId = getProjectDefaultRepo(projects, value);
        form.setValue("repositoryId", defaultRepoId);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${task.id}` : "New Task"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update this task." : "Create a new task for this project."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!isEditing && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Project</label>
                <Select value={activeProjectId} onValueChange={handleProjectChange}>
                  <SelectTrigger data-testid="select-task-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} data-testid={`select-project-option-${p.id}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span>{p.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                    <SelectItem value="__create_new__" data-testid="select-create-new-project">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Plus className="w-3 h-3" />
                        <span>Create New Project</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {showInlineCreate && (
                  <div className="border border-border rounded-md p-3 space-y-3 bg-muted/30">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">New Project Name</label>
                      <Input
                        placeholder="Project name"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        data-testid="input-inline-project-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Color</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`w-5 h-5 rounded-md transition-all ${
                              newProjectColor === c
                                ? "ring-2 ring-offset-1 ring-offset-background ring-primary scale-110"
                                : "opacity-60"
                            }`}
                            style={{ backgroundColor: c }}
                            onClick={() => setNewProjectColor(c)}
                            data-testid={`inline-color-${c}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleInlineCreateProject}
                        disabled={createProjectMutation.isPending}
                        data-testid="button-inline-create-project"
                      >
                        {createProjectMutation.isPending ? (
                          <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Creating...</>
                        ) : (
                          "Create Project"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowInlineCreate(false)}
                        data-testid="button-cancel-inline-create"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-task-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Bug">Bug</SelectItem>
                        <SelectItem value="Feature">Feature</SelectItem>
                        <SelectItem value="Task">Task</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-task-priority">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-task-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Open">Open</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Quality Review">Quality Review</SelectItem>
                        <SelectItem value="Done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Task title" {...field} data-testid="input-task-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the task..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      data-testid="input-task-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reasoning"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reasoning</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Why does this need to be done?"
                      className="resize-none"
                      rows={2}
                      {...field}
                      data-testid="input-task-reasoning"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fixSteps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fix Steps</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Steps to fix or implement..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      data-testid="input-task-fixsteps"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="replitPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Replit Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="The prompt to send to Replit AI..."
                      className="resize-none font-mono text-sm"
                      rows={3}
                      {...field}
                      data-testid="input-task-prompt"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {repositories.length > 0 && (
              <FormField
                control={form.control}
                name="repositoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repository (optional)</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-task-repo">
                          <SelectValue placeholder="No repository" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No repository</SelectItem>
                        {repositories.map((r) => {
                          const isDefault = r.id === getProjectDefaultRepo(projects, activeProjectId);
                          return (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}{isDefault ? " (default)" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="filePath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <FileSearch className="w-3 h-3" />
                    Related File (optional)
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. server/routes.ts"
                      className="font-mono text-sm"
                      {...field}
                      data-testid="input-task-related-file"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-task"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending || !activeProjectId} data-testid="button-save-task">
                {mutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
