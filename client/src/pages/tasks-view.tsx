import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppState } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskDialog } from "@/components/task-dialog";
import { TaskDetailPanel } from "@/components/task-detail-panel";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Bug,
  Lightbulb,
  CheckSquare,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Trash2,
  Upload,
  Link2,
  AlertTriangle,
  Loader2,
  MoreVertical,
  FolderOutput,
  Link,
  X,
  CheckSquare2,
} from "lucide-react";
import type { Task, Project, RepositorySafe } from "@shared/schema";
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

const typeIcons = {
  Bug: Bug,
  Feature: Lightbulb,
  Task: CheckSquare,
};

const typeColors: Record<string, string> = {
  Bug: "text-red-400",
  Feature: "text-blue-400",
  Task: "text-green-400",
};

const priorityIcons = {
  High: ArrowUp,
  Medium: ArrowRight,
  Low: ArrowDown,
};

const priorityColors: Record<string, string> = {
  High: "text-red-400",
  Medium: "text-yellow-400",
  Low: "text-muted-foreground",
};

const statusColors: Record<string, string> = {
  Open: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "In Progress": "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  "Quality Review": "bg-purple-500/15 text-purple-400 border-purple-500/20",
  Done: "bg-green-500/15 text-green-400 border-green-500/20",
};

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
    </div>
  );
}

