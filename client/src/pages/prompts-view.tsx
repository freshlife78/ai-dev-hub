import { useQuery } from "@tanstack/react-query";
import { useAppState } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Terminal, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";
import type { Task, Project } from "@shared/schema";

const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const priorityIcons = { High: ArrowUp, Medium: ArrowRight, Low: ArrowDown };
const priorityColors: Record<string, string> = {
  High: "text-red-400",
  Medium: "text-yellow-400",
  Low: "text-muted-foreground",
};

export default function PromptsView() {
  const { selectedBusinessId } = useAppState();
  const { toast } = useToast();

  const { data: allData = [], isLoading } = useQuery<{ project: Project; tasks: Task[] }[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "tasks"],
    enabled: !!selectedBusinessId,
  });

  const allOpenTasks = allData
    .flatMap((g) =>
      g.tasks
        .filter((t) => t.status === "Open" && t.replitPrompt)
        .map((t) => ({ ...t, _projectId: g.project.id, _projectName: g.project.name, _projectColor: g.project.color }))
    )
    .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

  if (!selectedBusinessId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Select a business to view prompts</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border flex-wrap">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold" data-testid="text-prompts-title">Prompts Queue</h2>
          <Badge variant="secondary" className="text-xs">
            {allOpenTasks.length} prompts
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-md" />
            ))
          ) : allOpenTasks.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center mb-3">
                <Terminal className="w-6 h-6 text-muted-foreground" />
              </div>
              No open tasks with prompts
            </div>
          ) : (
            allOpenTasks.map((task) => {
              const PriorityIcon = priorityIcons[task.priority];
              return (
                <Card key={`${task._projectId}-${task.id}`} className="p-4" data-testid={`prompt-card-${task.id}`}>
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: task._projectColor }}
                      />
                      <span className="text-xs text-muted-foreground">{task._projectName}</span>
                      <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
                      <PriorityIcon className={`w-3.5 h-3.5 ${priorityColors[task.priority]}`} />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(task.replitPrompt);
                        toast({ title: "Prompt copied" });
                      }}
                      data-testid={`button-copy-prompt-${task.id}`}
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-sm font-medium mb-2" data-testid={`prompt-title-${task.id}`}>
                    {task.title}
                  </p>
                  <div className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap break-all" data-testid={`prompt-content-${task.id}`}>
                    {task.replitPrompt}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
