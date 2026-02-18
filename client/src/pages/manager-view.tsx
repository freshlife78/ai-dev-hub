import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppState } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  BrainCircuit,
  Send,
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  Activity,
  FileText,
  CalendarDays,
  Trash2,
  ArrowRight,
  Inbox,
  ListChecks,
  FolderPlus,
  RefreshCw,
  Check,
  X,
  CheckCheck,
  ScanSearch,
  GitBranch,
  FolderTree,
  FileCode,
  Link2,
  Mic,
  MicOff,
  Paperclip,
  FileText as FileIcon,
  Image as ImageIcon,
  FolderOutput,
} from "lucide-react";
import type { ManagerMessage, ManagerAction, ManagerAlert, ChangelogEntry } from "@shared/schema";

interface ManagerData {
  messages: ManagerMessage[];
  alerts: ManagerAlert[];
  stats: {
    totalOpen: number;
    totalInProgress: number;
    totalDone: number;
    totalBlocked: number;
    completedThisWeek: number;
    pendingInbox: number;
    healthScore: number;
  };
  projectStats: {
    id: string;
    name: string;
    color: string;
    total: number;
    done: number;
    pct: number;
  }[];
  recentActivity: ChangelogEntry[];
}

function getHealthColor(score: number) {
  if (score >= 75) return "text-green-500";
  if (score >= 50) return "text-yellow-500";
  return "text-red-500";
}

function getHealthLabel(score: number) {
  if (score >= 75) return "Healthy";
  if (score >= 50) return "Needs Attention";
  return "At Risk";
}

const severityConfig = {
  critical: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20" },
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
};

