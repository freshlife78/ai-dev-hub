import { useState, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ThemeProvider } from "@/lib/theme";
import { AppProvider, useAppState } from "@/lib/store";
import { ProjectDialog } from "@/components/project-dialog";
import { BusinessDialog } from "@/components/business-dialog";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Button } from "@/components/ui/button";
import { Download, X, Loader2 } from "lucide-react";
import type { Project } from "@shared/schema";

// Lazy load view components for better performance
const TasksView = lazy(() => import("@/pages/tasks-view"));
const FilesView = lazy(() => import("@/pages/files-view"));
const PromptsView = lazy(() => import("@/pages/prompts-view"));
const ChangelogView = lazy(() => import("@/pages/changelog-view"));
const InboxView = lazy(() => import("@/pages/inbox-view"));
const SettingsView = lazy(() => import("@/pages/settings-view"));
const ManagerView = lazy(() => import("@/pages/manager-view"));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function MainContent() {
  const { currentView } = useAppState();

  return (
    <Suspense fallback={<LoadingFallback />}>
      {(() => {
        switch (currentView) {
          case "all-tasks":
            return <TasksView />;
          case "tasks":
            return <TasksView />;
          case "files":
            return <FilesView />;
          case "inbox":
            return <InboxView />;
          case "prompts":
            return <PromptsView />;
          case "changelog":
            return <ChangelogView />;
          case "settings":
            return <SettingsView />;
          case "manager":
            return <ManagerView />;
          default:
            return <TasksView />;
        }
      })()}
    </Suspense>
  );
}

function AppLayout() {
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [bizDialogOpen, setBizDialogOpen] = useState(false);
  const { currentView } = useAppState();
  const { showBanner, promptInstall, dismissBanner } = usePwaInstall();

  const viewTitles: Record<string, string> = {
    "all-tasks": "All Tasks",
    tasks: "Tasks",
    files: "File Viewer",
    inbox: "Inbox",
    prompts: "Prompts Queue",
    changelog: "Changelog",
    settings: "Settings",
    manager: "Manager",
  };

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const handleNewProject = () => {
    setEditingProject(null);
    setProjectDialogOpen(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setProjectDialogOpen(true);
  };

  const handleNewBusiness = () => {
    setBizDialogOpen(true);
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          onNewProject={handleNewProject}
          onEditProject={handleEditProject}
          onNewBusiness={handleNewBusiness}
        />
        <div className="flex flex-col flex-1 min-w-0">
          {showBanner && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20 text-xs" data-testid="banner-pwa-install">
              <Download className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="flex-1 text-muted-foreground">Install AI Dev Hub for quick access from your home screen</span>
              <Button size="sm" variant="default" onClick={promptInstall} data-testid="button-pwa-install">
                Install
              </Button>
              <Button size="icon" variant="ghost" onClick={dismissBanner} className="h-6 w-6" data-testid="button-pwa-dismiss">
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
          <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border sticky top-0 z-50 bg-background">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <span className="text-sm font-medium text-muted-foreground">
                {viewTitles[currentView] || "Tasks"}
              </span>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-hidden">
            <MainContent />
          </main>
        </div>
      </div>
      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={editingProject}
      />
      <BusinessDialog
        open={bizDialogOpen}
        onOpenChange={setBizDialogOpen}
      />
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppProvider>
            <AppLayout />
          </AppProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
