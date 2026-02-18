import { createContext, useContext, useState } from "react";

type View = "all-tasks" | "tasks" | "files" | "prompts" | "changelog" | "inbox" | "settings" | "manager";

export interface ReviewIntent {
  filePath: string;
  taskId: string;
  question: string;
  autoRun?: boolean;
  detectedFiles?: string[];
  repositoryId?: string;
}

interface AppState {
  selectedBusinessId: string | null;
  setSelectedBusinessId: (id: string | null) => void;
  selectedRepositoryId: string | null;
  setSelectedRepositoryId: (id: string | null) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  currentView: View;
  setCurrentView: (view: View) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  reviewIntent: ReviewIntent | null;
  setReviewIntent: (intent: ReviewIntent | null) => void;
}

const AppContext = createContext<AppState>({
  selectedBusinessId: null,
  setSelectedBusinessId: () => {},
  selectedRepositoryId: null,
  setSelectedRepositoryId: () => {},
  selectedProjectId: null,
  setSelectedProjectId: () => {},
  currentView: "all-tasks",
  setCurrentView: () => {},
  selectedTaskId: null,
  setSelectedTaskId: () => {},
  reviewIntent: null,
  setReviewIntent: () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>("all-tasks");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [reviewIntent, setReviewIntent] = useState<ReviewIntent | null>(null);

  return (
    <AppContext.Provider
      value={{
        selectedBusinessId,
        setSelectedBusinessId,
        selectedRepositoryId,
        setSelectedRepositoryId,
        selectedProjectId,
        setSelectedProjectId,
        currentView,
        setCurrentView,
        selectedTaskId,
        setSelectedTaskId,
        reviewIntent,
        setReviewIntent,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppContext);
}
