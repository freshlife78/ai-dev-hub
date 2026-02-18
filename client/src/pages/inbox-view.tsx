import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppState } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Inbox,
  Plus,
  FileText,
  Loader2,
  Check,
  X,
  Trash2,
  Bug,
  Lightbulb,
  Sparkles,
  Wrench,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  Quote,
  FolderOpen,
  Link2,
  Eye,
  EyeOff,
} from "lucide-react";
import type { InboxItem, Project, Task } from "@shared/schema";

const typeConfig: Record<string, { icon: typeof Bug; color: string }> = {
  Bug: { icon: Bug, color: "text-red-400" },
  Feature: { icon: Lightbulb, color: "text-blue-400" },
  Idea: { icon: Sparkles, color: "text-amber-400" },
  Improvement: { icon: Wrench, color: "text-green-400" },
};

const priorityConfig: Record<string, { icon: typeof ArrowUp; color: string }> = {
  High: { icon: ArrowUp, color: "text-red-400" },
  Medium: { icon: ArrowRight, color: "text-yellow-400" },
  Low: { icon: ArrowDown, color: "text-muted-foreground" },
};

const statusColors: Record<string, string> = {
  New: "bg-blue-500/10 text-blue-400",
  Reviewed: "bg-yellow-500/10 text-yellow-400",
  Assigned: "bg-green-500/10 text-green-400",
  Dismissed: "bg-muted text-muted-foreground",
};

interface ExtractedItem {
  title: string;
  type: string;
  priority: string;
  description: string;
  quote: string;
  suggestedProject?: string | null;
}

interface SuggestedProject {
  name: string;
  reason: string;
}

