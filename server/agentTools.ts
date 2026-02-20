import type Anthropic from "@anthropic-ai/sdk";

export interface RepoContext {
  owner: string;
  repo: string;
  token: string;
}

export interface FileWrite {
  path: string;
  content: string;
  description: string;
}

export interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "file_write" | "pr_created" | "error" | "done";
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

function headers(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AI-Dev-Hub",
    "Content-Type": "application/json",
  };
}

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file from the repository. Returns the full file content as text.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path relative to the repository root (e.g. 'shared/schema.ts')" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description: "List files and directories at a given path in the repository. Returns names with trailing / for directories.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path relative to repo root. Use '' or '.' for root." },
      },
      required: ["path"],
    },
  },
  {
    name: "search_code",
    description: "Search for a text pattern across all files in the repository. Returns matching file paths and line snippets.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query string" },
        file_extension: { type: "string", description: "Optional file extension filter (e.g. 'ts', 'sql')" },
      },
      required: ["query"],
    },
  },
  {
    name: "write_file",
    description: "Create or modify a file. Provide the COMPLETE new file content. The file will be staged for the PR.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path relative to repo root" },
        content: { type: "string", description: "Complete file content to write" },
        description: { type: "string", description: "Brief description of what changed" },
      },
      required: ["path", "content", "description"],
    },
  },
  {
    name: "create_pull_request",
    description: "Create a GitHub Pull Request with all file changes made so far via write_file. Call this when you are finished making all changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description in markdown" },
        branch_name: { type: "string", description: "Branch name to create (e.g. 'feature/svc-001-service-catalog')" },
      },
      required: ["title", "body", "branch_name"],
    },
  },
];

export async function executeReadFile(ctx: RepoContext, path: string): Promise<string> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(
    `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${encodedPath}`,
    { headers: headers(ctx.token) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return `Error: Could not read ${path} — ${(err as any).message || res.statusText}`;
  }
  const data = await res.json();
  if (data.encoding === "base64" && data.content) {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }
  return `Error: File ${path} has unsupported encoding or is empty.`;
}

export async function executeListDirectory(ctx: RepoContext, path: string): Promise<string> {
  const cleanPath = path === "." || path === "" ? "" : path;
  const encodedPath = cleanPath ? cleanPath.split("/").map(encodeURIComponent).join("/") : "";
  const url = encodedPath
    ? `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${encodedPath}`
    : `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents`;
  const res = await fetch(url, { headers: headers(ctx.token) });
  if (!res.ok) {
    return `Error: Could not list directory ${path || "root"}`;
  }
  const data = await res.json();
  if (!Array.isArray(data)) return `${path} is a file, not a directory.`;
  return data.map((item: any) => `${item.name}${item.type === "dir" ? "/" : ""}`).join("\n");
}

export async function executeSearchCode(ctx: RepoContext, query: string, fileExtension?: string): Promise<string> {
  let searchQuery = `${query} repo:${ctx.owner}/${ctx.repo}`;
  if (fileExtension) searchQuery += ` extension:${fileExtension}`;
  const res = await fetch(
    `https://api.github.com/search/code?q=${encodeURIComponent(searchQuery)}&per_page=15`,
    { headers: headers(ctx.token) }
  );
  if (!res.ok) {
    return `Search failed: ${res.statusText}. Try read_file with a specific path instead.`;
  }
  const data = await res.json();
  if (!data.items || data.items.length === 0) return `No results found for "${query}"`;
  return data.items
    .map((item: any) => `${item.path} (${item.repository?.full_name || ""})`)
    .join("\n");
}

export async function executeCreatePR(
  ctx: RepoContext,
  pendingWrites: FileWrite[],
  title: string,
  body: string,
  branchName: string,
): Promise<{ url: string; number: number }> {
  const h = headers(ctx.token);

  // Get default branch SHA
  const repoRes = await fetch(`https://api.github.com/repos/${ctx.owner}/${ctx.repo}`, { headers: h });
  if (!repoRes.ok) throw new Error("Failed to fetch repo info");
  const repoInfo = await repoRes.json();
  const defaultBranch = repoInfo.default_branch || "main";

  const refRes = await fetch(
    `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/git/refs/heads/${defaultBranch}`,
    { headers: h }
  );
  if (!refRes.ok) throw new Error("Failed to get branch ref");
  const refData = await refRes.json();
  const baseSha = refData.object.sha;

  // Create branch
  const branchRes = await fetch(
    `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/git/refs`,
    { method: "POST", headers: h, body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }) }
  );
  if (!branchRes.ok) {
    const err = await branchRes.json().catch(() => ({}));
    throw new Error(`Failed to create branch: ${(err as any).message || "unknown"}`);
  }

  // Commit each file
  for (const file of pendingWrites) {
    const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
    // Check if file exists to get its SHA
    const existsRes = await fetch(
      `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${encodedPath}?ref=${branchName}`,
      { headers: h }
    );
    let fileSha: string | undefined;
    if (existsRes.ok) fileSha = (await existsRes.json()).sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${encodedPath}`,
      {
        method: "PUT",
        headers: h,
        body: JSON.stringify({
          message: `${file.description} — ${file.path}`,
          content: Buffer.from(file.content).toString("base64"),
          branch: branchName,
          ...(fileSha ? { sha: fileSha } : {}),
        }),
      }
    );
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(`Failed to write ${file.path}: ${(err as any).message || "unknown"}`);
    }
  }

  // Create PR
  const prRes = await fetch(
    `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/pulls`,
    {
      method: "POST",
      headers: h,
      body: JSON.stringify({ title, body, head: branchName, base: defaultBranch }),
    }
  );
  if (!prRes.ok) {
    const err = await prRes.json().catch(() => ({}));
    throw new Error(`Failed to create PR: ${(err as any).message || "unknown"}`);
  }
  const prData = await prRes.json();
  return { url: prData.html_url, number: prData.number };
}
