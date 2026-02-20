function computeSimpleDiff(original: string, modified: string): { type: "same" | "added" | "removed"; line: string; lineNum?: number }[] {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const result: { type: "same" | "added" | "removed"; line: string; lineNum?: number }[] = [];

  let i = 0, j = 0;
  while (i < origLines.length || j < modLines.length) {
    if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
      result.push({ type: "same", line: origLines[i], lineNum: j + 1 });
      i++; j++;
    } else if (j < modLines.length && (i >= origLines.length || !origLines.includes(modLines[j]))) {
      result.push({ type: "added", line: modLines[j], lineNum: j + 1 });
      j++;
    } else if (i < origLines.length) {
      result.push({ type: "removed", line: origLines[i] });
      i++;
    }
  }
  return result;
}

export function DiffView({ original, modified }: { original: string; modified: string }) {
  const lines = computeSimpleDiff(original, modified);

  const changedIndices = new Set<number>();
  lines.forEach((l, idx) => {
    if (l.type !== "same") {
      for (let c = Math.max(0, idx - 2); c <= Math.min(lines.length - 1, idx + 2); c++) {
        changedIndices.add(c);
      }
    }
  });

  const visibleLines: (typeof lines[0] & { collapsed?: boolean })[] = [];
  let lastIdx = -1;
  for (let idx = 0; idx < lines.length; idx++) {
    if (changedIndices.has(idx)) {
      if (lastIdx !== -1 && idx - lastIdx > 1) {
        visibleLines.push({ type: "same", line: `... ${idx - lastIdx - 1} unchanged lines ...`, collapsed: true });
      }
      visibleLines.push(lines[idx]);
      lastIdx = idx;
    }
  }
  if (lastIdx < lines.length - 1 && lastIdx !== -1) {
    visibleLines.push({ type: "same", line: `... ${lines.length - 1 - lastIdx} unchanged lines ...`, collapsed: true });
  }

  if (visibleLines.length === 0) {
    return <div className="px-3 py-2 text-[10px] text-muted-foreground italic">No differences found</div>;
  }

  return (
    <div className="font-mono text-[10px] leading-4">
      {visibleLines.map((l, idx) => (
        <div
          key={idx}
          className={`px-3 flex ${
            (l as any).collapsed ? "text-muted-foreground/50 italic" :
            l.type === "added" ? "bg-green-500/10 text-green-400" :
            l.type === "removed" ? "bg-red-500/10 text-red-400" :
            "text-muted-foreground"
          }`}
        >
          <span className="w-5 shrink-0 text-right mr-2 select-none opacity-50">
            {(l as any).collapsed ? "" : l.type === "added" ? "+" : l.type === "removed" ? "-" : " "}
          </span>
          <span className="whitespace-pre overflow-hidden text-ellipsis">{l.line || " "}</span>
        </div>
      ))}
    </div>
  );
}