function ExtractedItemCard({
  item,
  onApprove,
  onDismiss,
  approving,
}: {
  item: ExtractedItem;
  onApprove: () => void;
  onDismiss: () => void;
  approving: boolean;
}) {
  const typeInfo = typeConfig[item.type] || typeConfig.Idea;
  const priorityInfo = priorityConfig[item.priority] || priorityConfig.Medium;
  const TypeIcon = typeInfo.icon;
  const PriorityIcon = priorityInfo.icon;

  return (
    <Card className="p-4" data-testid={`extracted-card-${item.title.slice(0, 20).replace(/\s/g, "-")}`}>
      <div className="flex items-start gap-3">
        <TypeIcon className={`w-4 h-4 mt-0.5 shrink-0 ${typeInfo.color}`} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{item.title}</span>
            <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
            <div className="flex items-center gap-1">
              <PriorityIcon className={`w-3 h-3 ${priorityInfo.color}`} />
              <span className="text-[10px] text-muted-foreground">{item.priority}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{item.description}</p>
          {item.quote && (
            <div className="flex items-start gap-1.5 bg-muted rounded-md p-2">
              <Quote className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" />
              <p className="text-xs italic text-muted-foreground">"{item.quote}"</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="text-green-500"
            onClick={onApprove}
            disabled={approving}
            data-testid="button-approve-extracted"
          >
            {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onDismiss}
            data-testid="button-dismiss-extracted"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function InboxView() {
  const { selectedBusinessId } = useAppState();
  const { toast } = useToast();
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [newItemDialogOpen, setNewItemDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [transcript, setTranscript] = useState("");
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [suggestedProjects, setSuggestedProjects] = useState<SuggestedProject[]>([]);
  const [showExtracted, setShowExtracted] = useState(false);
  const [currentMeetingTitle, setCurrentMeetingTitle] = useState("");
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("Bug");
  const [newSource, setNewSource] = useState("Customer");
  const [newPriority, setNewPriority] = useState("Medium");
  const [newDescription, setNewDescription] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const bizId = selectedBusinessId;

  const { data: inboxItems = [], isLoading } = useQuery<InboxItem[]>({
    queryKey: ["/api/businesses", bizId, "inbox"],
    enabled: !!bizId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/businesses", bizId, "projects"],
    enabled: !!bizId,
  });

  const { data: allTasksData = [] } = useQuery<{ project: Project; tasks: Task[] }[]>({
    queryKey: ["/api/businesses", bizId, "tasks"],
    enabled: !!bizId,
  });

  const filteredItems = statusFilter === "all"
    ? inboxItems
    : inboxItems.filter((item) => item.status === statusFilter);

  const newCount = inboxItems.filter((i) => i.status === "New").length;

  const processMutation = useMutation({
    mutationFn: async (data: { transcript: string; meetingTitle: string; meetingDate: string }) => {
      const res = await apiRequest("POST", `/api/businesses/${bizId}/inbox/process-transcript`, data);
      return res.json();
    },
    onSuccess: (data) => {
      setExtractedItems(data.items || []);
      setSuggestedProjects(data.suggestedProjects || []);
      setCurrentMeetingTitle(meetingTitle);
      setShowExtracted(true);
      setTranscriptDialogOpen(false);
      setTranscript("");
      setMeetingTitle("");
      setMeetingDate("");
      const projectMsg = (data.suggestedProjects || []).length > 0
        ? ` — ${data.suggestedProjects.length} new project(s) suggested`
        : "";
      toast({ title: `${(data.items || []).length} items extracted from transcript${projectMsg}` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addToInboxMutation = useMutation({
    mutationFn: async (data: { title: string; type: string; priority: string; description: string; source: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/businesses/${bizId}/inbox`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "inbox"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InboxItem> }) => {
      const res = await apiRequest("PUT", `/api/businesses/${bizId}/inbox/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "inbox"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const res = await apiRequest("POST", `/api/businesses/${bizId}/inbox/${id}/assign`, { projectId });
      return res.json();
    },
    onSuccess: (data: { inboxItem: InboxItem; task: Task }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "tasks"] });
      const projectName = projects.find((p) => p.id === data.inboxItem.linkedProjectId)?.name || "project";
      toast({ title: `Assigned to ${projectName} as ${data.task.id}` });
      setAssignDialogOpen(false);
      setSelectedItem(null);
      setSelectedProjectId("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/businesses/${bizId}/inbox/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "inbox"] });
      toast({ title: "Item removed from inbox" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const res = await apiRequest("POST", `/api/businesses/${bizId}/projects`, data);
      return res.json();
    },
    onSuccess: (newProject: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "projects"] });
      toast({ title: `Project "${newProject.name}" created` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateSuggestedProject = async (sp: SuggestedProject, index: number) => {
    const colors = ["#58a6ff", "#3fb950", "#d29922", "#f85149", "#bc8cff", "#f778ba", "#79c0ff", "#7ee787"];
    const color = colors[(projects.length + index) % colors.length];
    await createProjectMutation.mutateAsync({ name: sp.name, color });
    setSuggestedProjects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDismissSuggestedProject = (index: number) => {
    setSuggestedProjects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApproveExtracted = async (item: ExtractedItem, index: number) => {
    setApprovingIndex(index);
    try {
      await addToInboxMutation.mutateAsync({
        title: item.title,
        type: item.type,
        priority: item.priority,
        description: item.description,
        source: "Meeting",
        notes: currentMeetingTitle ? `From meeting: ${currentMeetingTitle}` : "",
      });
      setExtractedItems((prev) => prev.filter((_, i) => i !== index));
      toast({ title: `"${item.title}" added to inbox` });
    } finally {
      setApprovingIndex(null);
    }
  };

  const handleDismissExtracted = (index: number) => {
    setExtractedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProcess = () => {
    if (!transcript.trim()) {
      toast({ title: "Paste a transcript first", variant: "destructive" });
      return;
    }
    processMutation.mutate({ transcript, meetingTitle, meetingDate });
  };

  const handleDismissItem = (item: InboxItem) => {
    updateMutation.mutate({ id: item.id, data: { status: "Dismissed" } });
    toast({ title: `"${item.title}" dismissed` });
  };

  const handleMarkReviewed = (item: InboxItem) => {
    updateMutation.mutate({ id: item.id, data: { status: "Reviewed" } });
  };

  const handleOpenAssign = (item: InboxItem) => {
    setSelectedItem(item);
    setSelectedProjectId("");
    setAssignDialogOpen(true);
  };

  const handleOpenLink = (item: InboxItem) => {
    setSelectedItem(item);
    setSelectedProjectId("");
    setSelectedTaskId("");
    setLinkDialogOpen(true);
  };

  const handleLinkTask = () => {
    if (!selectedItem || !selectedProjectId || !selectedTaskId) return;
    updateMutation.mutate({
      id: selectedItem.id,
      data: {
        status: "Assigned",
        linkedProjectId: selectedProjectId,
        linkedTaskId: selectedTaskId,
      },
    });
    const projectName = projects.find((p) => p.id === selectedProjectId)?.name || "project";
    toast({ title: `Linked to ${selectedTaskId} in ${projectName}` });
    setLinkDialogOpen(false);
    setSelectedItem(null);
    setSelectedProjectId("");
    setSelectedTaskId("");
  };

  const handleCreateItem = () => {
    if (!newTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    addToInboxMutation.mutate(
      {
        title: newTitle,
        type: newType,
        source: newSource,
        priority: newPriority,
        description: newDescription,
        notes: newNotes,
      },
      {
        onSuccess: () => {
          toast({ title: "Item added to inbox" });
          setNewItemDialogOpen(false);
          setNewTitle("");
          setNewType("Bug");
          setNewSource("Customer");
          setNewPriority("Medium");
          setNewDescription("");
          setNewNotes("");
        },
      },
    );
  };

  const tasksForProject = selectedProjectId
    ? allTasksData.find((d) => d.project.id === selectedProjectId)?.tasks || []
    : [];

  if (!bizId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Select a business to view inbox</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border flex-wrap">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold" data-testid="text-inbox-title">Inbox</h2>
          {newCount > 0 && (
            <Badge variant="secondary" className="text-xs">{newCount} new</Badge>
          )}
          <Badge variant="outline" className="text-xs">{inboxItems.length} total</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Reviewed">Reviewed</SelectItem>
              <SelectItem value="Assigned">Assigned</SelectItem>
              <SelectItem value="Dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setNewItemDialogOpen(true)}
            data-testid="button-new-inbox-item"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Item
          </Button>
          <Button
            onClick={() => setTranscriptDialogOpen(true)}
            data-testid="button-process-transcript"
          >
            <FileText className="w-4 h-4 mr-1" />
            Process Transcript
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {showExtracted && suggestedProjects.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold">Suggested Projects</h3>
                  <Badge variant="secondary" className="text-xs">{suggestedProjects.length}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSuggestedProjects([])}
                  data-testid="button-dismiss-all-suggested"
                >
                  Dismiss All
                </Button>
              </div>
              <div className="space-y-2">
                {suggestedProjects.map((sp, i) => (
                  <Card key={`${sp.name}-${i}`} className="p-3" data-testid={`suggested-project-${sp.name.replace(/\s/g, "-")}`}>
                    <div className="flex items-start gap-3">
                      <FolderOpen className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{sp.name}</span>
                        <p className="text-xs text-muted-foreground mt-1">{sp.reason}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleCreateSuggestedProject(sp, i)}
                          disabled={createProjectMutation.isPending}
                          data-testid={`button-create-suggested-${i}`}
                        >
                          {createProjectMutation.isPending ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Plus className="w-3 h-3 mr-1" />
                          )}
                          Create
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDismissSuggestedProject(i)}
                          data-testid={`button-dismiss-suggested-${i}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <div className="border-b border-border" />
            </div>
          )}

          {showExtracted && extractedItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold">Extracted Items</h3>
                  <Badge variant="secondary" className="text-xs">{extractedItems.length} remaining</Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setExtractedItems([]); setSuggestedProjects([]); setShowExtracted(false); }}
                  data-testid="button-clear-extracted"
                >
                  Clear All
                </Button>
              </div>
              <div className="space-y-2">
                {extractedItems.map((item, i) => (
                  <ExtractedItemCard
                    key={`${item.title}-${i}`}
                    item={item}
                    onApprove={() => handleApproveExtracted(item, i)}
                    onDismiss={() => handleDismissExtracted(i)}
                    approving={approvingIndex === i}
                  />
                ))}
              </div>
              <div className="border-b border-border" />
            </div>
          )}

          {showExtracted && extractedItems.length === 0 && suggestedProjects.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              All extracted items processed.
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 text-sm"
                onClick={() => setShowExtracted(false)}
                data-testid="button-hide-extracted"
              >
                Dismiss
              </Button>
            </div>
          )}

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-md" />
            ))
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center mb-3">
                <Inbox className="w-6 h-6 text-muted-foreground" />
              </div>
              <p>{statusFilter !== "all" ? `No ${statusFilter.toLowerCase()} items` : "Inbox is empty"}</p>
              <p className="text-xs mt-1">Add items manually or process a meeting transcript</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const typeInfo = typeConfig[item.type] || typeConfig.Idea;
                const priorityInfo = priorityConfig[item.priority] || priorityConfig.Medium;
                const TypeIcon = typeInfo.icon;
                const PriorityIcon = priorityInfo.icon;
                const linkedProject = item.linkedProjectId ? projects.find((p) => p.id === item.linkedProjectId) : null;

                return (
                  <Card key={item.id} className="p-3" data-testid={`inbox-item-${item.id}`}>
                    <div className="flex items-start gap-3">
                      <TypeIcon className={`w-4 h-4 mt-0.5 shrink-0 ${typeInfo.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm" data-testid={`text-inbox-title-${item.id}`}>{item.title}</span>
                          <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                          <div className="flex items-center gap-1">
                            <PriorityIcon className={`w-3 h-3 ${priorityInfo.color}`} />
                            <span className="text-[10px] text-muted-foreground">{item.priority}</span>
                          </div>
                          <Badge className={`text-[10px] ${statusColors[item.status] || ""}`} variant="secondary">
                            {item.status}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">{item.source}</Badge>
                        </div>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {linkedProject && (
                            <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                              <FolderOpen className="w-3 h-3" />
                              {linkedProject.name}
                              {item.linkedTaskId && ` / ${item.linkedTaskId}`}
                            </span>
                          )}
                          {item.notes && (
                            <span className="text-[10px] text-muted-foreground font-mono">{item.notes}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(item.dateReceived).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.status === "New" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleMarkReviewed(item)}
                            title="Mark as reviewed"
                            data-testid={`button-review-${item.id}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {(item.status === "New" || item.status === "Reviewed") && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenAssign(item)}
                              title="Assign to project"
                              data-testid={`button-assign-${item.id}`}
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleOpenLink(item)}
                              title="Link to existing task"
                              data-testid={`button-link-${item.id}`}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDismissItem(item)}
                              title="Dismiss"
                              data-testid={`button-dismiss-${item.id}`}
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(item.id)}
                          title="Delete"
                          data-testid={`button-delete-inbox-${item.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={newItemDialogOpen} onOpenChange={setNewItemDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Inbox Item</DialogTitle>
            <DialogDescription>Add a new item to the inbox.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Title</label>
              <Input
                placeholder="Item title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                data-testid="input-new-title"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Type</label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger data-testid="select-new-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bug">Bug</SelectItem>
                    <SelectItem value="Feature">Feature</SelectItem>
                    <SelectItem value="Idea">Idea</SelectItem>
                    <SelectItem value="Improvement">Improvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Source</label>
                <Select value={newSource} onValueChange={setNewSource}>
                  <SelectTrigger data-testid="select-new-source"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Customer">Customer</SelectItem>
                    <SelectItem value="Internal">Internal</SelectItem>
                    <SelectItem value="Meeting">Meeting</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Priority</label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger data-testid="select-new-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Description</label>
              <Textarea
                placeholder="Describe the issue or idea..."
                className="resize-none"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                data-testid="input-new-description"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Notes</label>
              <Textarea
                placeholder="Internal notes..."
                className="resize-none"
                rows={2}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                data-testid="input-new-notes"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewItemDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateItem} disabled={addToInboxMutation.isPending} data-testid="button-create-inbox-item">
                {addToInboxMutation.isPending ? "Adding..." : "Add to Inbox"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={transcriptDialogOpen} onOpenChange={setTranscriptDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Process Meeting Transcript</DialogTitle>
            <DialogDescription>Paste a meeting transcript to extract actionable items using AI.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Meeting Title</label>
                <Input
                  placeholder="Weekly standup"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  data-testid="input-meeting-title"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Date</label>
                <Input
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  data-testid="input-meeting-date"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Transcript</label>
              <Textarea
                placeholder="Paste the meeting transcript here..."
                className="resize-none font-mono text-xs"
                rows={10}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                data-testid="input-transcript"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTranscriptDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleProcess} disabled={processMutation.isPending} data-testid="button-extract">
                {processMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Extracting...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-1" />Extract Items</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign to Project</DialogTitle>
            <DialogDescription>Choose which project to assign "{selectedItem?.title}" to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger data-testid="select-assign-project"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => selectedItem && selectedProjectId && assignMutation.mutate({ id: selectedItem.id, projectId: selectedProjectId })}
                disabled={!selectedProjectId || assignMutation.isPending}
                data-testid="button-confirm-assign"
              >
                {assignMutation.isPending ? "Assigning..." : "Assign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Link to Existing Task</DialogTitle>
            <DialogDescription>Link "{selectedItem?.title}" to an existing task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Project</label>
              <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); setSelectedTaskId(""); }}>
                <SelectTrigger data-testid="select-link-project"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedProjectId && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Task</label>
                <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                  <SelectTrigger data-testid="select-link-task"><SelectValue placeholder="Select task" /></SelectTrigger>
                  <SelectContent>
                    {tasksForProject.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.id} - {t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleLinkTask} disabled={!selectedTaskId} data-testid="button-confirm-link">
                Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
