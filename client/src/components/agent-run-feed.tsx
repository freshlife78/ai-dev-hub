import { useState, useEffect, useRef } from "react";
import { DiffView } from "@/components/diff-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  FileCode,
  FolderOpen,
  Search,
  PenLine,
  GitPullRequest,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Brain,
} from "lucide-react";

interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "file_write" | "pr_created" | "error" | "done" | "complete";
  content?: string;
  tool?: string;
  input?: any;
  result?: string;
  path?: string;
  fileContent?: string;
  description?: string;
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
}

const toolIcons: Record<string, typeof FileCode> = {
  read_file: FileCode,
  list_directory: FolderOpen,
  search_code: Search,
  write_file: PenLine,
  create_pull_request: GitPullRequest,
};

const toolLabels: Record<string, string> = {
  read_file: "Reading",
  list_directory: "Listing",
  search_code: "Searching",
  write_file: "Writing",
  create_pull_request: "Creating PR",
};

export function AgentRunFeed({
  businessId,
  taskId,
  projectId,
  instructions,
  onComplete,
}: {
  businessId: string;
  taskId: string;
  projectId: string;
  instructions?: string;
  onComplete?: () => void;
}) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const feedEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      try {
        const res = await fetch(`/api/businesses/${businessId}/manager/agent-run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, projectId, instructions }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Request failed" }));
          setSteps(prev => [...prev, { type: "error", content: err.message || "Agent run failed" }]);
          setIsRunning(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setSteps(prev => [...prev, { type: "error", content: "No response stream" }]);
          setIsRunning(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const step = JSON.parse(line.slice(6)) as AgentStep;
                setSteps(prev => [...prev, step]);
                if (step.type === "complete" || step.type === "done") {
                  setIsRunning(false);
                }
              } catch {}
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setSteps(prev => [...prev, { type: "error", content: err.message || "Connection lost" }]);
        }
      }
      setIsRunning(false);
      onComplete?.();
    };

    run();
    return () => controller.abort();
  }, [businessId, taskId, projectId, instructions, onComplete]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const fileWrites = steps.filter(s => s.type === "file_write");
  const prStep = steps.find(s => s.type === "pr_created");

  return (
    <div className="border border-emerald-500/20 rounded-lg overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
        <Brain className="w-4 h-4 text-emerald-500" />
        <span className="text-xs font-semibold text-emerald-500">Agent Run</span>
        {isRunning && <Loader2 className="w-3 h-3 animate-spin text-emerald-500 ml-auto" />}
        {!isRunning && prStep && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto" />}
        {!isRunning && !prStep && steps.some(s => s.type === "error") && <AlertCircle className="w-3.5 h-3.5 text-red-500 ml-auto" />}
      </div>

      {/* Step feed */}
      <div className="max-h-[500px] overflow-y-auto">
        <div className="p-3 space-y-2">
          {steps.map((step, idx) => {
            switch (step.type) {
              case "thinking":
                return (
                  <div key={idx} className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {step.content}
                  </div>
                );

              case "tool_call": {
                const Icon = toolIcons[step.tool || ""] || FileCode;
                const label = toolLabels[step.tool || ""] || step.tool;
                return (
                  <div key={idx} className="flex items-center gap-2 py-1">
                    <Icon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-[11px] text-blue-400 font-medium">{label}</span>
                    <span className="text-[11px] font-mono text-muted-foreground truncate">
                      {step.input?.path || step.input?.query || step.input?.title || ""}
                    </span>
                  </div>
                );
              }

              case "file_write":
                return (
                  <div key={idx} className="border border-emerald-500/20 rounded-md overflow-hidden">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors bg-emerald-500/5"
                      onClick={() => toggleFile(step.path || "")}
                    >
                      {expandedFiles.has(step.path || "") ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <PenLine className="w-3 h-3 text-emerald-500" />
                      <span className="text-[11px] font-mono flex-1 truncate text-emerald-400">{step.path}</span>
                      <Badge variant="secondary" className="text-[9px]">
                        {step.content ? "modified" : "new"}
                      </Badge>
                    </button>
                    {step.description && (
                      <div className="px-3 py-1 text-[10px] text-muted-foreground border-t border-border/50">
                        {step.description}
                      </div>
                    )}
                    {expandedFiles.has(step.path || "") && (
                      <div className="border-t border-border max-h-[300px] overflow-auto">
                        <DiffView original={step.content || ""} modified={step.fileContent || ""} />
                      </div>
                    )}
                  </div>
                );

              case "pr_created":
                return (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-md border border-emerald-500/30">
                    <GitPullRequest className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-emerald-500">Pull Request Created</div>
                      <a
                        href={step.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        PR #{step.prNumber} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      {step.branchName && (
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{step.branchName}</div>
                      )}
                    </div>
                  </div>
                );

              case "error":
                return (
                  <div key={idx} className="flex items-start gap-2 px-3 py-2 bg-red-500/10 rounded-md border border-red-500/20">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-red-400">{step.content}</span>
                  </div>
                );

              case "done":
                return step.content ? (
                  <div key={idx} className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {step.content}
                  </div>
                ) : null;

              default:
                return null;
            }
          })}

          {isRunning && steps.length > 0 && (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
              <span className="text-[11px] text-muted-foreground">Working...</span>
            </div>
          )}

          <div ref={feedEndRef} />
        </div>
      </div>

      {/* Summary footer */}
      {!isRunning && fileWrites.length > 0 && (
        <div className="px-3 py-2 border-t border-border bg-muted/30 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{fileWrites.length} file{fileWrites.length !== 1 ? "s" : ""} changed</span>
          {prStep && (
            <a
              href={prStep.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-500 hover:underline flex items-center gap-1"
            >
              View PR #{prStep.prNumber} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
