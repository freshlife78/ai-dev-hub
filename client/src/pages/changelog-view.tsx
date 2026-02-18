import { useQuery } from "@tanstack/react-query";
import { useAppState } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, ArrowRight } from "lucide-react";
import type { ChangelogEntry } from "@shared/schema";

const statusColors: Record<string, string> = {
  Open: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "In Progress": "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  "Quality Review": "bg-purple-500/15 text-purple-400 border-purple-500/20",
  Done: "bg-green-500/15 text-green-400 border-green-500/20",
};

export default function ChangelogView() {
  const { selectedBusinessId } = useAppState();

  const { data: changelog = [], isLoading } = useQuery<ChangelogEntry[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "changelog"],
    enabled: !!selectedBusinessId,
  });

  if (!selectedBusinessId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center">
            <History className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Select a business to view changelog</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
        <History className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold" data-testid="text-changelog-title">Changelog</h2>
        <Badge variant="secondary" className="text-xs">
          {changelog.length} entries
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : changelog.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <div className="w-12 h-12 mx-auto rounded-md bg-muted flex items-center justify-center mb-3">
                <History className="w-6 h-6 text-muted-foreground" />
              </div>
              No changelog entries yet
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {changelog
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className="flex gap-3 relative"
                      data-testid={`changelog-entry-${entry.id}`}
                    >
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 z-10">
                        <History className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 pt-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">
                            {entry.taskId}
                          </span>
                          <span className="text-sm font-medium truncate">
                            {entry.taskTitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border ${statusColors[entry.fromStatus] || ""}`}>
                            {entry.fromStatus}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border ${statusColors[entry.toStatus] || ""}`}>
                            {entry.toStatus}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
