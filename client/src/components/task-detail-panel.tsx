import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppState } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Copy,
  Pencil,
  FolderGit2,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Bot,
  Loader2,
  FileSearch,
  FileCode,
  MessageSquare,
  Send,
  ClipboardList,
  User,
  RefreshCw,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Sparkles,
  Wand2,
  ChevronUp,
} from "lucide-react";
import type { Task, TaskStatus, RepositorySafe, DiscussionMessage, GeneratedPrompt } from "@shared/schema";
import ReactMarkdown from "react-markdown";

const priorityConfig: Record<string, { icon: typeof ArrowUp; color: string; label: string }> = {
  High: { icon: ArrowUp, color: "text-red-400", label: "High" },
  Medium: { icon: ArrowRight, color: "text-yellow-400", label: "Medium" },
  Low: { icon: ArrowDown, color: "text-muted-foreground", label: "Low" },
};

interface TaskDetailPanelProps {
  task: Task;
  projectId: string;
  onEdit: (task: Task) => void;
  onClose: () => void;
}

export function TaskDetailPanel({ task, projectId, onEdit, onClose }: TaskDetailPanelProps) {
  const { toast } = useToast();
  const { selectedBusinessId, selectedRepositoryId, setSelectedRepositoryId, setCurrentView, setReviewIntent } = useAppState();
  const [detectingFiles, setDetectingFiles] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "discussion">("details");
  const [discussionInput, setDiscussionInput] = useState("");
  const [autoAnalysisTriggered, setAutoAnalysisTriggered] = useState(false);
  const [autoAnalysisError, setAutoAnalysisError] = useState<string | null>(null);
  const [promptsExpanded, setPromptsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: repositories = [] } = useQuery<RepositorySafe[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "repositories"],
    enabled: !!selectedBusinessId,
  });

  const { data: discussion = [], isLoading: discussionLoading } = useQuery<DiscussionMessage[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "projects", projectId, "tasks", task.id, "discussion"],
    enabled: !!selectedBusinessId && activeTab === "discussion",
    staleTime: 0, // Always refetch when tab opens to prevent stale data
  });

  const discussMutation = useMutation({
    mutationFn: async (params: { message: string; isAutoAnalysis?: boolean; isReanalysis?: boolean }) => {
      const payload = {
        message: params.message,
        includeTaskContext: true,
        isAutoAnalysis: params.isAutoAnalysis || false,
        isReanalysis: params.isReanalysis || false,
      };
      console.log(`[DISCUSS-FE] Sending request:`, { isAutoAnalysis: payload.isAutoAnalysis, isReanalysis: payload.isReanalysis, messagePreview: params.message.substring(0, 80) });
      const res = await apiRequest("POST", `/api/businesses/${selectedBusinessId}/projects/${projectId}/tasks/${task.id}/discuss`, payload);
      const data = await res.json();
      console.log(`[DISCUSS-FE] Response received:`, { messagesCount: data.messages?.length, filesLoaded: data.filesLoaded });
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", projectId, "tasks", task.id, "discussion"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      setDiscussionInput("");
      setAutoAnalysisError(null);
      if (variables.isAutoAnalysis) {
        setAutoAnalysisTriggered(false);
      }
    },
    onError: (err: any, variables) => {
      let description = err.message || "Unknown error";
      try {
        const cleaned = description.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(cleaned);
        if (parsed.message) description = parsed.message;
      } catch {
        if (description.includes("rate_limit") || description.includes("429")) {
          description = "AI rate limit reached. Please wait a moment and try again.";
        }
      }
      if (variables.isAutoAnalysis) {
        setAutoAnalysisError(description);
      } else {
        toast({ title: "Discussion failed", description, variant: "destructive" });
      }
    },
  });

  const triggerAutoAnalysis = useCallback(() => {
    setAutoAnalysisTriggered(true);
    setAutoAnalysisError(null);
    discussMutation.mutate({
      message: "Analyze this task automatically. Check the code files provided (if any) against the task requirements and report your findings.",
      isAutoAnalysis: true,
    });
  }, [discussMutation]);

  useEffect(() => {
    if (
      activeTab === "discussion" &&
      !discussionLoading &&
      discussion.length === 0 &&
      !autoAnalysisTriggered &&
      !discussMutation.isPending &&
      selectedBusinessId &&
      !task.autoAnalysisComplete
    ) {
      triggerAutoAnalysis();
    }
  }, [activeTab, discussionLoading, discussion.length, autoAnalysisTriggered, discussMutation.isPending, selectedBusinessId, task.autoAnalysisComplete, triggerAutoAnalysis]);

  useEffect(() => {
    if (messagesEndRef.current && activeTab === "discussion") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [discussion, activeTab]);

  useEffect(() => {
    setAutoAnalysisTriggered(false);
    setAutoAnalysisError(null);
    setPromptsExpanded(false);
  }, [task.id]);

  const taskRepo = task.repositoryId ? repositories.find((r) => r.id === task.repositoryId) : null;

  const statusMutation = useMutation({
    mutationFn: async (newStatus: TaskStatus) => {
      return apiRequest("PUT", `/api/businesses/${selectedBusinessId}/projects/${projectId}/tasks/${task.id}`, {
        ...task,
        projectId: undefined,
        id: undefined,
        discussion: undefined,
        status: newStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "changelog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });
      toast({ title: "Status updated" });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const buildReviewRequest = () => {
    return `## Quality Review Request

**Task ID:** ${task.id}
**Title:** ${task.title}

**Description:**
${task.description}

**Fix Steps:**
${task.fixSteps}`;
  };

  const handleReviewCode = async () => {
    if (!selectedBusinessId) return;

    const repoId = task.repositoryId || selectedRepositoryId;
    if (!repoId) {
      toast({
        title: "No repository selected",
        description: "This task has no linked repository. Select a repository or link one to the task.",
        variant: "destructive",
      });
      return;
    }

    if (task.filePath) {
      setSelectedRepositoryId(repoId);
      setReviewIntent({
        filePath: task.filePath,
        taskId: task.id,
        question: `Focus on: ${task.title}`,
        autoRun: true,
        repositoryId: repoId,
      });
      setCurrentView("files");
      return;
    }

    setDetectingFiles(true);
    try {
      const res = await apiRequest("POST", "/api/claude/detect-files", {
        repositoryId: repoId,
        businessId: selectedBusinessId,
        taskTitle: task.title,
        taskDescription: task.description,
        taskFixSteps: task.fixSteps,
      });
      const data = await res.json();
      const files: string[] = data.files || [];
      const question: string = data.question || `Focus on: ${task.title}`;

      if (files.length === 0) {
        toast({
          title: "No files detected",
          description: "Could not determine which files to review. Try adding a Related File to the task, or use the File Viewer directly.",
          variant: "destructive",
        });
        return;
      }

      setSelectedRepositoryId(repoId);
      setReviewIntent({
        filePath: files[0],
        taskId: task.id,
        question,
        autoRun: true,
        detectedFiles: files.length > 1 ? files : undefined,
        repositoryId: repoId,
      });
      setCurrentView("files");
    } catch (err: any) {
      let description = err.message || "Unknown error";
      try {
        const parsed = JSON.parse(description.replace(/^\d+:\s*/, ""));
        if (parsed.message) description = parsed.message;
      } catch {}

      if (description.includes("GitHub configuration")) {
        description = "This repository needs a GitHub token configured. Go to Settings to add one.";
      }
      toast({ title: "Code review failed", description, variant: "destructive" });
    } finally {
      setDetectingFiles(false);
    }
  };

  const handleSendMessage = () => {
    const trimmed = discussionInput.trim();
    if (!trimmed) return;
    discussMutation.mutate({ message: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleReanalyze = () => {
    console.log(`[DISCUSS-FE] Re-Analyze button clicked for task ${task.id}`);
    setAutoAnalysisTriggered(true);
    setAutoAnalysisError(null);
    discussMutation.mutate({
      message: "Re-analyze this task. Re-fetch all files from GitHub main and check the LATEST code against the task requirements. Report updated findings based on the fresh code.",
      isAutoAnalysis: true,
      isReanalysis: true,
    });
  };

  const handleRefreshFiles = () => {
    console.log(`[DISCUSS-FE] Refresh Files button clicked for task ${task.id}`);
    const allTaskText = [task.description, task.fixSteps, task.reasoning, (task as any).replitPrompt].filter(Boolean).join(' ');
    const taskHasFileRefsInText = /(?:[\w@.-]+\/)+[\w.-]+\.\w{1,5}/.test(allTaskText);
    const hasFilesInHistory = !discussionLoading && discussion?.some((msg: any) => msg.filesLoaded && msg.filesLoaded.length > 0);
    const hasTaskFilePath = !!task.filePath;
    console.log(`[DISCUSS-FE] hasFilesInHistory=${hasFilesInHistory}, hasTaskFilePath=${hasTaskFilePath}, taskHasFileRefsInText=${taskHasFileRefsInText}, discussionLoading=${discussionLoading}`);
    if (discussionLoading) {
      discussMutation.mutate({
        message: "I've made changes and pushed to GitHub. Please re-fetch all files from main and review the latest code against the task requirements.",
        isReanalysis: true,
      });
      return;
    }
    if (!hasFilesInHistory && !hasTaskFilePath && !taskHasFileRefsInText) {
      toast({
        title: "No files to refresh",
        description: "No files have been loaded in this discussion yet. Mention a file path in your message (e.g. 'review src/app.tsx') to load files first.",
        variant: "destructive",
      });
      return;
    }
    discussMutation.mutate({
      message: "I've made changes and pushed to GitHub. Please re-fetch all files from main and review the latest code against the task requirements.",
      isReanalysis: true,
    });
  };

  const handleMarkAsDone = () => {
    statusMutation.mutate("Done");
  };

  const PriorityIcon = priorityConfig[task.priority]?.icon || ArrowRight;
  const isQualityReview = task.status === "Quality Review";
  const discussionCount = discussion.length;

  const autoAnalysisMsg = discussion.find((m) => m.isAutoAnalysis && m.sender === "claude");
  const analysisResult = task.autoAnalysisResult;

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const renderAutoAnalysisLoading = () => (
    <div className="flex flex-col items-center justify-center py-8 space-y-3" data-testid="auto-analysis-loading">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-primary animate-pulse" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xs font-medium text-foreground">Analyzing task...</p>
        <p className="text-[10px] text-muted-foreground">Fetching files and reviewing code</p>
      </div>
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    </div>
  );

  const renderAutoAnalysisError = () => (
    <div className="flex flex-col items-center justify-center py-8 space-y-3" data-testid="auto-analysis-error">
      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
        <CircleAlert className="w-5 h-5 text-destructive" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xs font-medium text-foreground">Auto-analysis failed</p>
        <p className="text-[10px] text-muted-foreground">{autoAnalysisError}</p>
      </div>
      <Button size="sm" variant="outline" onClick={handleReanalyze} data-testid="button-retry-analysis">
        <RefreshCw className="w-3 h-3 mr-1.5" />
        Retry Analysis
      </Button>
    </div>
  );

  const renderMessage = (msg: DiscussionMessage, i: number) => {
    const showDate = i === 0 || formatDate(msg.timestamp) !== formatDate(discussion[i - 1].timestamp);
    const isAuto = msg.isAutoAnalysis && msg.sender === "claude";

    return (
      <div key={msg.id}>
        {showDate && (
          <div className="flex items-center justify-center mb-3">
            <span className="text-[10px] text-muted-foreground/60 bg-muted px-2 py-0.5 rounded-full">{formatDate(msg.timestamp)}</span>
          </div>
        )}
        <div className={`flex gap-2.5 ${msg.sender === "user" ? "flex-row-reverse" : ""}`} data-testid={`message-${msg.id}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isAuto ? "bg-primary/15" : msg.sender === "user" ? "bg-primary/10" : "bg-muted"}`}>
            {msg.sender === "user" ? <User className="w-3 h-3 text-primary" /> : isAuto ? <Sparkles className="w-3 h-3 text-primary" /> : <Bot className="w-3 h-3 text-muted-foreground" />}
          </div>
          <div className={`flex-1 min-w-0 ${msg.sender === "user" ? "text-right" : ""}`}>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap" style={{ justifyContent: msg.sender === "user" ? "flex-end" : "flex-start" }}>
              <span className="text-[10px] font-medium text-muted-foreground">{msg.sender === "user" ? "You" : isAuto ? "Auto-Analysis" : "Claude"}</span>
              {isAuto && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0" data-testid="badge-auto-analysis">
                  Auto
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground/50">{formatTime(msg.timestamp)}</span>
            </div>
            {msg.sender === "claude" ? (
              <div className={`rounded-md p-3 text-left prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:text-xs [&_p]:mb-2 [&_li]:text-xs [&_code]:text-[11px] [&_pre]:text-[11px] [&_pre]:bg-background [&_pre]:p-2 [&_pre]:rounded ${isAuto ? "bg-primary/5 border border-primary/10" : "bg-muted"}`}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="bg-primary/10 rounded-md p-3 text-sm whitespace-pre-wrap inline-block text-left max-w-[90%]">
                {msg.content}
              </div>
            )}
            {msg.isReverification && msg.filesLoaded && msg.filesLoaded.length > 0 && (
              <div className={`inline-flex items-center gap-1 mt-1.5 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5 ${msg.sender === "user" ? "ml-auto" : ""}`} data-testid="badge-reverification">
                <RefreshCw className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="text-[10px] text-blue-500 font-medium">Re-fetched {msg.filesLoaded.length} file{msg.filesLoaded.length !== 1 ? "s" : ""} from GitHub main</span>
              </div>
            )}
            {msg.filesLoaded && msg.filesLoaded.length > 0 && (
              <div className={`flex flex-col gap-1 mt-1.5 ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                {msg.filesLoaded.map((fp) => (
                  <div key={fp} className="inline-flex items-center gap-1 bg-muted/60 rounded px-2 py-0.5" data-testid={`file-loaded-${fp}`}>
                    <FileCode className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-mono text-[10px] text-muted-foreground">{fp}</span>
                  </div>
                ))}
              </div>
            )}
            {isAuto && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {analysisResult === "complete" && task.status !== "Done" && (
                  <Button size="sm" variant="default" onClick={handleMarkAsDone} disabled={statusMutation.isPending} data-testid="button-mark-done">
                    <CheckCircle2 className="w-3 h-3 mr-1.5" />
                    Mark as Done
                  </Button>
                )}
                {analysisResult === "incomplete" && task.replitPrompt && (
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(task.replitPrompt, "Replit Prompt")} data-testid="button-copy-replit-prompt">
                    <Copy className="w-3 h-3 mr-1.5" />
                    Copy Replit Prompt
                  </Button>
                )}
                {analysisResult === "partial" && task.replitPrompt && (
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(task.replitPrompt, "Replit Prompt")} data-testid="button-copy-replit-prompt-partial">
                    <Copy className="w-3 h-3 mr-1.5" />
                    Copy Replit Prompt
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={handleReanalyze} disabled={discussMutation.isPending} data-testid="button-reanalyze">
                  <RefreshCw className="w-3 h-3 mr-1.5" />
                  Re-analyze
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-[400px] flex flex-col border-l border-border bg-background shrink-0">
      <div className="flex items-center justify-between gap-2 p-4 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-muted-foreground" data-testid="detail-task-id">
            {task.id}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {task.type}
          </Badge>
          {task.autoAnalysisComplete && (
            <Badge
              variant="secondary"
              className={`text-[9px] px-1.5 ${
                analysisResult === "complete" ? "text-green-600 dark:text-green-400" :
                analysisResult === "partial" ? "text-yellow-600 dark:text-yellow-400" :
                "text-red-600 dark:text-red-400"
              }`}
              data-testid="badge-analysis-result"
            >
              {analysisResult === "complete" ? <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" /> :
               analysisResult === "partial" ? <CircleDashed className="w-2.5 h-2.5 mr-0.5" /> :
               <CircleAlert className="w-2.5 h-2.5 mr-0.5" />}
              {analysisResult === "complete" ? "Done" : analysisResult === "partial" ? "Partial" : "Incomplete"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => onEdit(task)} data-testid="button-edit-task">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-detail">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex border-b border-border">
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${activeTab === "details" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
          onClick={() => setActiveTab("details")}
          data-testid="tab-details"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          Details
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${activeTab === "discussion" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
          onClick={() => setActiveTab("discussion")}
          data-testid="tab-discussion"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Discussion
          {discussionCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {discussionCount}
            </Badge>
          )}
        </button>
      </div>

      {activeTab === "details" && (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <div>
              <h3 className="font-semibold text-sm" data-testid="detail-task-title">{task.title}</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Status</label>
                <Select
                  value={task.status}
                  onValueChange={(val) => statusMutation.mutate(val as TaskStatus)}
                >
                  <SelectTrigger className="h-8 text-xs" data-testid="select-detail-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Quality Review">Quality Review</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Priority</label>
                <div className="flex items-center gap-1.5 h-8">
                  <PriorityIcon className={`w-4 h-4 ${priorityConfig[task.priority]?.color}`} />
                  <span className="text-sm">{task.priority}</span>
                </div>
              </div>
            </div>

            {taskRepo && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Repository</label>
                <div className="flex items-center gap-1.5">
                  <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground" data-testid="detail-repo-name">{taskRepo.name}</span>
                </div>
              </div>
            )}

            {task.filePath && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Related File</label>
                <div className="flex items-center gap-1.5">
                  <FileSearch className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground" data-testid="detail-related-file">{task.filePath}</span>
                </div>
              </div>
            )}

            {task.description && (
              <>
                <Separator />
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Description</label>
                  <p className="text-sm whitespace-pre-wrap" data-testid="detail-description">{task.description}</p>
                </div>
              </>
            )}

            {task.reasoning && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Reasoning</label>
                <p className="text-sm whitespace-pre-wrap" data-testid="detail-reasoning">{task.reasoning}</p>
              </div>
            )}

            {task.fixSteps && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Fix Steps</label>
                <p className="text-sm whitespace-pre-wrap" data-testid="detail-fixsteps">{task.fixSteps}</p>
              </div>
            )}

            <Separator />
            <div className="space-y-2">
              <Button
                size="sm"
                className="w-full"
                onClick={handleReviewCode}
                disabled={detectingFiles}
                data-testid="button-review-code"
              >
                {detectingFiles ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Detecting files...</>
                ) : (
                  <><Bot className="w-3 h-3 mr-1.5" />Review Code</>
                )}
              </Button>
            </div>

            {task.replitPrompt && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="text-xs text-muted-foreground">Replit Prompt</label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => copyToClipboard(task.replitPrompt, "Prompt")}
                      data-testid="button-copy-prompt"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <div className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap break-all" data-testid="detail-prompt">
                    {task.replitPrompt}
                  </div>
                </div>
              </>
            )}

            {task.generatedPrompts && task.generatedPrompts.length > 0 && (
              <>
                <Separator />
                <div>
                  <button
                    className="flex items-center justify-between gap-2 w-full text-left"
                    onClick={() => setPromptsExpanded(!promptsExpanded)}
                    data-testid="button-toggle-prompts"
                  >
                    <div className="flex items-center gap-1.5">
                      <Wand2 className="w-3 h-3 text-muted-foreground" />
                      <label className="text-xs text-muted-foreground cursor-pointer">Generated Prompts ({task.generatedPrompts.length})</label>
                    </div>
                    {promptsExpanded ? (
                      <ChevronUp className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-muted-foreground" />
                    )}
                  </button>
                  {promptsExpanded && (
                    <div className="mt-2 space-y-2">
                      {task.generatedPrompts.map((gp: GeneratedPrompt, idx: number) => (
                        <div key={gp.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px]">{gp.source === "code_review" ? "Review" : "Discussion"}</Badge>
                              {gp.filePath && <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">{gp.filePath}</span>}
                              <span className="text-[10px] text-muted-foreground/50">{new Date(gp.timestamp).toLocaleDateString()}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => copyToClipboard(gp.prompt, "Fix prompt")}
                              data-testid={`button-copy-generated-prompt-${idx}`}
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copy
                            </Button>
                          </div>
                          <div className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap break-all" data-testid={`text-generated-prompt-${idx}`}>
                            {gp.prompt}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {isQualityReview && (
              <>
                <Separator />
                <div className="space-y-2">
                  <label className="text-xs font-medium text-purple-400 block">Quality Review Panel</label>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-md p-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      This task is in quality review. Copy the review request or open the file viewer.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(buildReviewRequest(), "Review request")}
                        data-testid="button-copy-review"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy Review Request
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCurrentView("files")}
                        data-testid="button-open-files"
                      >
                        <FolderGit2 className="w-3 h-3 mr-1" />
                        Open File Viewer
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      )}

      {activeTab === "discussion" && (
        <div className="flex-1 flex flex-col min-h-0">
          {discussion.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border">
              <span className="text-[10px] text-muted-foreground">{discussion.length} message{discussion.length !== 1 ? "s" : ""}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefreshFiles}
                disabled={discussMutation.isPending}
                data-testid="button-refresh-files"
              >
                {discussMutation.isPending ? (
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1.5" />
                )}
                Refresh Files
              </Button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {discussionLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : discussion.length === 0 && discussMutation.isPending && autoAnalysisTriggered ? (
                renderAutoAnalysisLoading()
              ) : discussion.length === 0 && autoAnalysisError ? (
                renderAutoAnalysisError()
              ) : discussion.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">No discussion yet.</p>
                  <p className="text-xs text-muted-foreground/70">Ask a question about this task to start a conversation with AI. Mention file paths to load them into context.</p>
                </div>
              ) : (
                discussion.map((msg, i) => renderMessage(msg, i))
              )}
              {discussMutation.isPending && discussion.length > 0 && (
                <div className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-muted">
                    <Bot className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground">Claude</span>
                    </div>
                    <div className="bg-muted rounded-md p-3 inline-flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <Textarea
                placeholder="Ask about this task..."
                className="text-xs resize-none flex-1"
                rows={2}
                value={discussionInput}
                onChange={(e) => setDiscussionInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={discussMutation.isPending}
                data-testid="input-discussion"
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={!discussionInput.trim() || discussMutation.isPending}
                data-testid="button-send-discussion"
              >
                {discussMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-1.5">Enter to send. Mention file paths (e.g. <code className="font-mono">src/app.tsx</code>) to load them.</p>
          </div>
        </div>
      )}
    </div>
  );
}