function StatBadge({ label, count, className }: { label: string; count: number; className?: string }) {
  return (
    <div className={`text-center px-3 py-1.5 rounded-md ${className || "bg-muted"}`}>
      <div className="text-lg font-semibold" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{count}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

interface ProjectGroupData {
  project: Project;
  tasks: Task[];
}

function ProjectCard({ project, tasks, onClick }: { project: Project; tasks: Task[]; onClick: () => void }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "Done").length;
  const open = tasks.filter((t) => t.status === "Open").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const qualityReview = tasks.filter((t) => t.status === "Quality Review").length;

  return (
    <Card
      className="p-4 cursor-pointer hover-elevate"
      onClick={onClick}
      data-testid={`project-card-${project.id}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <span
          className="w-3 h-3 rounded-full shrink-0 mt-1"
          style={{ backgroundColor: project.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate" data-testid={`text-project-name-${project.id}`}>
            {project.name}
          </h3>
          {project.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
          )}
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">{total} tasks</Badge>
      </div>

      <ProgressBar done={done} total={total} />

      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border bg-blue-500/15 text-blue-400 border-blue-500/20">
          {open} Open
        </span>
        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border bg-yellow-500/15 text-yellow-400 border-yellow-500/20">
          {inProgress} In Progress
        </span>
        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border bg-purple-500/15 text-purple-400 border-purple-500/20">
          {qualityReview} Review
        </span>
        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border bg-green-500/15 text-green-400 border-green-500/20">
          {done} Done
        </span>
      </div>
    </Card>
  );
}

function AllTasksView() {
  const { selectedBusinessId, setSelectedProjectId, setCurrentView, setSelectedTaskId } = useAppState();

  const { data: allData = [], isLoading } = useQuery<ProjectGroupData[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "tasks"],
    enabled: !!selectedBusinessId,
  });

  const totalTasks = allData.reduce((sum, g) => sum + g.tasks.length, 0);
  const totalOpen = allData.reduce((sum, g) => sum + g.tasks.filter((t) => t.status === "Open").length, 0);
  const totalInProgress = allData.reduce((sum, g) => sum + g.tasks.filter((t) => t.status === "In Progress").length, 0);
  const totalQR = allData.reduce((sum, g) => sum + g.tasks.filter((t) => t.status === "Quality Review").length, 0);
  const totalDone = allData.reduce((sum, g) => sum + g.tasks.filter((t) => t.status === "Done").length, 0);

  const handleProjectClick = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedTaskId(null);
    setCurrentView("tasks");
  };

  if (!selectedBusinessId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Select a business to view tasks</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-all-tasks-title">All Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Overview across all projects</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <StatBadge label="Total" count={totalTasks} />
          <StatBadge label="Open" count={totalOpen} className="bg-blue-500/10" />
          <StatBadge label="In Progress" count={totalInProgress} className="bg-yellow-500/10" />
          <StatBadge label="Review" count={totalQR} className="bg-purple-500/10" />
          <StatBadge label="Done" count={totalDone} className="bg-green-500/10" />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-md" />
            ))}
          </div>
        ) : allData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No projects yet. Create one to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {allData.map((group) => (
              <ProjectCard
                key={group.project.id}
                project={group.project}
                tasks={group.tasks}
                onClick={() => handleProjectClick(group.project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectTasksView() {
  const { selectedBusinessId, selectedProjectId, selectedTaskId, setSelectedTaskId } = useAppState();
  const { toast } = useToast();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [moveTaskId, setMoveTaskId] = useState<string | null>(null);
  const [moveTargetProjectId, setMoveTargetProjectId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [bulkRepoDialogOpen, setBulkRepoDialogOpen] = useState(false);
  const [bulkRepoId, setBulkRepoId] = useState<string>("");
  const [bulkOnlyUnlinked, setBulkOnlyUnlinked] = useState(true);
  const [selectedForLink, setSelectedForLink] = useState<Set<string>>(new Set());
  const [linkMode, setLinkMode] = useState(false);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/businesses", selectedBusinessId, "projects", selectedProjectId],
    enabled: !!selectedBusinessId && !!selectedProjectId,
  });

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "projects", selectedProjectId, "tasks"],
    enabled: !!selectedBusinessId && !!selectedProjectId,
  });

  const { data: repositories = [] } = useQuery<RepositorySafe[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "repositories"],
    enabled: !!selectedBusinessId,
  });

  const { data: allProjects = [] } = useQuery<{ project: Project; tasks: Task[] }[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "tasks"],
    enabled: !!selectedBusinessId,
  });

  const otherProjects = useMemo(() => 
    allProjects.map(g => g.project).filter(p => p.id !== selectedProjectId),
    [allProjects, selectedProjectId]
  );

  const unlinkedCount = useMemo(() => tasks.filter((t) => !t.repositoryId).length, [tasks]);

  const suggestedRepo = useMemo(() => {
    const linked = tasks.filter((t) => t.repositoryId);
    if (linked.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const t of linked) {
      counts[t.repositoryId!] = (counts[t.repositoryId!] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [topRepoId, topCount] = sorted[0];
    if (topCount / linked.length >= 0.8) {
      return repositories.find((r) => r.id === topRepoId) || null;
    }
    return null;
  }, [tasks, repositories]);

  const bulkRepoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/businesses/${selectedBusinessId}/projects/${selectedProjectId}/bulk-update-repository`, {
        repositoryId: bulkRepoId,
        onlyUnlinked: bulkOnlyUnlinked,
      });
      return res.json();
    },
    onSuccess: (data: { updated: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", selectedProjectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      toast({ title: `${data.updated} tasks linked to repository` });
      setBulkRepoDialogOpen(false);
      setBulkRepoId("");
      setBulkOnlyUnlinked(true);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const bulkLinkMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      const res = await apiRequest("POST", `/api/businesses/${selectedBusinessId}/projects/${selectedProjectId}/link-tasks`, { taskIds });
      return res.json();
    },
    onSuccess: (data: { linked: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", selectedProjectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      toast({ title: `${data.linked} tasks linked together` });
      setSelectedForLink(new Set());
      setLinkMode(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error linking tasks", description: err.message, variant: "destructive" });
    },
  });

  const toggleTaskSelection = (taskId: string) => {
    setSelectedForLink(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const selectAllFilteredTasks = (filtered: Task[]) => {
    if (selectedForLink.size === filtered.length) {
      setSelectedForLink(new Set());
    } else {
      setSelectedForLink(new Set(filtered.map(t => t.id)));
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest("DELETE", `/api/businesses/${selectedBusinessId}/projects/${selectedProjectId}/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", selectedProjectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      toast({ title: "Task deleted" });
      setDeleteTaskId(null);
      if (selectedTaskId === deleteTaskId) setSelectedTaskId(null);
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ taskId, targetProjectId }: { taskId: string; targetProjectId: string }) => {
      const res = await apiRequest("POST", `/api/businesses/${selectedBusinessId}/projects/${selectedProjectId}/tasks/${taskId}/move`, {
        targetProjectId,
      });
      return res.json();
    },
    onSuccess: (data: { fromProject: string; toProject: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", selectedProjectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      toast({ title: `Task moved to ${data.toProject}` });
      setMoveTaskId(null);
      setMoveTargetProjectId("");
      if (selectedTaskId === moveTaskId) setSelectedTaskId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredTasks = statusFilter
    ? tasks.filter((t) => t.status === statusFilter)
    : tasks;

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const statuses = ["Open", "In Progress", "Quality Review", "Done"];

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "Done").length;
  const open = tasks.filter((t) => t.status === "Open").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const qualityReview = tasks.filter((t) => t.status === "Quality Review").length;

  if (!selectedProjectId) {
    return <AllTasksView />;
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 flex flex-col min-w-0 ${selectedTask ? "border-r border-border" : ""}`}>
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className="w-3.5 h-3.5 rounded-full shrink-0"
                style={{ backgroundColor: project?.color }}
              />
              <div>
                <h2 className="text-lg font-semibold" data-testid="text-project-name">
                  {project?.name}
                </h2>
                {project?.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{project.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {repositories.length > 0 && (
                <Button variant="outline" onClick={() => setBulkRepoDialogOpen(true)} data-testid="button-bulk-link-repo">
                  <Link2 className="w-4 h-4 mr-1" />
                  Link Repository
                </Button>
              )}
              {tasks.length >= 2 && (
                <Button
                  variant={linkMode ? "secondary" : "outline"}
                  onClick={() => { setLinkMode(!linkMode); setSelectedForLink(new Set()); }}
                  data-testid="button-link-tasks-mode"
                >
                  <Link className="w-4 h-4 mr-1" />
                  {linkMode ? "Cancel Linking" : "Link Tasks"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setImportDialogOpen(true)} data-testid="button-import-tasks">
                <Upload className="w-4 h-4 mr-1" />
                Import Tasks
              </Button>
              <Button onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }} data-testid="button-new-task">
                <Plus className="w-4 h-4 mr-1" />
                New Task
              </Button>
            </div>
          </div>

          <ProgressBar done={done} total={total} />

          <div className="flex items-center gap-2 flex-wrap">
            <StatBadge label="Total" count={total} />
            <StatBadge label="Open" count={open} className="bg-blue-500/10" />
            <StatBadge label="In Progress" count={inProgress} className="bg-yellow-500/10" />
            <StatBadge label="Review" count={qualityReview} className="bg-purple-500/10" />
            <StatBadge label="Done" count={done} className="bg-green-500/10" />
          </div>

          {unlinkedCount > 0 && repositories.length > 0 && (
            <div className="flex items-center gap-3 p-2.5 rounded-md border border-yellow-500/30 bg-yellow-500/5" data-testid="banner-unlinked-tasks">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
              <span className="text-xs text-muted-foreground flex-1">
                {unlinkedCount} task{unlinkedCount !== 1 ? "s" : ""} in this project {unlinkedCount !== 1 ? "have" : "has"} no repository linked.
                {suggestedRepo && (
                  <span> Most tasks use <span className="font-medium text-foreground">{suggestedRepo.name}</span>.</span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (suggestedRepo) setBulkRepoId(suggestedRepo.id);
                  setBulkOnlyUnlinked(true);
                  setBulkRepoDialogOpen(true);
                }}
                data-testid="button-banner-link-tasks"
              >
                <Link2 className="w-3 h-3 mr-1" />
                Link All Tasks
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto">
          <Button
            variant={statusFilter === null ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter(null)}
            data-testid="filter-all"
          >
            All
          </Button>
          {statuses.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              data-testid={`filter-${s.toLowerCase().replace(/\s/g, "-")}`}
            >
              {s}
              <span className="ml-1 text-xs opacity-60">
                {tasks.filter((t) => t.status === s).length}
              </span>
            </Button>
          ))}
        </div>

        {linkMode && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/20">
            <Checkbox
              checked={selectedForLink.size === filteredTasks.length && filteredTasks.length > 0}
              onCheckedChange={() => selectAllFilteredTasks(filteredTasks)}
            />
            <span className="text-xs text-muted-foreground flex-1">
              {selectedForLink.size === 0
                ? "Select tasks to link together"
                : `${selectedForLink.size} task${selectedForLink.size !== 1 ? "s" : ""} selected`}
            </span>
            {selectedForLink.size >= 2 && (
              <Button
                size="sm"
                onClick={() => bulkLinkMutation.mutate(Array.from(selectedForLink))}
                disabled={bulkLinkMutation.isPending}
              >
                {bulkLinkMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Link className="w-3 h-3 mr-1" />}
                Link {selectedForLink.size} Tasks
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setLinkMode(false); setSelectedForLink(new Set()); }}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {statusFilter ? `No ${statusFilter} tasks` : "No tasks yet. Create one to get started."}
            </div>
          ) : (
            filteredTasks.map((task) => {
              const TypeIcon = typeIcons[task.type];
              const PriorityIcon = priorityIcons[task.priority];
              return (
                <Card
                  key={task.id}
                  className={`p-3 cursor-pointer transition-colors hover-elevate ${
                    selectedTaskId === task.id ? "ring-1 ring-primary" : ""
                  } ${linkMode && selectedForLink.has(task.id) ? "ring-1 ring-primary bg-primary/5" : ""}`}
                  onClick={() => linkMode ? toggleTaskSelection(task.id) : setSelectedTaskId(task.id)}
                  data-testid={`task-card-${task.id}`}
                >
                  <div className="flex items-start gap-3">
                    {linkMode && (
                      <Checkbox
                        checked={selectedForLink.has(task.id)}
                        onCheckedChange={() => toggleTaskSelection(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 shrink-0"
                      />
                    )}
                    <TypeIcon className={`w-4 h-4 mt-0.5 shrink-0 ${typeColors[task.type]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground" data-testid={`text-task-id-${task.id}`}>
                          {task.id}
                        </span>
                        <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded-md border ${statusColors[task.status]}`}>
                          {task.status}
                        </span>
                        {task.dependencies && task.dependencies.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Link className="w-3 h-3" />
                            {task.dependencies.length}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-0.5 truncate" data-testid={`text-task-title-${task.id}`}>
                        {task.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PriorityIcon
                        className={`w-4 h-4 ${priorityColors[task.priority]}`}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`button-task-menu-${task.id}`}
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {otherProjects.length > 0 && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveTaskId(task.id);
                              }}
                              data-testid={`button-move-task-${task.id}`}
                            >
                              <FolderOutput className="w-4 h-4 mr-2" />
                              Move to Project
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTaskId(task.id);
                            }}
                            data-testid={`button-delete-task-${task.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          projectId={selectedProjectId}
          onEdit={(t) => {
            setEditingTask(t);
            setTaskDialogOpen(true);
          }}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        projectId={selectedProjectId}
        task={editingTask}
      />

      <BulkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        projectId={selectedProjectId}
      />

      <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this task. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTaskId && deleteMutation.mutate(deleteTaskId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!moveTaskId} onOpenChange={(val) => { if (!val) { setMoveTaskId(null); setMoveTargetProjectId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move Task to Another Project</DialogTitle>
            <DialogDescription>
              Select the project to move task <span className="font-mono font-medium">{moveTaskId}</span> to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Project</label>
              <Select value={moveTargetProjectId || "__none__"} onValueChange={(val) => setMoveTargetProjectId(val === "__none__" ? "" : val)}>
                <SelectTrigger data-testid="select-move-target-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a project</SelectItem>
                  {otherProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setMoveTaskId(null); setMoveTargetProjectId(""); }} data-testid="button-cancel-move">
                Cancel
              </Button>
              <Button
                onClick={() => moveTaskId && moveTargetProjectId && moveMutation.mutate({ taskId: moveTaskId, targetProjectId: moveTargetProjectId })}
                disabled={!moveTargetProjectId || moveMutation.isPending}
                data-testid="button-confirm-move"
              >
                {moveMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Moving...</>
                ) : (
                  <>Move Task</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkRepoDialogOpen} onOpenChange={(val) => { setBulkRepoDialogOpen(val); if (!val) { setBulkRepoId(""); setBulkOnlyUnlinked(true); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Tasks to Repository</DialogTitle>
            <DialogDescription>
              Bulk assign a repository to all tasks in this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Repository</label>
              <Select value={bulkRepoId || "__none__"} onValueChange={(val) => setBulkRepoId(val === "__none__" ? "" : val)}>
                <SelectTrigger data-testid="select-bulk-repo">
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a repository</SelectItem>
                  {repositories.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="only-unlinked"
                checked={bulkOnlyUnlinked}
                onCheckedChange={(v) => setBulkOnlyUnlinked(!!v)}
                data-testid="checkbox-only-unlinked"
              />
              <label htmlFor="only-unlinked" className="text-sm text-muted-foreground cursor-pointer">
                Only update tasks with no repository set ({unlinkedCount} task{unlinkedCount !== 1 ? "s" : ""})
              </label>
            </div>
            {bulkRepoId && (
              <p className="text-xs text-muted-foreground">
                This will link {bulkOnlyUnlinked ? `${unlinkedCount} unlinked` : `all ${tasks.length}`} task{(bulkOnlyUnlinked ? unlinkedCount : tasks.length) !== 1 ? "s" : ""} to{" "}
                <span className="font-medium text-foreground">{repositories.find((r) => r.id === bulkRepoId)?.name}</span>.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkRepoDialogOpen(false)} data-testid="button-cancel-bulk-repo">
                Cancel
              </Button>
              <Button
                onClick={() => bulkRepoMutation.mutate()}
                disabled={!bulkRepoId || bulkRepoMutation.isPending}
                data-testid="button-confirm-bulk-repo"
              >
                {bulkRepoMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Updating...</>
                ) : (
                  <>Update Tasks</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TasksView() {
  const { currentView } = useAppState();

  if (currentView === "all-tasks") {
    return <AllTasksView />;
  }

  return <ProjectTasksView />;
}
