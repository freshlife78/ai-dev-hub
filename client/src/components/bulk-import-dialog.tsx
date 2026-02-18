import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Download,
  CheckCircle2,
  CircleAlert,
  Bug,
  Lightbulb,
  CheckSquare,
  ArrowUp,
  ArrowRight,
  ArrowDown,
} from "lucide-react";

const typeIcons: Record<string, typeof Bug> = {
  Bug: Bug,
  Feature: Lightbulb,
  Task: CheckSquare,
  Improvement: Lightbulb,
};

const typeColors: Record<string, string> = {
  Bug: "text-red-400",
  Feature: "text-blue-400",
  Task: "text-green-400",
  Improvement: "text-blue-400",
};

const priorityIcons: Record<string, typeof ArrowUp> = {
  High: ArrowUp,
  Medium: ArrowRight,
  Low: ArrowDown,
};

const priorityColors: Record<string, string> = {
  High: "text-red-400",
  Medium: "text-yellow-400",
  Low: "text-muted-foreground",
};

const TEMPLATE = JSON.stringify([
  {
    id: "MOB-001",
    type: "Task",
    priority: "High",
    title: "Example task title",
    description: "Detailed description of what needs to be done and why",
    reasoning: "Why this task is important and what problem it solves",
    fixSteps: "1. First step\n2. Second step\n3. Third step",
    replit_prompt: "Full prompt to paste into Replit Agent to implement this task",
  },
], null, 2);

interface ParsedTask {
  id?: string;
  type: string;
  priority: string;
  title: string;
  description?: string;
  reasoning?: string;
  fixSteps?: string;
  replit_prompt?: string;
  replitPrompt?: string;
}

interface ValidationResult {
  valid: boolean;
  tasks: ParsedTask[];
  error?: string;
  taskErrors: string[];
}

