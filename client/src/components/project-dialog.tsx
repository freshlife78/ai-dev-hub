import { useEffect, useRef, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import type { Project, Task, RepositorySafe } from "@shared/schema";

const COLORS = [
  "#58a6ff", "#3fb950", "#d29922", "#f85149",
  "#bc8cff", "#f778ba", "#79c0ff", "#7ee787",
];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  color: z.string(),
  defaultRepositoryId: z.string().optional().default(""),
});

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
}

export function ProjectDialog({ open, onOpenChange, project }: ProjectDialogProps) {
  const { toast } = useToast();
  const { selectedBusinessId, selectedProjectId, setSelectedProjectId, setCurrentView } = useAppState();
  const isEditing = !!project;
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: allTasksData = [] } = useQuery<{ project: Project; tasks: Task[] }[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "tasks"],
    enabled: !!selectedBusinessId && isEditing,
  });

  const { data: repositories = [] } = useQuery<RepositorySafe[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "repositories"],
    enabled: !!selectedBusinessId,
  });

  const taskCount = isEditing
    ? (allTasksData.find((d) => d.project.id === project.id)?.tasks.length || 0)
    : 0;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      color: COLORS[0],
      defaultRepositoryId: "",
    },
  });

  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      form.reset({
        name: project?.name || "",
        description: project?.description || "",
        color: project?.color || COLORS[0],
        defaultRepositoryId: project?.defaultRepositoryId || "",
      });
    }
    prevOpen.current = open;
  }, [open, project]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      if (isEditing) {
        return apiRequest("PUT", `/api/businesses/${selectedBusinessId}/projects/${project.id}`, data);
      }
      return apiRequest("POST", `/api/businesses/${selectedBusinessId}/projects`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      toast({ title: isEditing ? "Project updated" : "Project created" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/businesses/${selectedBusinessId}/projects/${project!.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      if (selectedProjectId === project!.id) {
        setSelectedProjectId(null);
        setCurrentView("all-tasks");
      }
      toast({ title: "Project deleted" });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    mutation.mutate(data);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Project" : "New Project"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update the project details."
                : "Add a new project to this business."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Project" {...field} data-testid="input-project-name" />
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
                        placeholder="What is this project about?"
                        className="resize-none"
                        {...field}
                        data-testid="input-project-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <div className="flex gap-2 flex-wrap">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`w-7 h-7 rounded-md transition-all ${
                              field.value === c
                                ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                                : "opacity-70"
                            }`}
                            style={{ backgroundColor: c }}
                            onClick={() => field.onChange(c)}
                            data-testid={`color-${c}`}
                          />
                        ))}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
              {repositories.length > 0 && (
                <FormField
                  control={form.control}
                  name="defaultRepositoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Repository</FormLabel>
                      <Select
                        onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)}
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-project-default-repo">
                            <SelectValue placeholder="No default repository" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No default repository</SelectItem>
                          {repositories.map((r) => (
                            <SelectItem key={r.id} value={r.id} data-testid={`select-repo-option-${r.id}`}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">New tasks will automatically link to this repository</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="flex items-center justify-between gap-2 pt-2">
                <div>
                  {isEditing && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeleteConfirmOpen(true)}
                      data-testid="button-delete-project"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    data-testid="button-cancel-project"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={mutation.isPending} data-testid="button-save-project">
                    {mutation.isPending ? "Saving..." : isEditing ? "Save Changes" : "Create"}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{project?.name}"?
              {taskCount > 0
                ? ` This will remove ${taskCount} task${taskCount !== 1 ? "s" : ""} associated with this project.`
                : " This project has no tasks."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
