import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAppState } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Settings,
  FolderGit2,
  Plus,
  Trash2,
  Pencil,
  Bot,
  Save,
  ExternalLink,
} from "lucide-react";
import type { Business, RepositorySafe, AgentSafe } from "@shared/schema";

const COLORS = [
  "#58a6ff", "#3fb950", "#d29922", "#f85149",
  "#bc8cff", "#f778ba", "#79c0ff", "#7ee787",
];

const REPO_TYPES = [
  { value: "backend", label: "Backend" },
  { value: "frontend", label: "Frontend" },
  { value: "mobile", label: "Mobile" },
  { value: "fullstack", label: "Full Stack" },
  { value: "api", label: "API" },
  { value: "other", label: "Other" },
];

const businessFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  color: z.string(),
});

const repoFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  repoUrl: z.string(),
  token: z.string(),
  type: z.string(),
});

const agentFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["Claude", "ChatGPT", "Replit", "Other"]),
  apiKey: z.string(),
  role: z.string(),
  isReviewAgent: z.boolean(),
});

export default function SettingsView() {
  const { selectedBusinessId, setSelectedBusinessId, setCurrentView } = useAppState();
  const { toast } = useToast();
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [editingRepo, setEditingRepo] = useState<RepositorySafe | null>(null);
  const [deleteRepoId, setDeleteRepoId] = useState<string | null>(null);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentSafe | null>(null);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [deleteBusinessConfirm, setDeleteBusinessConfirm] = useState(false);

  const bizId = selectedBusinessId;

  const { data: business } = useQuery<Business>({
    queryKey: ["/api/businesses", bizId],
    enabled: !!bizId,
  });

  const { data: repositories = [] } = useQuery<RepositorySafe[]>({
    queryKey: ["/api/businesses", bizId, "repositories"],
    enabled: !!bizId,
  });

  const { data: agents = [] } = useQuery<AgentSafe[]>({
    queryKey: ["/api/businesses", bizId, "agents"],
    enabled: !!bizId,
  });

  const businessForm = useForm<z.infer<typeof businessFormSchema>>({
    resolver: zodResolver(businessFormSchema),
    defaultValues: {
      name: business?.name || "",
      description: business?.description || "",
      color: business?.color || COLORS[0],
    },
    values: business ? {
      name: business.name,
      description: business.description,
      color: business.color,
    } : undefined,
  });

  const repoForm = useForm<z.infer<typeof repoFormSchema>>({
    resolver: zodResolver(repoFormSchema),
    defaultValues: {
      name: "",
      description: "",
      repoUrl: "",
      token: "",
      type: "other",
    },
  });

  const agentForm = useForm<z.infer<typeof agentFormSchema>>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: {
      name: "",
      type: "Claude",
      apiKey: "",
      role: "",
      isReviewAgent: false,
    },
  });

  const updateBusinessMutation = useMutation({
    mutationFn: async (data: z.infer<typeof businessFormSchema>) => {
      return apiRequest("PUT", `/api/businesses/${bizId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId] });
      toast({ title: "Business updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteBusinessMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/businesses/${bizId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses"] });
      setSelectedBusinessId(null);
      setCurrentView("all-tasks");
      toast({ title: "Business deleted" });
      setDeleteBusinessConfirm(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveRepoMutation = useMutation({
    mutationFn: async (data: z.infer<typeof repoFormSchema>) => {
      if (editingRepo) {
        return apiRequest("PUT", `/api/businesses/${bizId}/repositories/${editingRepo.id}`, data);
      }
      return apiRequest("POST", `/api/businesses/${bizId}/repositories`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "repositories"] });
      toast({ title: editingRepo ? "Repository updated" : "Repository added" });
      setRepoDialogOpen(false);
      setEditingRepo(null);
      repoForm.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteRepoMutation = useMutation({
    mutationFn: async (repoId: string) => {
      return apiRequest("DELETE", `/api/businesses/${bizId}/repositories/${repoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "repositories"] });
      toast({ title: "Repository removed" });
      setDeleteRepoId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveAgentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof agentFormSchema>) => {
      if (editingAgent) {
        return apiRequest("PUT", `/api/businesses/${bizId}/agents/${editingAgent.id}`, data);
      }
      return apiRequest("POST", `/api/businesses/${bizId}/agents`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "agents"] });
      toast({ title: editingAgent ? "Agent updated" : "Agent added" });
      setAgentDialogOpen(false);
      setEditingAgent(null);
      agentForm.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      return apiRequest("DELETE", `/api/businesses/${bizId}/agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", bizId, "agents"] });
      toast({ title: "Agent removed" });
      setDeleteAgentId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleOpenRepoDialog = (repo?: RepositorySafe) => {
    if (repo) {
      setEditingRepo(repo);
      repoForm.reset({
        name: repo.name,
        description: repo.description,
        repoUrl: repo.repoUrl,
        token: "",
        type: repo.type || "other",
      });
    } else {
      setEditingRepo(null);
      repoForm.reset({
        name: "",
        description: "",
        repoUrl: "",
        token: "",
        type: "other",
      });
    }
    setRepoDialogOpen(true);
  };

  const handleOpenAgentDialog = (agent?: AgentSafe) => {
    if (agent) {
      setEditingAgent(agent);
      agentForm.reset({
        name: agent.name,
        type: agent.type,
        apiKey: "",
        role: agent.role,
        isReviewAgent: agent.isReviewAgent,
      });
    } else {
      setEditingAgent(null);
      agentForm.reset({
        name: "",
        type: "Claude",
        apiKey: "",
        role: "",
        isReviewAgent: false,
      });
    }
    setAgentDialogOpen(true);
  };

  if (!bizId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center">
            <Settings className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Select a business to view settings</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-settings-title">
            <Settings className="w-5 h-5" />
            Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your business details, repositories, and AI agents.
          </p>
        </div>

        <Card className="p-6">
          <h3 className="text-sm font-semibold mb-4">Business Details</h3>
          <Form {...businessForm}>
            <form onSubmit={businessForm.handleSubmit((data) => updateBusinessMutation.mutate(data))} className="space-y-4">
              <FormField
                control={businessForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-biz-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={businessForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea className="resize-none" {...field} data-testid="input-biz-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={businessForm.control}
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
                          />
                        ))}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDeleteBusinessConfirm(true)}
                  data-testid="button-delete-business"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Business
                </Button>
                <Button type="submit" disabled={updateBusinessMutation.isPending} data-testid="button-save-business">
                  <Save className="w-4 h-4 mr-1" />
                  {updateBusinessMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </Card>

        <Separator />

        <div>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Repositories</h3>
              <Badge variant="secondary" className="text-xs">{repositories.length}</Badge>
            </div>
            <Button size="sm" onClick={() => handleOpenRepoDialog()} data-testid="button-add-repo">
              <Plus className="w-3 h-3 mr-1" />
              Add Repository
            </Button>
          </div>

          {repositories.length === 0 ? (
            <Card className="p-6 text-center">
              <FolderGit2 className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No repositories added yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Add a GitHub repository to enable file browsing and code review.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {repositories.map((repo) => (
                <Card key={repo.id} className="p-4" data-testid={`repo-card-${repo.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FolderGit2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm" data-testid={`text-repo-name-${repo.id}`}>{repo.name}</span>
                        {repo.type && repo.type !== "other" && (
                          <Badge variant="outline" className="text-[10px]">{repo.type}</Badge>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-xs text-muted-foreground mt-1">{repo.description}</p>
                      )}
                      {repo.repoUrl && (
                        <a
                          href={repo.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-muted-foreground mt-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {repo.owner}/{repo.repo}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenRepoDialog(repo)}
                        data-testid={`button-edit-repo-${repo.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteRepoId(repo.id)}
                        data-testid={`button-delete-repo-${repo.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">AI Agents</h3>
              <Badge variant="secondary" className="text-xs">{agents.length}</Badge>
            </div>
            <Button size="sm" onClick={() => handleOpenAgentDialog()} data-testid="button-add-agent">
              <Plus className="w-3 h-3 mr-1" />
              Add Agent
            </Button>
          </div>

          {agents.length === 0 ? (
            <Card className="p-6 text-center">
              <Bot className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No agents configured.</p>
              <p className="text-xs text-muted-foreground mt-1">Add an AI agent for code review and transcript processing.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <Card key={agent.id} className="p-4" data-testid={`agent-card-${agent.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Bot className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm">{agent.name}</span>
                        <Badge variant="outline" className="text-[10px]">{agent.type}</Badge>
                        {agent.isReviewAgent && (
                          <Badge variant="secondary" className="text-[10px]">Review Agent</Badge>
                        )}
                      </div>
                      {agent.role && (
                        <p className="text-xs text-muted-foreground mt-1">{agent.role}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenAgentDialog(agent)}
                        data-testid={`button-edit-agent-${agent.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteAgentId(agent.id)}
                        data-testid={`button-delete-agent-${agent.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={repoDialogOpen} onOpenChange={setRepoDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRepo ? "Edit Repository" : "Add Repository"}</DialogTitle>
            <DialogDescription>
              {editingRepo ? "Update repository details." : "Connect a GitHub repository."}
            </DialogDescription>
          </DialogHeader>
          <Form {...repoForm}>
            <form onSubmit={repoForm.handleSubmit((data) => saveRepoMutation.mutate(data))} className="space-y-4">
              <FormField
                control={repoForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Repo" {...field} data-testid="input-repo-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={repoForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What this repo is for" className="resize-none" {...field} data-testid="input-repo-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={repoForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-repo-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REPO_TYPES.map((rt) => (
                          <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={repoForm.control}
                name="repoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://github.com/owner/repo" {...field} data-testid="input-repo-url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={repoForm.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub Token {editingRepo && "(leave blank to keep current)"}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="ghp_xxxx" {...field} data-testid="input-repo-token" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setRepoDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saveRepoMutation.isPending} data-testid="button-save-repo">
                  {saveRepoMutation.isPending ? "Saving..." : editingRepo ? "Save Changes" : "Add Repository"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Edit Agent" : "Add Agent"}</DialogTitle>
            <DialogDescription>
              {editingAgent ? "Update agent configuration." : "Add a new AI agent for this business."}
            </DialogDescription>
          </DialogHeader>
          <Form {...agentForm}>
            <form onSubmit={agentForm.handleSubmit((data) => saveAgentMutation.mutate(data))} className="space-y-4">
              <FormField
                control={agentForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Agent" {...field} data-testid="input-agent-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={agentForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-agent-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Claude">Claude</SelectItem>
                        <SelectItem value="ChatGPT">ChatGPT</SelectItem>
                        <SelectItem value="Replit">Replit</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={agentForm.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key {editingAgent && "(leave blank to keep current)"}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="sk-xxxx" {...field} data-testid="input-agent-key" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={agentForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What this agent does" className="resize-none" {...field} data-testid="input-agent-role" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={agentForm.control}
                name="isReviewAgent"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="rounded border-border"
                        data-testid="checkbox-review-agent"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Use as Review Agent</FormLabel>
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setAgentDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saveAgentMutation.isPending} data-testid="button-save-agent">
                  {saveAgentMutation.isPending ? "Saving..." : editingAgent ? "Save Changes" : "Add Agent"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRepoId} onOpenChange={() => setDeleteRepoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Repository</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this repository? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRepoId && deleteRepoMutation.mutate(deleteRepoId)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteAgentId} onOpenChange={() => setDeleteAgentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this agent? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAgentId && deleteAgentMutation.mutate(deleteAgentId)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteBusinessConfirm} onOpenChange={setDeleteBusinessConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Business</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{business?.name}"? This will remove all projects, tasks, repositories, agents, and inbox items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBusinessMutation.mutate()}
              disabled={deleteBusinessMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-biz"
            >
              {deleteBusinessMutation.isPending ? "Deleting..." : "Delete Business"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}