function validateJson(text: string): ValidationResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, tasks: [], error: undefined, taskErrors: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { valid: false, tasks: [], error: "Invalid JSON. Please check your syntax.", taskErrors: [] };
  }

  if (!Array.isArray(parsed)) {
    return { valid: false, tasks: [], error: "JSON must be an array of tasks.", taskErrors: [] };
  }

  if (parsed.length === 0) {
    return { valid: false, tasks: [], error: "No tasks found in JSON. Please add at least one task.", taskErrors: [] };
  }

  const validTypes = ["Bug", "Feature", "Task", "Improvement"];
  const validPriorities = ["High", "Medium", "Low"];
  const taskErrors: string[] = [];
  const validTasks: ParsedTask[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const raw = parsed[i];
    const errors: string[] = [];

    if (!raw.title || typeof raw.title !== "string" || !raw.title.trim()) {
      errors.push("missing title");
    }
    if (!raw.type || !validTypes.includes(raw.type)) {
      errors.push("invalid type (must be Bug, Feature, Task, or Improvement)");
    }
    if (!raw.priority || !validPriorities.includes(raw.priority)) {
      errors.push("invalid priority (must be High, Medium, or Low)");
    }

    if (errors.length > 0) {
      taskErrors.push(`Task ${i + 1}${raw.title ? ` ("${raw.title}")` : ""}: ${errors.join(", ")}`);
    } else {
      validTasks.push(raw as ParsedTask);
    }
  }

  return {
    valid: validTasks.length > 0,
    tasks: validTasks,
    taskErrors,
  };
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function BulkImportDialog({ open, onOpenChange, projectId }: BulkImportDialogProps) {
  const { selectedBusinessId } = useAppState();
  const { toast } = useToast();
  const [jsonText, setJsonText] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);

  const [validation, setValidation] = useState<ValidationResult>({ valid: false, tasks: [], taskErrors: [] });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = jsonText.trim();
    if (!trimmed) {
      setValidation({ valid: false, tasks: [], taskErrors: [] });
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const result = validateJson(jsonText);
    if (!result.error) {
      setValidation(result);
    } else {
      debounceRef.current = setTimeout(() => {
        setValidation(result);
      }, 600);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [jsonText]);

  const importMutation = useMutation({
    mutationFn: async (tasks: ParsedTask[]) => {
      const res = await apiRequest("POST", `/api/businesses/${selectedBusinessId}/projects/${projectId}/tasks/bulk-import`, { tasks });
      return res.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "tasks"] });

      if (data.failed === 0) {
        toast({ title: `${data.imported} tasks imported successfully` });
        setTimeout(() => {
          onOpenChange(false);
          setJsonText("");
          setImportResult(null);
          setValidation({ valid: false, tasks: [], taskErrors: [] });
        }, 2000);
      } else {
        toast({
          title: `${data.imported} of ${data.imported + data.failed} tasks imported`,
          description: `${data.failed} failed`,
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      let description = err.message || "Import failed. Please try again.";
      try {
        const cleaned = description.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(cleaned);
        if (parsed.message) description = parsed.message;
      } catch {}
      toast({ title: "Import failed", description, variant: "destructive" });
    },
  });

  const handleImport = () => {
    if (!validation.valid || validation.tasks.length === 0) return;
    setImportResult(null);
    importMutation.mutate(validation.tasks);
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tasks-template.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setJsonText("");
      setImportResult(null);
      setValidation({ valid: false, tasks: [], taskErrors: [] });
    }
    onOpenChange(val);
  };

  const allParsedTasks = useMemo(() => {
    const trimmed = jsonText.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
  }, [jsonText]);

  const hasText = jsonText.trim().length > 0;
  const isJsonError = hasText && validation.error;
  const hasValidationErrors = hasText && !validation.error && validation.taskErrors.length > 0;
  const isReady = validation.valid && validation.tasks.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle data-testid="text-import-title">Import Tasks</DialogTitle>
          <DialogDescription>Paste a JSON array of tasks to import them all at once</DialogDescription>
        </DialogHeader>

        {importResult && importResult.failed === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3" data-testid="import-success">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="text-sm font-medium">{importResult.imported} tasks imported successfully</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {isReady && (
                  <Badge variant="secondary" className="text-green-600 dark:text-green-400" data-testid="badge-ready-count">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {validation.tasks.length} tasks ready to import
                  </Badge>
                )}
                {hasValidationErrors && (
                  <Badge variant="secondary" className="text-red-600 dark:text-red-400" data-testid="badge-error-count">
                    <CircleAlert className="w-3 h-3 mr-1" />
                    {validation.taskErrors.length} tasks have errors
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={handleDownloadTemplate} data-testid="button-download-template">
                <Download className="w-3 h-3 mr-1.5" />
                Download Template
              </Button>
            </div>

            <div className="relative flex-1 min-h-0">
              <textarea
                className={`w-full h-full min-h-[280px] rounded-md border p-3 font-mono text-xs resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                  isJsonError ? "border-red-500 focus:ring-red-500" :
                  isReady ? "border-green-500 focus:ring-green-500" :
                  "border-border"
                }`}
                placeholder={`Paste your JSON array here...\n\n[\n  {\n    "id": "MOB-001",\n    "type": "Task",\n    "priority": "High",\n    "title": "Your task title"\n  }\n]`}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                disabled={importMutation.isPending}
                data-testid="textarea-json-input"
              />
            </div>

            {isJsonError && (
              <p className="text-xs text-red-500" data-testid="text-json-error">{validation.error}</p>
            )}

            {hasValidationErrors && (
              <div className="space-y-1" data-testid="validation-errors">
                {validation.taskErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-500">{err}</p>
                ))}
              </div>
            )}

            {isReady && validation.tasks.length > 0 && (
              <ScrollArea className="max-h-[160px] border border-border rounded-md">
                <div className="p-2 space-y-1" data-testid="task-preview-list">
                  {validation.tasks.map((t, i) => {
                    const TypeIcon = typeIcons[t.type] || CheckSquare;
                    const PriorityIcon = priorityIcons[t.priority] || ArrowRight;
                    return (
                      <div key={i} className="flex items-center gap-2 py-1 px-2 rounded-md bg-muted/50" data-testid={`preview-task-${i}`}>
                        <TypeIcon className={`w-3.5 h-3.5 shrink-0 ${typeColors[t.type] || "text-muted-foreground"}`} />
                        {t.id && (
                          <span className="font-mono text-[10px] text-muted-foreground shrink-0">{t.id}</span>
                        )}
                        <span className="text-xs truncate flex-1">{t.title}</span>
                        <Badge variant="outline" className="text-[9px] shrink-0">{t.type}</Badge>
                        <Badge variant="secondary" className={`text-[9px] shrink-0 ${priorityColors[t.priority] || "text-muted-foreground"}`}>
                          <PriorityIcon className="w-2.5 h-2.5 mr-0.5" />
                          {t.priority}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {importResult && importResult.failed > 0 && (
              <div className="space-y-1 border border-red-500/20 rounded-md p-2" data-testid="import-partial-errors">
                <p className="text-xs font-medium text-red-500">
                  {importResult.imported} of {importResult.imported + importResult.failed} imported. {importResult.failed} failed:
                </p>
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-500">{err}</p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={importMutation.isPending} data-testid="button-cancel-import">
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!isReady || importMutation.isPending}
                data-testid="button-import"
              >
                {importMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Importing tasks...</>
                ) : (
                  <>Import {validation.tasks.length > 0 ? validation.tasks.length : ""} Tasks</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
