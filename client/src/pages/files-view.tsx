import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAppState } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderGit2,
  File,
  Folder,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  Copy,
  Bot,
  X,
  Loader2,
  ListTodo,
  Check,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  FileSearch,
  GitBranch,
  Settings,
  Wand2,
  ClipboardCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { GitHubFile, Task, Project, RepositorySafe } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import ReactMarkdown from "react-markdown";

interface ExtractedTask {
  title: string;
  type: "Bug" | "Feature" | "Task";
  priority: "High" | "Medium" | "Low";
  description: string;
  reasoning: string;
  fixSteps: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: "blob" | "tree";
  children: TreeNode[];
}

function buildTree(files: GitHubFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      let existing = current.find((n) => n.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          type: isLast ? file.type : "tree",
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes.sort((a, b) => {
      if (a.type === "tree" && b.type !== "tree") return -1;
      if (a.type !== "tree" && b.type === "tree") return 1;
      return a.name.localeCompare(b.name);
    });
  const sortRecursive = (nodes: TreeNode[]): TreeNode[] =>
    sort(nodes).map((n) => ({ ...n, children: sortRecursive(n.children) }));
  return sortRecursive(root);
}

function FileTreeItem({
  node, depth, selectedPath, onSelect, expandedPaths, toggleExpand,
}: {
  node: TreeNode; depth: number; selectedPath: string | null;
  onSelect: (path: string) => void; expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
}) {
  const isDir = node.type === "tree";
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  return (
    <div>
      <button
        className={`w-full flex items-center gap-1.5 py-1 px-2 text-xs hover-elevate rounded-md transition-colors ${
          isSelected ? "bg-accent text-accent-foreground" : "text-foreground/80"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => { if (isDir) { toggleExpand(node.path); } else { onSelect(node.path); } }}
        data-testid={`file-tree-${node.path}`}
      >
        {isDir ? (
          isExpanded ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
        ) : <span className="w-3" />}
        {isDir ? <Folder className="w-3.5 h-3.5 shrink-0 text-blue-400" /> : <File className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
        <span className="truncate font-mono">{node.name}</span>
      </button>
      {isDir && isExpanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
          ))}
        </div>
      )}
    </div>
  );
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    css: "css", html: "html", json: "json", md: "markdown",
    yml: "yaml", yaml: "yaml", sh: "bash", sql: "sql", xml: "xml",
    toml: "toml", env: "env",
  };
  return map[ext] || "plaintext";
}

export default function FilesView() {
  const { selectedBusinessId, selectedRepositoryId, selectedProjectId, reviewIntent, setReviewIntent, setCurrentView, setSelectedRepositoryId } = useAppState();
  const { toast } = useToast();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTaskId, setReviewTaskId] = useState<string>("");
  const [reviewQuestion, setReviewQuestion] = useState("");
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [dismissedIndices, setDismissedIndices] = useState<Set<number>>(new Set());
  const [createdIndices, setCreatedIndices] = useState<Set<number>>(new Set());
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [detectedFiles, setDetectedFiles] = useState<string[]>([]);
  const [reviewSourceTaskId, setReviewSourceTaskId] = useState<string | null>(null);
  const [pendingAutoRun, setPendingAutoRun] = useState(false);
  const [fixPromptDialogOpen, setFixPromptDialogOpen] = useState(false);
  const [generatedFixPrompt, setGeneratedFixPrompt] = useState<string | null>(null);

  const bizId = selectedBusinessId;
  const repoId = selectedRepositoryId;

  const { data: repositories = [] } = useQuery<RepositorySafe[]>({
    queryKey: ["/api/businesses", bizId, "repositories"],
    enabled: !!bizId,
  });

  const {
    data: files = [],
    isLoading: filesLoading,
    isError: filesError,
  } = useQuery<GitHubFile[]>({
    queryKey: ["/api/businesses", bizId, "repositories", repoId, "files"],
    enabled: !!bizId && !!repoId,
    staleTime: 60000,
    retry: 1,
  });

  const { data: allTasks = [] } = useQuery<{ project: { id: string; name: string }; tasks: Task[] }[]>({
    queryKey: ["/api/businesses", bizId, "tasks"],
    enabled: !!bizId,
  });

  const openTasks = allTasks.flatMap((g) => g.tasks).filter((t) => t.status !== "Done");

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/businesses", bizId, "projects"],
    enabled: !!bizId,
  });

  const extractTasksMutation = useMutation({
    mutationFn: async (params: { businessId: string; reviewText: string }) => {
      const res = await apiRequest("POST", "/api/claude/extract-tasks", params);
      return res.json();
    },
    onSuccess: (data) => {
      setExtractedTasks(data.tasks || []);
      setDismissedIndices(new Set());
      setCreatedIndices(new Set());
      setTargetProjectId(selectedProjectId || (projects.length > 0 ? projects[0].id : ""));
      setExtractDialogOpen(true);
    },
    onError: (err: Error) => {
      toast({ title: "Task extraction failed", description: err.message, variant: "destructive" });
    },
  });

  const generateFixPromptMutation = useMutation({
    mutationFn: async (params: { reviewResults: string; filePath: string; source?: string }) => {
      if (!reviewSourceTaskId || !bizId) throw new Error("No task linked to this review");
      const taskGroup = allTasks.find((g) => g.tasks.some((t) => t.id === reviewSourceTaskId));
      if (!taskGroup) throw new Error("Could not find the task's project");
      const res = await apiRequest("POST", `/api/businesses/${bizId}/projects/${taskGroup.project.id}/tasks/${reviewSourceTaskId}/generate-fix-prompt`, params);
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedFixPrompt(data.prompt);
      setFixPromptDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "tasks"] });
      if (selectedProjectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "projects", selectedProjectId, "tasks"] });
      }
      allTasks.forEach((g) => {
        queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "projects", g.project.id, "tasks"] });
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate fix prompt", description: err.message, variant: "destructive" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (params: { projectId: string; task: ExtractedTask }) => {
      const res = await apiRequest("POST", `/api/businesses/${bizId}/projects/${params.projectId}/tasks`, {
        title: params.task.title,
        type: params.task.type,
        status: "Open",
        priority: params.task.priority,
        description: params.task.description,
        reasoning: params.task.reasoning,
        fixSteps: params.task.fixSteps,
        replitPrompt: "",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "tasks"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create task", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!targetProjectId && projects.length > 0) {
      setTargetProjectId(selectedProjectId || projects[0].id);
    }
  }, [projects, selectedProjectId, targetProjectId]);

  useEffect(() => {
    if (reviewIntent) {
      setSelectedPath(reviewIntent.filePath);
      setReviewTaskId(reviewIntent.taskId);
      setReviewQuestion(reviewIntent.question);
      setReviewResult(null);
      setReviewOpen(true);
      setReviewSourceTaskId(reviewIntent.taskId);
      if (reviewIntent.detectedFiles) {
        setDetectedFiles(reviewIntent.detectedFiles);
      } else {
        setDetectedFiles([]);
      }
      if (reviewIntent.autoRun) {
        setPendingAutoRun(true);
      }
      setReviewIntent(null);

      const parts = reviewIntent.filePath.split("/");
      const paths = new Set<string>();
      for (let i = 1; i < parts.length; i++) {
        paths.add(parts.slice(0, i).join("/"));
      }
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        paths.forEach((p) => next.add(p));
        return next;
      });
    }
  }, [reviewIntent]);

  const handleExtractTasks = () => {
    if (!bizId || !reviewResult) return;
    extractTasksMutation.mutate({ businessId: bizId, reviewText: reviewResult });
  };

  const handleCreateTask = async (index: number) => {
    const task = extractedTasks[index];
    if (!targetProjectId || !task) return;
    await createTaskMutation.mutateAsync({ projectId: targetProjectId, task });
    setCreatedIndices((prev) => new Set(prev).add(index));
    toast({ title: "Task created", description: task.title });
  };

  const handleDismissTask = (index: number) => {
    setDismissedIndices((prev) => new Set(prev).add(index));
  };

  const {
    data: fileContent,
    isLoading: contentLoading,
  } = useQuery<{ content: string; name: string; path: string }>({
    queryKey: ["/api/businesses", bizId, "repositories", repoId, "files", "content", selectedPath],
    queryFn: async () => {
      const res = await fetch(
        `/api/businesses/${bizId}/repositories/${repoId}/files/content?path=${encodeURI(selectedPath!)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch file content");
      return res.json();
    },
    enabled: !!bizId && !!repoId && !!selectedPath,
  });

  const reviewMutation = useMutation({
    mutationFn: async (params: { repositoryId: string; filePath: string; taskId?: string; question?: string }) => {
      const res = await apiRequest("POST", "/api/claude/review", params);
      return res.json();
    },
    onSuccess: (data) => setReviewResult(data.review),
    onError: (err: Error) => {
      toast({ title: "Review failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (pendingAutoRun && repoId && selectedPath && fileContent && !reviewMutation.isPending) {
      setPendingAutoRun(false);
      reviewMutation.mutate({
        repositoryId: repoId,
        filePath: selectedPath,
        taskId: reviewTaskId && reviewTaskId !== "none" ? reviewTaskId : undefined,
        question: reviewQuestion || undefined,
      });
    }
  }, [pendingAutoRun, fileContent, selectedPath]);

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const handleRunReview = () => {
    if (!repoId || !selectedPath) return;
    setReviewResult(null);
    reviewMutation.mutate({
      repositoryId: repoId,
      filePath: selectedPath,
      taskId: reviewTaskId && reviewTaskId !== "none" ? reviewTaskId : undefined,
      question: reviewQuestion || undefined,
    });
  };

  if (!bizId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center">
            <FolderGit2 className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Select a business to browse files</p>
        </div>
      </div>
    );
  }

  if (repositories.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center">
            <GitBranch className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No repositories found for this business</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCurrentView("settings")}
            data-testid="button-go-to-settings"
          >
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Add Repository in Settings
          </Button>
        </div>
      </div>
    );
  }

  if (!repoId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center">
            <FolderGit2 className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Select a repository to browse files</p>
          <Select value="" onValueChange={(val) => setSelectedRepositoryId(val)}>
            <SelectTrigger className="w-64 text-xs" data-testid="select-repo-picker">
              <SelectValue placeholder="Choose a repository" />
            </SelectTrigger>
            <SelectContent>
              {repositories.map((r) => (
                <SelectItem key={r.id} value={r.id} data-testid={`select-repo-option-${r.id}`}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  const tree = buildTree(files);

  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    return nodes
      .map((node) => {
        if (node.type === "blob" && node.name.toLowerCase().includes(query.toLowerCase())) return node;
        if (node.type === "tree") {
          const filteredChildren = filterTree(node.children, query);
          if (filteredChildren.length > 0) return { ...node, children: filteredChildren };
        }
        return null;
      })
      .filter(Boolean) as TreeNode[];
  };

  const filteredTree = filterTree(tree, searchQuery);

  return (
    <div className="flex h-full">
      <div className="w-64 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Files</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "repositories", repoId, "files"] })}
              data-testid="button-refresh-files"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Select value={repoId} onValueChange={(val) => { setSelectedRepositoryId(val); setSelectedPath(null); setExpandedPaths(new Set()); }}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-repo-switcher">
              <SelectValue placeholder="Select repository" />
            </SelectTrigger>
            <SelectContent>
              {repositories.map((r) => (
                <SelectItem key={r.id} value={r.id} data-testid={`select-repo-switch-${r.id}`}>
                  <span className="flex items-center gap-1.5">
                    <GitBranch className="w-3 h-3 shrink-0" />
                    {r.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search files..."
              className="h-7 pl-7 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-files"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-1">
            {filesLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : filesError ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                <p>Could not load files.</p>
                <p className="mt-1">Check that the repository has a valid GitHub config and token in Repo Settings.</p>
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground text-center">
                {searchQuery ? "No files match your search" : "No files found in repository"}
              </div>
            ) : (
              filteredTree.map((node) => (
                <FileTreeItem key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={setSelectedPath} expandedPaths={expandedPaths} toggleExpand={toggleExpand} />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {selectedPath && fileContent ? (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <File className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-xs truncate" data-testid="text-file-path">{fileContent.path}</span>
                <Badge variant="secondary" className="text-[10px]">{getLanguage(fileContent.path)}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { navigator.clipboard.writeText(fileContent.content); toast({ title: "File content copied" }); }}
                  data-testid="button-copy-file"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant={reviewOpen ? "default" : "outline"}
                  onClick={() => { setReviewOpen(!reviewOpen); if (!reviewOpen) { setReviewResult(null); setReviewTaskId(""); setReviewQuestion(""); } }}
                  data-testid="button-review-claude"
                >
                  <Bot className="w-3 h-3 mr-1" />
                  Review with AI
                </Button>
              </div>
            </div>
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <ScrollArea className="flex-1 min-w-0">
                <div className="p-4">
                  {contentLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 20 }).map((_, i) => (
                        <Skeleton key={i} className="h-4 w-full" />
                      ))}
                    </div>
                  ) : (
                    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all" data-testid="file-content">
                      {fileContent.content.split("\n").map((line, i) => (
                        <div key={i} className="flex">
                          <span className="w-10 shrink-0 text-right pr-4 text-muted-foreground select-none opacity-50">{i + 1}</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              </ScrollArea>

              {reviewOpen && (
                <div className="w-80 border-l border-border flex flex-col shrink-0 bg-muted/30">
                  <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-medium">AI Review</span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setReviewOpen(false)} data-testid="button-close-review">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="p-4 space-y-3 border-b border-border">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Link to task (optional)</label>
                      <Select value={reviewTaskId} onValueChange={setReviewTaskId}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-review-task">
                          <SelectValue placeholder="No task linked" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No task linked</SelectItem>
                          {openTasks.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              <span className="font-mono">{t.id}</span> {t.title.length > 40 ? t.title.slice(0, 40) + "..." : t.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Custom question (optional)</label>
                      <Textarea
                        placeholder="What should I focus on?"
                        className="text-xs resize-none"
                        rows={2}
                        value={reviewQuestion}
                        onChange={(e) => setReviewQuestion(e.target.value)}
                        data-testid="input-review-question"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleRunReview}
                      disabled={reviewMutation.isPending}
                      data-testid="button-run-review"
                    >
                      {reviewMutation.isPending ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Reviewing...</>
                      ) : (
                        <><Bot className="w-3 h-3 mr-1" />Run Review</>
                      )}
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-4">
                      {reviewMutation.isPending && !reviewResult && (
                        <div className="flex flex-col items-center gap-3 py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">AI is reviewing the file...</p>
                        </div>
                      )}
                      {reviewResult && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">Review Result</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { navigator.clipboard.writeText(reviewResult); toast({ title: "Review copied to clipboard" }); }}
                              data-testid="button-copy-review"
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copy Review
                            </Button>
                          </div>
                          <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:text-xs [&_li]:text-xs [&_code]:text-[11px] [&_pre]:text-[11px] [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md" data-testid="review-result">
                            <ReactMarkdown>{reviewResult}</ReactMarkdown>
                          </div>
                          <div className="flex flex-col gap-2 mt-4">
                            {reviewSourceTaskId && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={async () => {
                                  try {
                                    let found = false;
                                    for (const g of allTasks) {
                                      const task = g.tasks.find((t) => t.id === reviewSourceTaskId);
                                      if (task) {
                                        if (task.status === "Quality Review") {
                                          toast({ title: "Task is already in Quality Review" });
                                          return;
                                        }
                                        await apiRequest("PUT", `/api/businesses/${bizId}/projects/${g.project.id}/tasks/${task.id}`, {
                                          status: "Quality Review",
                                        });
                                        queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "tasks"] });
                                        queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "changelog"] });
                                        toast({ title: `${task.id} moved to Quality Review` });
                                        found = true;
                                        break;
                                      }
                                    }
                                    if (!found) {
                                      toast({ title: "Task not found", variant: "destructive" });
                                    }
                                  } catch (err: any) {
                                    toast({ title: "Failed to update task status", description: err.message, variant: "destructive" });
                                  }
                                }}
                                data-testid="button-mark-quality-review"
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1.5" />
                                Mark as Quality Review
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={handleExtractTasks}
                              disabled={extractTasksMutation.isPending}
                              data-testid="button-create-tasks-from-review"
                            >
                              {extractTasksMutation.isPending ? (
                                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Extracting tasks...</>
                              ) : (
                                <><ListTodo className="w-3 h-3 mr-1.5" />Create Tasks from Review</>
                              )}
                            </Button>
                            {reviewSourceTaskId && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                  if (!reviewResult || !selectedPath) return;
                                  generateFixPromptMutation.mutate({
                                    reviewResults: reviewResult,
                                    filePath: selectedPath,
                                    source: "code_review",
                                  });
                                }}
                                disabled={generateFixPromptMutation.isPending}
                                data-testid="button-generate-fix-prompt"
                              >
                                {generateFixPromptMutation.isPending ? (
                                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Generating prompt...</>
                                ) : (
                                  <><Wand2 className="w-3 h-3 mr-1.5" />Generate Fix Prompt</>
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full"
                              onClick={() => { navigator.clipboard.writeText(reviewResult); toast({ title: "Review copied to clipboard" }); }}
                              data-testid="button-share-review"
                            >
                              <Copy className="w-3 h-3 mr-1.5" />
                              Share Review
                            </Button>
                          </div>

                          {detectedFiles.length > 1 && (
                            <div className="mt-4 space-y-2">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileSearch className="w-3 h-3" />
                                Other related files
                              </label>
                              <div className="space-y-1">
                                {detectedFiles.filter((f) => f !== selectedPath).map((f) => (
                                  <Button
                                    key={f}
                                    size="sm"
                                    variant="ghost"
                                    className="w-full justify-start font-mono text-xs"
                                    onClick={() => {
                                      setSelectedPath(f);
                                      setReviewResult(null);
                                      setPendingAutoRun(true);
                                      const parts = f.split("/");
                                      const paths: string[] = [];
                                      for (let i = 1; i < parts.length; i++) {
                                        paths.push(parts.slice(0, i).join("/"));
                                      }
                                      setExpandedPaths((prev) => {
                                        const next = new Set(prev);
                                        paths.forEach((p) => next.add(p));
                                        return next;
                                      });
                                    }}
                                    data-testid={`button-review-file-${f.replace(/\//g, "-")}`}
                                  >
                                    <File className="w-3 h-3 mr-1.5 shrink-0" />
                                    {f}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {!reviewMutation.isPending && !reviewResult && (
                        <div className="text-center py-8">
                          <p className="text-xs text-muted-foreground">Click "Run Review" to get AI analysis of this file.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center">
                <File className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                {files.length > 0 ? "Select a file to view its content" : "Connect a GitHub repo in Repo Settings to browse files"}
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={fixPromptDialogOpen} onOpenChange={setFixPromptDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              Fix Prompt Generated
            </DialogTitle>
          </DialogHeader>
          {generatedFixPrompt && (
            <div className="space-y-3">
              <div className="bg-muted rounded-md p-4 font-mono text-xs whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto" data-testid="text-generated-prompt">
                {generatedFixPrompt}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedFixPrompt);
                    toast({ title: "Prompt copied to clipboard" });
                  }}
                  data-testid="button-copy-fix-prompt"
                >
                  <ClipboardCheck className="w-3 h-3 mr-1.5" />
                  Copy to Clipboard
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFixPromptDialogOpen(false)}
                  data-testid="button-close-fix-prompt"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={extractDialogOpen} onOpenChange={setExtractDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Create Tasks from Review
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Add tasks to project</label>
            <Select value={targetProjectId} onValueChange={setTargetProjectId}>
              <SelectTrigger className="text-xs" data-testid="select-target-project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id} data-testid={`select-project-option-${p.id}`}>{p.name}</SelectItem>
                ))}
                {projects.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground text-center">No projects available</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            <div className="space-y-3 py-2">
              {extractedTasks.map((task, index) => {
                const isDismissed = dismissedIndices.has(index);
                const isCreated = createdIndices.has(index);
                if (isDismissed) return null;

                const priorityColor = task.priority === "High"
                  ? "text-red-500"
                  : task.priority === "Medium"
                    ? "text-yellow-500"
                    : "text-green-500";

                return (
                  <Card key={index} className={`p-4 space-y-2 ${isCreated ? "opacity-60" : ""}`} data-testid={`extracted-task-${index}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{task.title}</span>
                          <Badge variant="secondary" className="text-[10px]">{task.type}</Badge>
                          <span className={`text-[10px] font-medium ${priorityColor}`}>
                            {task.priority === "High" && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                            {task.priority}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{task.description}</p>
                        {task.reasoning && (
                          <p className="text-xs text-muted-foreground/70 italic">{task.reasoning}</p>
                        )}
                        {task.fixSteps && (
                          <div className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium">Fix:</span> {task.fixSteps}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isCreated ? (
                          <Badge variant="secondary" className="text-[10px]">
                            <Check className="w-3 h-3 mr-0.5" />
                            Created
                          </Badge>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleCreateTask(index)}
                              disabled={!targetProjectId || createTaskMutation.isPending}
                              data-testid={`button-create-task-${index}`}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Create Task
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDismissTask(index)}
                              data-testid={`button-dismiss-task-${index}`}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
              {extractedTasks.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-xs text-muted-foreground">No actionable items were found in the review.</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {extractedTasks.length > 0 && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground" data-testid="text-extract-progress">
                {createdIndices.size} created, {dismissedIndices.size} dismissed of {extractedTasks.length} items
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExtractDialogOpen(false)}
                data-testid="button-close-extract-dialog"
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
