import { useQuery } from "@tanstack/react-query";
import { useAppState } from "@/lib/store";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutGrid,
  ListChecks,
  FolderGit2,
  Terminal,
  History,
  Plus,
  Zap,
  Settings,
  Inbox,
  BrainCircuit,
} from "lucide-react";
import type { Project, InboxItem, Business, ManagerAlert } from "@shared/schema";

interface AppSidebarProps {
  onNewProject: () => void;
  onEditProject: (project: Project) => void;
  onNewBusiness: () => void;
}

export function AppSidebar({ onNewProject, onEditProject, onNewBusiness }: AppSidebarProps) {
  const {
    selectedBusinessId,
    setSelectedBusinessId,
    selectedProjectId,
    setSelectedProjectId,
    setSelectedRepositoryId,
    currentView,
    setCurrentView,
    setSelectedTaskId,
  } = useAppState();

  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ["/api/businesses"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "projects"],
    enabled: !!selectedBusinessId,
  });

  const { data: inboxItems = [] } = useQuery<InboxItem[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "inbox"],
    enabled: !!selectedBusinessId,
  });

  const newInboxCount = inboxItems.filter((i) => i.status === "New" || i.status === "Reviewed").length;

  const { data: managerData } = useQuery<{ alerts: ManagerAlert[] }>({
    queryKey: ["/api/businesses", selectedBusinessId, "manager"],
    enabled: !!selectedBusinessId,
    refetchInterval: 60000,
  });

  const alertCount = managerData?.alerts?.filter(a => a.severity === "critical" || a.severity === "warning").length || 0;

  const projectNavItems = [
    { title: "Tasks", view: "tasks" as const, icon: ListChecks },
    { title: "File Viewer", view: "files" as const, icon: FolderGit2 },
    { title: "Changelog", view: "changelog" as const, icon: History },
  ];

  const handleBusinessChange = (bizId: string) => {
    if (bizId === "__new__") {
      onNewBusiness();
      return;
    }
    setSelectedBusinessId(bizId);
    setSelectedProjectId(null);
    setSelectedRepositoryId(null);
    setSelectedTaskId(null);
    setCurrentView("all-tasks");
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight" data-testid="text-app-title">
              AI Dev Hub
            </h1>
            <p className="text-xs text-muted-foreground">Command Center</p>
          </div>
        </div>
        <Select
          value={selectedBusinessId || ""}
          onValueChange={handleBusinessChange}
        >
          <SelectTrigger className="w-full text-xs" data-testid="select-business">
            <SelectValue placeholder="Select business..." />
          </SelectTrigger>
          <SelectContent>
            {businesses.map((biz) => (
              <SelectItem key={biz.id} value={biz.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: biz.color }}
                  />
                  <span>{biz.name}</span>
                </div>
              </SelectItem>
            ))}
            <SelectItem value="__new__">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Plus className="w-3 h-3" />
                <span>New Business</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {selectedBusinessId && (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={currentView === "manager"}
                      onClick={() => {
                        setSelectedProjectId(null);
                        setSelectedTaskId(null);
                        setCurrentView("manager");
                      }}
                      data-testid="nav-manager"
                    >
                      <BrainCircuit className="w-4 h-4" />
                      <span className="flex-1">Manager</span>
                      {alertCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-auto text-red-500" data-testid="badge-manager-alerts">
                          {alertCount}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={currentView === "all-tasks"}
                      onClick={() => {
                        setSelectedProjectId(null);
                        setSelectedTaskId(null);
                        setCurrentView("all-tasks");
                      }}
                      data-testid="nav-all-tasks"
                    >
                      <LayoutGrid className="w-4 h-4" />
                      <span>All Tasks</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={currentView === "inbox"}
                      onClick={() => {
                        setSelectedProjectId(null);
                        setSelectedTaskId(null);
                        setCurrentView("inbox");
                      }}
                      data-testid="nav-inbox"
                    >
                      <Inbox className="w-4 h-4" />
                      <span className="flex-1">Inbox</span>
                      {newInboxCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-auto" data-testid="badge-inbox-count">
                          {newInboxCount}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={currentView === "prompts"}
                      onClick={() => setCurrentView("prompts")}
                      data-testid="nav-prompts"
                    >
                      <Terminal className="w-4 h-4" />
                      <span>Prompts Queue</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={currentView === "settings"}
                      onClick={() => setCurrentView("settings")}
                      data-testid="nav-settings"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center justify-between gap-2">
                <span>Projects</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={onNewProject}
                  data-testid="button-new-project"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <div className="flex items-center group">
                        <SidebarMenuButton
                          isActive={selectedProjectId === project.id && currentView !== "all-tasks" && currentView !== "prompts" && currentView !== "inbox" && currentView !== "settings" && currentView !== "manager"}
                          onClick={() => {
                            setSelectedProjectId(project.id);
                            setSelectedTaskId(null);
                            setCurrentView("tasks");
                          }}
                          className="flex-1"
                          data-testid={`button-project-${project.id}`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="truncate">{project.name}</span>
                        </SidebarMenuButton>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProject(project);
                          }}
                          data-testid={`button-settings-${project.id}`}
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </SidebarMenuItem>
                  ))}
                  {projects.length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                      No projects yet
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {selectedProjectId && currentView !== "all-tasks" && currentView !== "prompts" && currentView !== "inbox" && currentView !== "settings" && currentView !== "manager" && (
              <>
                <SidebarSeparator />
                <SidebarGroup>
                  <SidebarGroupLabel>
                    {projects.find((p) => p.id === selectedProjectId)?.name || "Project"}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {projectNavItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            isActive={currentView === item.view}
                            onClick={() => setCurrentView(item.view)}
                            data-testid={`nav-${item.view}`}
                          >
                            <item.icon className="w-4 h-4" />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </>
        )}

        {!selectedBusinessId && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground mb-3">Select a business to get started</p>
            <Button size="sm" variant="outline" onClick={onNewBusiness} data-testid="button-create-biz-empty">
              <Plus className="w-3 h-3 mr-1" />
              New Business
            </Button>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="text-[10px] text-muted-foreground text-center font-mono">
          v3.0.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