const actionTypeConfig: Record<string, { icon: typeof Inbox; label: string; color: string }> = {
  CREATE_INBOX_ITEM: { icon: Inbox, label: "Add to Inbox", color: "text-blue-500" },
  CREATE_TASK: { icon: ListChecks, label: "Create Task", color: "text-green-500" },
  UPDATE_TASK_STATUS: { icon: RefreshCw, label: "Update Task Status", color: "text-yellow-500" },
  CREATE_PROJECT: { icon: FolderPlus, label: "Create Project", color: "text-purple-500" },
  BULK_UPDATE_REPOSITORY: { icon: Link2, label: "Link Repository", color: "text-cyan-500" },
  MOVE_TASK: { icon: FolderOutput, label: "Move Task", color: "text-orange-500" },
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(text: string) {
  let html = escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-4 mb-1.5">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="text-xs bg-muted px-1 py-0.5 rounded font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  return html;
}

function getActionSummary(action: ManagerAction): { title: string; details: string[] } {
  const d = action.data;
  switch (action.type) {
    case "CREATE_INBOX_ITEM":
      return {
        title: d.title || "Untitled",
        details: [
          `Type: ${d.type || "Bug"}`,
          `Priority: ${d.priority || "Medium"}`,
          d.description ? `${d.description.slice(0, 120)}${d.description.length > 120 ? "..." : ""}` : "",
        ].filter(Boolean),
      };
    case "CREATE_TASK":
      return {
        title: d.title || "Untitled Task",
        details: [
          `Project: ${d.projectName || d.projectId || "Unknown"}`,
          `Type: ${d.type || "Task"} / Priority: ${d.priority || "Medium"}`,
          d.description ? `${d.description.slice(0, 120)}${d.description.length > 120 ? "..." : ""}` : "",
        ].filter(Boolean),
      };
    case "UPDATE_TASK_STATUS":
      return {
        title: d.taskTitle || d.taskId || "Unknown Task",
        details: [
          `Change to: ${d.newStatus}`,
          d.reason ? `Reason: ${d.reason}` : "",
        ].filter(Boolean),
      };
    case "CREATE_PROJECT":
      return {
        title: d.name || "New Project",
        details: [
          d.description ? d.description.slice(0, 120) : "",
        ].filter(Boolean),
      };
    case "BULK_UPDATE_REPOSITORY":
      return {
        title: `Link ${d.repositoryName || "Repository"} to ${d.projectName || "Project"}`,
        details: [
          d.onlyUnlinked !== false ? "Only tasks with no repository set" : "All tasks in the project",
        ],
      };
    case "MOVE_TASK":
      return {
        title: `Move ${d.taskTitle || d.taskId || "Task"}`,
        details: [
          `From: ${d.fromProjectName || d.fromProjectId || "Unknown"}`,
          `To: ${d.toProjectName || d.toProjectId || "Unknown"}`,
          d.reason ? `Reason: ${d.reason}` : "",
        ].filter(Boolean),
      };
    default:
      return { title: "Unknown Action", details: [] };
  }
}

function ActionCard({
  action,
  actionIndex,
  messageId,
  businessId,
}: {
  action: ManagerAction;
  actionIndex: number;
  messageId: string;
  businessId: string;
}) {
  const { toast } = useToast();
  const cfg = actionTypeConfig[action.type] || actionTypeConfig.CREATE_INBOX_ITEM;
  const Icon = cfg.icon;
  const summary = getActionSummary(action);

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/businesses/${businessId}/manager/execute-action`, {
        actionType: action.type,
        data: action.data,
        messageId,
        actionIndex,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "manager"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "tasks"] });
      toast({ title: "Action completed", description: `${cfg.label} successful` });
    },
    onError: (err: any) => {
      let msg = err.message || "Failed to execute action";
      try {
        const cleaned = msg.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(cleaned);
        if (parsed.message) msg = parsed.message;
      } catch {}
      toast({ title: "Action failed", description: msg, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/businesses/${businessId}/manager/update-action-status`, {
        messageId,
        actionIndex,
        status: "cancelled",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "manager"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to cancel", description: err.message || "Could not cancel action", variant: "destructive" });
    },
  });

  const isPending = action.status === "pending";
  const isApproved = action.status === "approved";
  const isCancelled = action.status === "cancelled";

  return (
    <Card
      className={`p-3 mt-2 ${isCancelled ? "opacity-50" : ""} ${isApproved ? "border-green-500/30 bg-green-500/5" : ""}`}
      data-testid={`action-card-${actionIndex}`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`p-1.5 rounded-md ${isApproved ? "bg-green-500/10" : "bg-muted"}`}>
          <Icon className={`w-4 h-4 ${isApproved ? "text-green-500" : cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{cfg.label}</span>
            {isApproved && <Badge variant="secondary" className="text-[9px] text-green-500">Approved</Badge>}
            {isCancelled && <Badge variant="secondary" className="text-[9px] text-muted-foreground">Cancelled</Badge>}
          </div>
          <div className="text-sm font-medium mt-0.5" data-testid={`action-title-${actionIndex}`}>{summary.title}</div>
          {summary.details.map((d, i) => (
            <div key={i} className="text-[11px] text-muted-foreground mt-0.5">{d}</div>
          ))}
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-border">
          <Button
            size="sm"
            onClick={() => executeMutation.mutate()}
            disabled={executeMutation.isPending || cancelMutation.isPending}
            data-testid={`button-approve-action-${actionIndex}`}
          >
            {executeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || executeMutation.isPending}
            data-testid={`button-cancel-action-${actionIndex}`}
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}

function BatchApproveBar({
  actions,
  messageId,
  businessId,
}: {
  actions: ManagerAction[];
  messageId: string;
  businessId: string;
}) {
  const { toast } = useToast();
  const pendingActions = actions.filter(a => a.status === "pending");
  const [isExecuting, setIsExecuting] = useState(false);

  if (pendingActions.length < 2) return null;

  const handleApproveAll = async () => {
    setIsExecuting(true);
    try {
      for (let i = 0; i < actions.length; i++) {
        if (actions[i].status !== "pending") continue;
        await apiRequest("POST", `/api/businesses/${businessId}/manager/execute-action`, {
          actionType: actions[i].type,
          data: actions[i].data,
          messageId,
          actionIndex: i,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "manager"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "tasks"] });
      toast({ title: "All actions approved", description: `${pendingActions.length} actions completed` });
    } catch (err: any) {
      toast({ title: "Some actions failed", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", businessId, "manager"] });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2" data-testid="batch-approve-bar">
      <Button
        size="sm"
        onClick={handleApproveAll}
        disabled={isExecuting}
        data-testid="button-approve-all"
      >
        {isExecuting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5 mr-1.5" />}
        Approve All {pendingActions.length}
      </Button>
    </div>
  );
}

export default function ManagerView() {
  const { selectedBusinessId } = useAppState();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<ManagerData>({
    queryKey: ["/api/businesses", selectedBusinessId, "manager"],
    enabled: !!selectedBusinessId,
    refetchInterval: 30000,
  });

  const [repoScanData, setRepoScanData] = useState<any[] | null>(null);

  useEffect(() => {
    setRepoScanData(null);
  }, [selectedBusinessId]);

  const chatMutation = useMutation({
    mutationFn: async (payload: { message?: string; mode: string; scanRepos?: boolean; fetchFiles?: string[]; attachments?: { name: string; content: string; type: string }[] }) => {
      const res = await apiRequest("POST", `/api/businesses/${selectedBusinessId}/manager/chat`, payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "manager"] });
      if (data.filesLoaded && data.filesLoaded.length > 0) {
        toast({
          title: "Files loaded",
          description: `Loaded ${data.filesLoaded.length} file(s) from repositories`,
        });
      }
    },
    onError: (err: any) => {
      let msg = err.message || "Failed to get response";
      try {
        const cleaned = msg.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(cleaned);
        if (parsed.message) msg = parsed.message;
      } catch {}
      toast({ title: "Manager Error", description: msg, variant: "destructive" });
    },
  });

  const scanReposMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/businesses/${selectedBusinessId}/manager/scan-repos`);
      return res.json();
    },
    onSuccess: (data) => {
      setRepoScanData(data.repositories || []);
      toast({
        title: "Repositories scanned",
        description: `Found ${data.repositories?.length || 0} repository(ies)`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Scan failed", description: err.message || "Could not scan repositories", variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/businesses/${selectedBusinessId}/manager/history`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "manager"] });
      toast({ title: "Conversation cleared" });
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && attachedFiles.length === 0) || chatMutation.isPending) return;
    const files = [...attachedFiles];
    const msg = trimmed || (files.length > 0 ? `[Attached ${files.length} file(s): ${files.map(f => f.name).join(", ")}]` : "");
    setInput("");
    setAttachedFiles([]);
    chatMutation.mutate({ message: msg, mode: "chat", attachments: files.length > 0 ? files : undefined });
  };

  const isImageType = useCallback((type: string) => {
    return type.startsWith("image/");
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const maxSize = 5 * 1024 * 1024;
    const readers: Promise<{ name: string; content: string; type: string }>[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        toast({ title: "File too large", description: `${file.name} exceeds 5MB limit`, variant: "destructive" });
        continue;
      }
      const isImage = file.type.startsWith("image/");
      readers.push(
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (isImage) {
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(",")[1] || "";
              resolve({ name: file.name, content: base64, type: file.type });
            } else {
              resolve({ name: file.name, content: reader.result as string, type: file.type || "text/plain" });
            }
          };
          reader.onerror = () => resolve({ name: file.name, content: "(failed to read)", type: file.type || "text/plain" });
          if (isImage) {
            reader.readAsDataURL(file);
          } else {
            reader.readAsText(file);
          }
        })
      );
    }
    Promise.all(readers).then((results) => {
      setAttachedFiles(prev => [...prev, ...results]);
    });
    e.target.value = "";
  }, [toast]);

  const removeAttachment = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Not supported", description: "Voice input is not available in this browser", variant: "destructive" });
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev ? prev + " " + transcript : transcript);
      setIsListening(false);
      textareaRef.current?.focus();
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const handleBriefing = () => {
    chatMutation.mutate({ mode: "briefing" });
  };

  const handleWeekly = () => {
    chatMutation.mutate({ mode: "weekly" });
  };

  if (!selectedBusinessId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Select a business to use the Manager</p>
      </div>
    );
  }

  const messages = data?.messages || [];
  const alerts = data?.alerts || [];
  const stats = data?.stats;
  const projectStats = data?.projectStats || [];
  const recentActivity = data?.recentActivity || [];

  const criticalAlerts = alerts.filter(a => a.severity === "critical");
  const warningAlerts = alerts.filter(a => a.severity === "warning");
  const infoAlerts = alerts.filter(a => a.severity === "info");
  const sortedAlerts = [...criticalAlerts, ...warningAlerts, ...infoAlerts];

  return (
    <div className="flex h-full" data-testid="manager-view">
      <div className="w-80 border-r border-border flex flex-col min-h-0 shrink-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <BrainCircuit className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-semibold" data-testid="text-manager-title">Business Manager</h2>
          </div>
          {stats && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Activity className={`w-4 h-4 ${getHealthColor(stats.healthScore)}`} />
                <span className={`text-xl font-bold font-mono ${getHealthColor(stats.healthScore)}`} data-testid="text-health-score">
                  {stats.healthScore}
                </span>
              </div>
              <Badge variant="secondary" className={`text-[10px] ${getHealthColor(stats.healthScore)}`} data-testid="badge-health-label">
                {getHealthLabel(stats.healthScore)}
              </Badge>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4 overflow-hidden">
            {stats && (
              <div className="space-y-2" data-testid="manager-stats">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Stats</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Card className="p-2.5">
                    <div className="text-lg font-bold font-mono" data-testid="stat-open">{stats.totalOpen}</div>
                    <div className="text-[10px] text-muted-foreground">Open</div>
                  </Card>
                  <Card className="p-2.5">
                    <div className="text-lg font-bold font-mono" data-testid="stat-in-progress">{stats.totalInProgress}</div>
                    <div className="text-[10px] text-muted-foreground">In Progress</div>
                  </Card>
                  <Card className="p-2.5">
                    <div className="text-lg font-bold font-mono" data-testid="stat-completed-week">{stats.completedThisWeek}</div>
                    <div className="text-[10px] text-muted-foreground">Done This Week</div>
                  </Card>
                  <Card className="p-2.5">
                    <div className={`text-lg font-bold font-mono ${stats.totalBlocked > 0 ? "text-red-500" : ""}`} data-testid="stat-blocked">{stats.totalBlocked}</div>
                    <div className="text-[10px] text-muted-foreground">Blocked</div>
                  </Card>
                  <Card className="p-2.5">
                    <div className="text-lg font-bold font-mono text-green-500" data-testid="stat-done">{stats.totalDone}</div>
                    <div className="text-[10px] text-muted-foreground">Done</div>
                  </Card>
                  <Card className="p-2.5">
                    <div className={`text-lg font-bold font-mono ${stats.pendingInbox > 0 ? "text-yellow-500" : ""}`} data-testid="stat-inbox">{stats.pendingInbox}</div>
                    <div className="text-[10px] text-muted-foreground">Inbox Pending</div>
                  </Card>
                </div>
              </div>
            )}

            {projectStats.length > 0 && (
              <div className="space-y-2" data-testid="manager-projects">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</h3>
                <div className="space-y-2">
                  {projectStats.map(p => (
                    <div key={p.id} className="space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-xs truncate">{p.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{p.done}/{p.total}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${p.pct}%`, backgroundColor: p.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sortedAlerts.length > 0 && (
              <div className="space-y-2" data-testid="manager-alerts">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Alerts</h3>
                <div className="space-y-1.5">
                  {sortedAlerts.map(alert => {
                    const cfg = severityConfig[alert.severity];
                    const Icon = cfg.icon;
                    return (
                      <div key={alert.id} className={`flex items-start gap-2 p-2 rounded-md border ${cfg.bg}`} data-testid={`alert-${alert.id}`}>
                        <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${cfg.color}`} />
                        <div className="min-w-0">
                          <div className={`text-xs font-medium ${cfg.color}`}>{alert.title}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{alert.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {repoScanData && repoScanData.length > 0 && (
              <div className="space-y-2" data-testid="manager-repo-scan">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Repository Scan</h3>
                <div className="space-y-3">
                  {repoScanData.map((repo: any) => (
                    <div key={repo.id} className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium truncate">{repo.name}</span>
                        <Badge variant="secondary" className="text-[9px]">{repo.type}</Badge>
                      </div>
                      {repo.tree && repo.tree.length > 0 && (
                        <div className="pl-4 space-y-0.5">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <FolderTree className="w-2.5 h-2.5" />
                            <span>Structure</span>
                          </div>
                          {repo.tree.slice(0, 15).map((item: string, i: number) => (
                            <div key={i} className="text-[10px] text-muted-foreground font-mono truncate">{item}</div>
                          ))}
                          {repo.tree.length > 15 && (
                            <div className="text-[10px] text-muted-foreground/60">+{repo.tree.length - 15} more</div>
                          )}
                        </div>
                      )}
                      {repo.commits && repo.commits.length > 0 && (
                        <div className="pl-4 space-y-0.5">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <FileCode className="w-2.5 h-2.5" />
                            <span>Recent Commits</span>
                          </div>
                          {repo.commits.slice(0, 5).map((c: string, i: number) => (
                            <div key={i} className="text-[10px] text-muted-foreground truncate">{c}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recentActivity.length > 0 && (
              <div className="space-y-2" data-testid="manager-activity">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Activity</h3>
                <div className="space-y-1">
                  {recentActivity.slice(0, 8).map(entry => (
                    <div key={entry.id} className="flex items-center gap-2 py-1">
                      <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                      <span className="text-[11px] truncate flex-1">{entry.taskTitle}</span>
                      <Badge variant="secondary" className="text-[9px] shrink-0">{entry.toStatus}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-border flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleBriefing} disabled={chatMutation.isPending} data-testid="button-daily-briefing">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Daily Briefing
            </Button>
            <Button size="sm" variant="outline" onClick={handleWeekly} disabled={chatMutation.isPending} data-testid="button-weekly-report">
              <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
              Weekly Report
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => scanReposMutation.mutate()}
              disabled={scanReposMutation.isPending}
              data-testid="button-scan-repos"
            >
              {scanReposMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5 mr-1.5" />}
              Scan Repositories
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending || messages.length === 0} data-testid="button-clear-history">
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Clear History
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4" data-testid="manager-chat">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <BrainCircuit className="w-12 h-12 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">AI Business Manager</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
                    Ask about priorities, get status reports, or generate briefings. The manager can create tasks, inbox items, update statuses, and access your repository code directly.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {["What should I work on today?", "How is each project going?", "What's blocking us?", "Show me the code structure", "Review my inbox"].map(q => (
                    <Button
                      key={q}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInput(q);
                        setTimeout(() => textareaRef.current?.focus(), 50);
                      }}
                      data-testid={`suggestion-${q.slice(0, 10).replace(/\s/g, "-")}`}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`message-${msg.id}`}
              >
                <div className={`max-w-[85%] ${msg.sender === "user" ? "" : ""}`}>
                  <div className={`rounded-lg px-3.5 py-2.5 ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}>
                    {msg.sender === "manager" && msg.mode !== "chat" && (
                      <Badge variant="secondary" className="text-[9px] mb-2">
                        {msg.mode === "briefing" ? "Daily Briefing" : "Weekly Report"}
                      </Badge>
                    )}
                    {msg.sender === "user" && msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5" data-testid={`attachments-${msg.id}`}>
                        {msg.attachments.map((a, i) => (
                          <Badge key={i} variant="outline" className="text-[9px] gap-1 border-primary-foreground/30 text-primary-foreground/80">
                            <Paperclip className="w-2.5 h-2.5" />
                            {a.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {msg.sender === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div
                        className="text-sm prose-sm prose-invert max-w-none [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground [&_li]:text-foreground/90"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    )}
                    {msg.sender === "manager" && msg.filesLoaded && msg.filesLoaded.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50" data-testid={`files-loaded-${msg.id}`}>
                        {msg.filesLoaded.map((f, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px] font-mono gap-1">
                            <FileCode className="w-2.5 h-2.5" />
                            {f.path}
                            <span className="text-muted-foreground/60">({f.repo})</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className={`text-[10px] mt-1.5 ${msg.sender === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  {msg.sender === "manager" && msg.actions && msg.actions.length > 0 && (
                    <div className="mt-1" data-testid={`actions-container-${msg.id}`}>
                      <BatchApproveBar
                        actions={msg.actions}
                        messageId={msg.id}
                        businessId={selectedBusinessId}
                      />
                      {msg.actions.map((action, idx) => (
                        <ActionCard
                          key={idx}
                          action={action}
                          actionIndex={idx}
                          messageId={msg.id}
                          businessId={selectedBusinessId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3.5 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border">
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2" data-testid="container-attached-files">
              {attachedFiles.map((file, idx) => (
                <Badge key={idx} variant="secondary" className="gap-1 text-xs" data-testid={`badge-attachment-${idx}`}>
                  {isImageType(file.type) ? <ImageIcon className="w-3 h-3" /> : <FileIcon className="w-3 h-3" />}
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button onClick={() => removeAttachment(idx)} className="ml-0.5 hover-elevate rounded-sm" data-testid={`button-remove-attachment-${idx}`}>
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.toml,.ini,.cfg,.env,.js,.ts,.tsx,.jsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.hpp,.cs,.swift,.kt,.html,.css,.scss,.sql,.sh,.bash,.zsh,.ps1,.bat,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.ico,.pdf"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="input-file-upload"
          />
          <div className="flex items-end gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={chatMutation.isPending}
              data-testid="button-attach-file"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={attachedFiles.length > 0 ? "Ask about the attached files..." : "Ask the manager anything..."}
              className="resize-none text-sm min-h-[40px] max-h-[120px]"
              rows={1}
              disabled={chatMutation.isPending}
              data-testid="textarea-manager-input"
            />
            <Button
              size="icon"
              variant={isListening ? "destructive" : "ghost"}
              onClick={toggleVoice}
              disabled={chatMutation.isPending}
              data-testid="button-voice-input"
              className={isListening ? "animate-pulse" : ""}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || chatMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
