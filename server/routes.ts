import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { seedData } from "./seed";
import { insertProjectSchema, insertTaskSchema, insertBusinessSchema, insertRepositorySchema, type InsertTask, type ManagerAction } from "@shared/schema";
import Anthropic from "@anthropic-ai/sdk";
import type { Repository } from "@shared/schema";

interface GitHubTreeItem {
  path: string;
  type: string;
  size?: number;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
}

async function fetchGitHubHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "AI-Dev-Hub",
  };
}

async function fetchRepoTopLevelTree(repo: Repository): Promise<{ name: string; repoId: string; tree: string[] } | null> {
  if (!repo.token || !repo.owner || !repo.repo) return null;
  try {
    const headers = await fetchGitHubHeaders(repo.token);
    const repoRes = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
      { headers }
    );
    if (!repoRes.ok) return { name: repo.name, repoId: repo.id, tree: [`(Error fetching repo info: ${repoRes.status})`] };
    const repoInfo = await repoRes.json();
    const defaultBranch = repoInfo.default_branch || "main";

    const res = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${defaultBranch}`,
      { headers }
    );
    if (!res.ok) return { name: repo.name, repoId: repo.id, tree: [`(Error fetching tree: ${res.status})`] };
    const data = await res.json();
    const items = (data.tree || []) as GitHubTreeItem[];
    return {
      name: repo.name,
      repoId: repo.id,
      tree: items.map(i => `${i.type === "tree" ? "[dir]" : "[file]"} ${i.path}`),
    };
  } catch (err: any) {
    return { name: repo.name, repoId: repo.id, tree: [`(Error: ${err.message})`] };
  }
}

async function fetchRepoRecentCommits(repo: Repository, count = 10): Promise<{ name: string; repoId: string; commits: string[] } | null> {
  if (!repo.token || !repo.owner || !repo.repo) return null;
  try {
    const headers = await fetchGitHubHeaders(repo.token);
    const res = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=${count}`,
      { headers }
    );
    if (!res.ok) return { name: repo.name, repoId: repo.id, commits: [`(Error fetching commits: ${res.status})`] };
    const data = (await res.json()) as GitHubCommit[];
    return {
      name: repo.name,
      repoId: repo.id,
      commits: data.map(c => `- ${c.sha.slice(0, 7)} ${c.commit.message.split("\n")[0]} (${c.commit.author.name}, ${new Date(c.commit.author.date).toLocaleDateString()})`),
    };
  } catch (err: any) {
    return { name: repo.name, repoId: repo.id, commits: [`(Error: ${err.message})`] };
  }
}

async function fetchFileFromRepo(repo: Repository, filePath: string): Promise<string | null> {
  if (!repo.token || !repo.owner || !repo.repo) return null;
  try {
    const headers = await fetchGitHubHeaders(repo.token);
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${encodedPath}`,
      { headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.encoding === "base64" && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return data.content || null;
  } catch {
    return null;
  }
}

const filePathRegexGlobal = /(?:`([^`]+\.\w{1,5})`|(?:(?:check|look at|see|open|review|show|examine|inspect|read|fetch|analyze)\s+)([^\s,."']+\.\w{1,5})|(?:^|\s)((?:[\w@.-]+\/)+[\w.-]+\.\w{1,5}))/gi;
const validFileExts = new Set(["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "php", "rb", "css", "scss", "html", "json", "yaml", "yml", "md", "sql", "sh", "vue", "svelte", "swift", "kt", "dart", "xml", "toml", "cfg", "env", "lock"]);

function detectFilePathsInText(text: string): string[] {
  const found = new Set<string>();
  let m;
  const regex = new RegExp(filePathRegexGlobal.source, filePathRegexGlobal.flags);
  while ((m = regex.exec(text)) !== null) {
    const fp = (m[1] || m[2] || m[3]).trim();
    const ext = fp.split(".").pop()?.toLowerCase();
    if (ext && validFileExts.has(ext) && !fp.startsWith("http") && !fp.startsWith("//") && !fp.endsWith(".com") && !fp.endsWith(".org") && !fp.endsWith(".io") && fp.length < 200) {
      found.add(fp);
    }
  }
  return Array.from(found);
}

function matchFileToRepo(filePath: string, repos: Repository[], conversationContext: string): Repository | null {
  const configured = repos.filter(r => r.owner && r.repo && r.token);
  if (configured.length === 0) return null;
  if (configured.length === 1) return configured[0];

  const ctxLower = conversationContext.toLowerCase();
  for (const repo of configured) {
    const repoNameLower = repo.name.toLowerCase();
    const repoRepoLower = repo.repo.toLowerCase();
    if (ctxLower.includes(repoNameLower) || ctxLower.includes(repoRepoLower)) {
      return repo;
    }
  }

  const fpLower = filePath.toLowerCase();
  const mobilePrefixes = ["app/", "constants/", "hooks/", "assets/", "metro.config", "app.json", "expo"];
  const fullstackPrefixes = ["client/", "server/", "shared/", "scripts/", "script/", "public/"];

  const isMobilePath = mobilePrefixes.some(p => fpLower.startsWith(p));
  const isFullstackPath = fullstackPrefixes.some(p => fpLower.startsWith(p));

  if (isMobilePath) {
    const mobileRepo = configured.find(r => r.type === "mobile");
    if (mobileRepo) return mobileRepo;
  }
  if (isFullstackPath) {
    const fullstackRepo = configured.find(r => r.type === "fullstack" || r.type === "backend" || r.type === "api");
    if (fullstackRepo) return fullstackRepo;
  }

  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  seedData();

  app.get("/api/businesses", (_req, res) => {
    res.json(storage.getBusinesses());
  });

  app.post("/api/businesses", (req, res) => {
    try {
      const data = insertBusinessSchema.parse(req.body);
      const biz = storage.createBusiness(data);
      res.status(201).json(biz);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/businesses/:bizId", (req, res) => {
    const biz = storage.getBusiness(req.params.bizId);
    if (!biz) return res.status(404).json({ message: "Business not found" });
    res.json(biz);
  });

  app.put("/api/businesses/:bizId", (req, res) => {
    const updated = storage.updateBusiness(req.params.bizId, req.body);
    if (!updated) return res.status(404).json({ message: "Business not found" });
    res.json(updated);
  });

  app.delete("/api/businesses/:bizId", (req, res) => {
    const deleted = storage.deleteBusiness(req.params.bizId);
    if (!deleted) return res.status(404).json({ message: "Business not found" });
    res.json({ success: true });
  });

  app.get("/api/businesses/:bizId/repositories", (req, res) => {
    res.json(storage.getRepositories(req.params.bizId));
  });

  app.post("/api/businesses/:bizId/repositories", (req, res) => {
    try {
      const data = insertRepositorySchema.parse(req.body);
      const repo = storage.createRepository(req.params.bizId, data);
      res.status(201).json(repo);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/businesses/:bizId/repositories/:repoId", (req, res) => {
    const repo = storage.getRepository(req.params.bizId, req.params.repoId);
    if (!repo) return res.status(404).json({ message: "Repository not found" });
    res.json(repo);
  });

  app.put("/api/businesses/:bizId/repositories/:repoId", (req, res) => {
    const updated = storage.updateRepository(req.params.bizId, req.params.repoId, req.body);
    if (!updated) return res.status(404).json({ message: "Repository not found" });
    res.json(updated);
  });

  app.delete("/api/businesses/:bizId/repositories/:repoId", (req, res) => {
    const deleted = storage.deleteRepository(req.params.bizId, req.params.repoId);
    if (!deleted) return res.status(404).json({ message: "Repository not found" });
    res.json({ success: true });
  });

  app.get("/api/businesses/:bizId/agents", (req, res) => {
    res.json(storage.getBusinessAgents(req.params.bizId));
  });

  app.post("/api/businesses/:bizId/agents", (req, res) => {
    const { name, type, apiKey, role, isReviewAgent } = req.body;
    if (!name || !type) return res.status(400).json({ message: "name and type are required" });
    const agent = storage.addAgent(req.params.bizId, {
      name,
      type: type || "Claude",
      apiKey: apiKey || "",
      role: role || "",
      isReviewAgent: isReviewAgent || false,
    });
    if (!agent) return res.status(404).json({ message: "Business not found" });
    res.status(201).json(agent);
  });

  app.put("/api/businesses/:bizId/agents/:agentId", (req, res) => {
    const updated = storage.updateAgent(req.params.bizId, req.params.agentId, req.body);
    if (!updated) return res.status(404).json({ message: "Agent not found" });
    res.json(updated);
  });

  app.delete("/api/businesses/:bizId/agents/:agentId", (req, res) => {
    const deleted = storage.deleteAgent(req.params.bizId, req.params.agentId);
    if (!deleted) return res.status(404).json({ message: "Agent not found" });
    res.json({ success: true });
  });

  app.get("/api/businesses/:bizId/projects", (req, res) => {
    res.json(storage.getProjects(req.params.bizId));
  });

  app.post("/api/businesses/:bizId/projects", (req, res) => {
    try {
      const data = insertProjectSchema.parse(req.body);
      const project = storage.createProject(req.params.bizId, data);
      res.status(201).json(project);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/businesses/:bizId/projects/:projectId", (req, res) => {
    const project = storage.getProject(req.params.bizId, req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.put("/api/businesses/:bizId/projects/:projectId", (req, res) => {
    const updated = storage.updateProject(req.params.bizId, req.params.projectId, req.body);
    if (!updated) return res.status(404).json({ message: "Project not found" });
    res.json(updated);
  });

  app.delete("/api/businesses/:bizId/projects/:projectId", (req, res) => {
    const deleted = storage.deleteProject(req.params.bizId, req.params.projectId);
    if (!deleted) return res.status(404).json({ message: "Project not found" });
    res.json({ success: true });
  });

  app.get("/api/businesses/:bizId/tasks", (req, res) => {
    res.json(storage.getAllTasksForBusiness(req.params.bizId));
  });

  app.get("/api/businesses/:bizId/projects/:projectId/tasks", (req, res) => {
    const project = storage.getProject(req.params.bizId, req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(storage.getTasks(req.params.projectId));
  });

  app.post("/api/businesses/:bizId/projects/:projectId/tasks/bulk-import", (req, res) => {
    try {
      const project = storage.getProject(req.params.bizId, req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const body = req.body;
      if (!Array.isArray(body.tasks)) {
        return res.status(400).json({ message: "Request body must contain a 'tasks' array" });
      }

      const validTypes = ["Bug", "Feature", "Task", "Improvement"];
      const validPriorities = ["High", "Medium", "Low"];
      const imported: string[] = [];
      const errors: string[] = [];

      for (let i = 0; i < body.tasks.length; i++) {
        const raw = body.tasks[i];
        try {
          if (!raw.title || typeof raw.title !== "string" || !raw.title.trim()) {
            errors.push(`Task ${i + 1}: missing required field 'title'`);
            continue;
          }
          if (!raw.type || !validTypes.includes(raw.type)) {
            errors.push(`Task ${i + 1} ("${raw.title}"): invalid or missing 'type' (must be Bug, Feature, Task, or Improvement)`);
            continue;
          }
          if (!raw.priority || !validPriorities.includes(raw.priority)) {
            errors.push(`Task ${i + 1} ("${raw.title}"): invalid or missing 'priority' (must be High, Medium, or Low)`);
            continue;
          }

          const taskType = raw.type === "Improvement" ? "Feature" : raw.type;

          const taskData: InsertTask = {
            type: taskType as "Bug" | "Feature" | "Task",
            status: (raw.status as any) || "Open",
            priority: raw.priority as "High" | "Medium" | "Low",
            title: raw.title.trim(),
            description: raw.description || "",
            reasoning: raw.reasoning || "",
            fixSteps: raw.fixSteps || "",
            replitPrompt: raw.replit_prompt || raw.replitPrompt || "",
            repositoryId: raw.repositoryId || project.defaultRepositoryId || "",
            filePath: raw.filePath || "",
            autoAnalysisComplete: false,
            generatedPrompts: [],
          };

          const task = storage.createTask(req.params.projectId, taskData, raw.id);
          imported.push(task.id);
        } catch (err: any) {
          errors.push(`Task ${i + 1} ("${raw.title || "unknown"}"): ${err.message}`);
        }
      }

      res.json({
        imported: imported.length,
        failed: errors.length,
        errors,
        taskIds: imported,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/businesses/:bizId/projects/:projectId/tasks", (req, res) => {
    try {
      const project = storage.getProject(req.params.bizId, req.params.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const data = insertTaskSchema.parse(req.body);
      const task = storage.createTask(req.params.projectId, data);
      res.status(201).json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/businesses/:bizId/projects/:projectId/tasks/:taskId", (req, res) => {
    const task = storage.getTask(req.params.projectId, req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  });

  app.put("/api/businesses/:bizId/projects/:projectId/tasks/:taskId", (req, res) => {
    const updated = storage.updateTask(req.params.projectId, req.params.taskId, req.body, req.params.bizId);
    if (!updated) return res.status(404).json({ message: "Task not found" });
    res.json(updated);
  });

  app.delete("/api/businesses/:bizId/projects/:projectId/tasks/:taskId", (req, res) => {
    const deleted = storage.deleteTask(req.params.projectId, req.params.taskId);
    if (!deleted) return res.status(404).json({ message: "Task not found" });
    res.json({ success: true });
  });

  app.post("/api/businesses/:bizId/projects/:projectId/tasks/:taskId/move", (req, res) => {
    const { targetProjectId } = req.body;
    if (!targetProjectId) return res.status(400).json({ message: "targetProjectId is required" });
    const fromProject = storage.getProject(req.params.bizId, req.params.projectId);
    if (!fromProject) return res.status(404).json({ message: "Source project not found" });
    const toProject = storage.getProject(req.params.bizId, targetProjectId);
    if (!toProject) return res.status(404).json({ message: "Target project not found" });
    if (req.params.projectId === targetProjectId) return res.status(400).json({ message: "Task is already in this project" });
    const task = storage.moveTask(req.params.projectId, targetProjectId, req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json({ task, fromProject: fromProject.name, toProject: toProject.name });
  });

  app.patch("/api/businesses/:bizId/projects/:projectId/bulk-update-repository", (req, res) => {
    const project = storage.getProject(req.params.bizId, req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const { repositoryId, onlyUnlinked } = req.body;
    if (!repositoryId) return res.status(400).json({ message: "repositoryId is required" });
    const count = storage.bulkUpdateTasksRepository(req.params.projectId, repositoryId, !!onlyUnlinked);
    res.json({ updated: count });
  });

  app.get("/api/businesses/:bizId/projects/:projectId/tasks/:taskId/reviews", (req, res) => {
    const task = storage.getTask(req.params.projectId, req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(storage.getCodeReviews(req.params.taskId));
  });

  app.post("/api/businesses/:bizId/projects/:projectId/tasks/:taskId/reviews", (req, res) => {
    const { repositoryId, filePath, review, question } = req.body;
    if (!repositoryId || !filePath || !review) {
      return res.status(400).json({ message: "repositoryId, filePath, and review are required" });
    }
    const task = storage.getTask(req.params.projectId, req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const saved = storage.addCodeReview({
      taskId: req.params.taskId,
      projectId: req.params.projectId,
      repositoryId,
      filePath,
      review,
      question: question || "",
      timestamp: new Date().toISOString(),
    });
    res.json(saved);
  });

  app.post("/api/businesses/:bizId/projects/:projectId/tasks/:taskId/generate-fix-prompt", async (req, res) => {
    const { reviewResults, filePath, source } = req.body;
    if (!reviewResults) {
      return res.status(400).json({ message: "reviewResults is required" });
    }
    const task = storage.getTask(req.params.projectId, req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const bizId = req.params.bizId;
    const reviewAgent = storage.getReviewAgent(bizId);
    const apiKey = reviewAgent?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "No AI agent configured and ANTHROPIC_API_KEY is not set." });
    }

    try {
      const anthropic = new Anthropic({ apiKey });

      const systemPrompt = `You are an expert at converting code review findings into concise, actionable prompts for AI coding agents (Replit, Cursor, Bolt.new, etc.).

Rules for the generated prompt:
- Start with the file name
- Be specific about location (line numbers, function names)
- State the expected outcome
- Keep it under 200 words
- Use clear, direct instructions
- Do NOT include code snippets (agents can see the file)
- Do NOT use vague language ("improve", "optimize")
- Do NOT write multi-paragraph essays
- Do NOT ask questions — give direct instructions
- Do NOT reference specific tools or platforms
- Format: "In [file], [what to fix]. [How to fix it]. [Expected outcome]."

Output ONLY the prompt text. No explanations, no headers, no markdown formatting.`;

      let userPrompt = `Based on this code review, generate a fix prompt for an AI development agent.

Task: ${task.id} - ${task.title}
Type: ${task.type} | Priority: ${task.priority}`;

      if (task.description) userPrompt += `\nDescription: ${task.description}`;
      if (task.fixSteps) userPrompt += `\nFix Steps: ${task.fixSteps}`;
      if (filePath) userPrompt += `\nFile: ${filePath}`;

      userPrompt += `\n\nCode review findings:\n${reviewResults}\n\nGenerate the fix prompt now:`;

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      });

      const prompt = msg.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n\n")
        .trim();

      const updated = storage.addGeneratedPrompt(req.params.projectId, req.params.taskId, {
        source: source === "discussion" ? "discussion" : "code_review",
        prompt,
        filePath: filePath || "",
      });

      res.json({ prompt, task: updated });
    } catch (err: any) {
      console.error("[generate-fix-prompt] Error:", err);
      res.status(500).json({ message: `Failed to generate fix prompt: ${err.message}` });
    }
  });

  app.get("/api/businesses/:bizId/projects/:projectId/tasks/:taskId/discussion", (req, res) => {
    const task = storage.getTask(req.params.projectId, req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(storage.getDiscussion(req.params.projectId, req.params.taskId));
  });

  app.post("/api/businesses/:bizId/projects/:projectId/tasks/:taskId/discuss", async (req, res) => {
    const { message, includeTaskContext, isAutoAnalysis, isReanalysis } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "message is required" });
    }

    const task = storage.getTask(req.params.projectId, req.params.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const bizId = req.params.bizId;
    const reviewAgent = storage.getReviewAgent(bizId);
    const apiKey = reviewAgent?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "No AI agent configured and ANTHROPIC_API_KEY is not set." });
    }

    const filePathRegex = /(?:`([^`]+\.\w{1,5})`|(?:(?:check|look at|see|open|review|show|examine|inspect)\s+)([^\s,."']+\.\w{1,5})|(?:^|\s)((?:[\w@.-]+\/)+[\w.-]+\.\w{1,5}))/gi;
    const validExts = new Set(["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "php", "rb", "css", "scss", "html", "json", "yaml", "yml", "md", "sql", "sh", "vue", "svelte"]);

    function extractFilePaths(text: string): string[] {
      const results: string[] = [];
      let m;
      const regex = new RegExp(filePathRegex.source, filePathRegex.flags);
      while ((m = regex.exec(text)) !== null) {
        const fp = (m[1] || m[2] || m[3]).trim();
        const ext = fp.split(".").pop()?.toLowerCase();
        if (ext && validExts.has(ext) && !results.includes(fp)) {
          results.push(fp);
        }
      }
      return results;
    }

    const reverifyPatterns = [
      /check\s*again/i,
      /verify/i,
      /review\s*(it\s*)?again/i,
      /review\s*(the\s*)?(code|changes|fix|file|implementation)/i,
      /is\s*it\s*(fixed|done|ready|working)/i,
      /i\s*(pushed|made|applied|deployed|committed)\s*(the\s*)?(fix|changes?|update|code)?/i,
      /done[\s,]*\s*(can\s*you\s*)?(verify|check|review)/i,
      /re-?(check|verify|review|analyze|examine|fetch|load)/i,
      /fixed\s*(it|that|this|the)/i,
      /try\s*again/i,
      /look\s*again/i,
      /check\s*(the\s*)?(code|changes|fix|file|latest|current|new)/i,
      /changes?\s*(are\s*)?(done|ready|pushed|committed|merged|deployed|live)/i,
      /updated?\s*(the\s*)?(code|file|fix|implementation)/i,
      /can\s*you\s*(re-?)?check/i,
      /refresh\s*(the\s*)?(files?|code|context)/i,
      /fetch\s*(the\s*)?(latest|fresh|new|updated)/i,
      /how\s*(does|is)\s*(it|the\s*(code|fix))\s*(look|now)/i,
      /did\s*(that|it|the\s*fix)\s*(work|help)/i,
      /still\s*(broken|failing|wrong|incomplete|an?\s*issue)/i,
      /any\s*(progress|improvement|change)/i,
      /what\s*(does|do)\s*(it|the\s*code)\s*look\s*like\s*now/i,
    ];
    const isReverification = isReanalysis || (!isAutoAnalysis && reverifyPatterns.some(p => p.test(message)));
    console.log(`[DISCUSS] === START === task=${req.params.taskId}, isAutoAnalysis=${isAutoAnalysis}, isReanalysis=${isReanalysis}, isReverification=${isReverification}`);
    console.log(`[DISCUSS] task.repositoryId=${task.repositoryId}, task.filePath=${task.filePath}`);

    let detectedFiles: string[];
    if (isAutoAnalysis) {
      const allText = `${task.description}\n${task.fixSteps}\n${task.reasoning}\n${task.replitPrompt}`;
      detectedFiles = extractFilePaths(allText);
      if (task.filePath && !detectedFiles.includes(task.filePath)) {
        detectedFiles.unshift(task.filePath);
      }
      console.log(`[DISCUSS] Auto-analysis detected files from task text:`, detectedFiles);
    } else {
      detectedFiles = extractFilePaths(message);
      console.log(`[DISCUSS] User message detected files:`, detectedFiles);
    }

    const existingMessages = storage.getDiscussion(req.params.projectId, req.params.taskId);
    console.log(`[DISCUSS] Existing discussion messages: ${existingMessages.length}`);

    if (isReverification) {
      const previouslyLoadedFiles = new Set<string>();
      for (const m of existingMessages) {
        if (m.filesLoaded) {
          for (const f of m.filesLoaded) previouslyLoadedFiles.add(f);
        }
      }
      if (task.filePath) previouslyLoadedFiles.add(task.filePath);
      console.log(`[DISCUSS] Previously loaded files from history:`, Array.from(previouslyLoadedFiles));
      Array.from(previouslyLoadedFiles).forEach(fp => {
        if (!detectedFiles.includes(fp)) {
          detectedFiles.push(fp);
        }
      });

      if (detectedFiles.length === 0) {
        console.log(`[DISCUSS] No files found from history or message - falling back to task text extraction`);
        const allText = `${task.description || ''}\n${task.fixSteps || ''}\n${task.reasoning || ''}\n${task.replitPrompt || ''}`;
        const taskTextFiles = extractFilePaths(allText);
        if (task.filePath && !taskTextFiles.includes(task.filePath)) {
          taskTextFiles.unshift(task.filePath);
        }
        taskTextFiles.forEach(fp => {
          if (!detectedFiles.includes(fp)) {
            detectedFiles.push(fp);
          }
        });
        console.log(`[DISCUSS] Files from task text fallback:`, taskTextFiles);
      }

      console.log(`[DISCUSS] Final detectedFiles after merge:`, detectedFiles);
    }

    const repoId = task.repositoryId;
    let repo: any = null;
    if (repoId) {
      repo = storage.getRepositoryWithToken(repoId);
      console.log(`[DISCUSS] Direct repo lookup for repoId=${repoId}: found=${!!repo}`);
    } else {
      console.log(`[DISCUSS] No task.repositoryId set`);
    }

    const loadedFiles: { path: string; content: string; source: string }[] = [];
    const loadedFilePaths: string[] = [];

    async function fetchFileFromGitHub(filePath: string): Promise<string | null> {
      if (!repo || !repo.token || !repo.owner || !repo.repo) {
        console.log(`[DISCUSS] fetchFileFromGitHub(${filePath}): SKIP - no repo (repo=${!!repo}, token=${!!repo?.token}, owner=${repo?.owner}, repoName=${repo?.repo})`);
        return null;
      }
      try {
        const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
        const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${encodedPath}?ref=main&t=${Date.now()}`;
        console.log(`[DISCUSS] fetchFileFromGitHub(${filePath}): fetching from ${repo.owner}/${repo.repo}`);
        const ghRes = await fetch(url, {
          headers: {
            Authorization: `token ${repo.token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AI-Dev-Hub",
            ...(isReverification ? { "Cache-Control": "no-cache" } : {}),
          },
        });
        if (!ghRes.ok) {
          console.log(`[DISCUSS] fetchFileFromGitHub(${filePath}): GitHub returned ${ghRes.status} ${ghRes.statusText}`);
          return null;
        }
        const ghData = await ghRes.json();
        if (ghData.encoding === "base64" && ghData.content) {
          const decoded = Buffer.from(ghData.content, "base64").toString("utf-8");
          console.log(`[DISCUSS] fetchFileFromGitHub(${filePath}): SUCCESS - ${decoded.length} chars`);
          return decoded;
        }
        console.log(`[DISCUSS] fetchFileFromGitHub(${filePath}): unexpected encoding=${ghData.encoding}`);
        return ghData.content || null;
      } catch (err: any) {
        console.log(`[DISCUSS] fetchFileFromGitHub(${filePath}): ERROR - ${err.message}`);
        return null;
      }
    }

    if (!repo && bizId) {
      const bizRepos = storage.getRepositoriesWithTokens(bizId);
      console.log(`[DISCUSS] Repo fallback: bizRepos count=${bizRepos.length}`);
      if (bizRepos.length === 1) {
        repo = bizRepos[0];
        console.log(`[DISCUSS] Using single biz repo: ${repo.owner}/${repo.repo}`);
      } else if (bizRepos.length > 1) {
        const project = storage.getProject(bizId, req.params.projectId);
        console.log(`[DISCUSS] Multiple biz repos, project.defaultRepositoryId=${project?.defaultRepositoryId}`);
        if (project?.defaultRepositoryId) {
          repo = bizRepos.find(r => r.id === project.defaultRepositoryId) || null;
        }
        if (!repo) {
          repo = bizRepos[0];
        }
        console.log(`[DISCUSS] Selected fallback repo: ${repo?.owner}/${repo?.repo}`);
      } else {
        console.log(`[DISCUSS] NO repos found for business ${bizId}`);
      }
    }
    console.log(`[DISCUSS] Final repo: ${repo ? `${repo.owner}/${repo.repo}` : 'NONE'}`);

    if (!isAutoAnalysis && task.filePath && repo) {
      console.log(`[DISCUSS] Fetching task.filePath: ${task.filePath}`);
      const content = await fetchFileFromGitHub(task.filePath);
      if (content) {
        const truncated = content.length > 8000 ? content.slice(0, 8000) + "\n\n[File truncated]" : content;
        loadedFiles.push({ path: task.filePath, content: truncated, source: isReverification ? "re-fetched from GitHub main (latest)" : "attached to task" });
        loadedFilePaths.push(task.filePath);
      }
    }

    const previouslyLoaded = new Set<string>();
    if (!isReverification) {
      for (const m of existingMessages) {
        if (m.filesLoaded) {
          for (const f of m.filesLoaded) previouslyLoaded.add(f);
        }
      }
    }

    for (const fp of detectedFiles) {
      if (loadedFilePaths.includes(fp)) continue;
      const content = await fetchFileFromGitHub(fp);
      if (content) {
        const truncated = content.length > 8000 ? content.slice(0, 8000) + "\n\n[File truncated]" : content;
        const source = isReverification ? "re-fetched from GitHub main (latest)" : (isAutoAnalysis ? "auto-detected from task" : "mentioned by user");
        loadedFiles.push({ path: fp, content: truncated, source });
        loadedFilePaths.push(fp);
      }
    }
    console.log(`[DISCUSS] === RESULT === loadedFiles: ${loadedFiles.length}, paths: [${loadedFilePaths.join(', ')}]`);

    if (!isAutoAnalysis) {
      const userMsg = storage.addDiscussionMessage(req.params.projectId, req.params.taskId, {
        sender: "user",
        content: message,
        timestamp: new Date().toISOString(),
        filesLoaded: isReverification ? loadedFilePaths : loadedFilePaths.filter((p) => !previouslyLoaded.has(p) && p !== task.filePath),
        isAutoAnalysis: false,
        isReverification: isReverification && loadedFiles.length > 0,
      });
      if (!userMsg) return res.status(500).json({ message: "Failed to save message" });
    }

    const taskContext = `\nTASK DETAILS:\nID: ${task.id}\nTitle: ${task.title}\nType: ${task.type}\nStatus: ${task.status}\nPriority: ${task.priority}\nDescription: ${task.description}\nReasoning: ${task.reasoning}\nFix Steps: ${task.fixSteps}\n${task.filePath ? `Related File: ${task.filePath}` : ""}`;

    let codeContext = "";
    if (loadedFiles.length > 0) {
      if (isReverification) {
        codeContext = "\n\nCODE CONTEXT (RE-FETCHED LATEST FROM GITHUB MAIN BRANCH):";
        codeContext += "\nIMPORTANT: These files were just re-fetched from GitHub main branch. This is FRESH code that may contain fixes since your last review. Analyze this NEW version, not your memory of the old version.";
      } else {
        codeContext = "\n\nCODE CONTEXT:";
      }
      for (const f of loadedFiles) {
        codeContext += `\n\nFile: ${f.path} (${f.source})\n\`\`\`\n${f.content}\n\`\`\``;
      }
    }

    let codeReviewContext = "";
    const reviews = storage.getCodeReviews(task.id);
    if (reviews.length > 0) {
      const latest = reviews[0];
      let reviewText = latest.review;
      if (reviewText.length > 4000) {
        reviewText = reviewText.slice(0, 4000) + "\n\n[Review truncated for context length]";
      }
      codeReviewContext = `\n\nRECENT CODE REVIEW:\nFile: ${latest.filePath}\nReview Date: ${latest.timestamp}\n${latest.question ? `Question: ${latest.question}\n` : ""}Results:\n${reviewText}`;
    }

    const previousDiscussion = existingMessages
      .map((m) => `${m.sender === "user" ? "User" : "Claude"}: ${m.content}`)
      .join("\n\n");

    let systemPrompt: string;
    let userPrompt: string;

    if (isAutoAnalysis) {
      systemPrompt = `You are a friendly, experienced developer colleague helping review a task in a software project. You have access to the task details and any relevant source code files.

${taskContext}${codeContext}${codeReviewContext}

When responding:
- Be conversational and natural, like a helpful colleague — not a formal auditor
- Lead with the big picture: what's working, what's the main gap
- Your response MUST include one of these exact status lines (the system parses these, so include exactly one):
  - "STATUS: COMPLETE" if the task appears fully implemented
  - "STATUS: INCOMPLETE" if the task has not been implemented
  - "STATUS: PARTIAL" if the task is partially done
  But weave it naturally into your response rather than making it a cold header. For example: "Overall this looks like STATUS: PARTIAL — the core logic is solid but the UI piece still needs work."
- Explain WHY things matter, not just what's missing. Help the user understand the impact.
- Be encouraging about progress that's been made before discussing gaps
- Guide toward the next concrete action — what should they do next?
- Keep it concise but warm. Use markdown for code snippets when helpful, but avoid excessive formatting, checklists, or score blocks
- If no source files were loaded, say so naturally and explain what you based your analysis on`;
      userPrompt = "Take a look at this task and the code (if available). Give me your honest take on where things stand and what needs to happen next.";
    } else {
      systemPrompt = `You are a friendly, experienced developer colleague helping with a specific task in a software project. You have access to the task details, code review results, and any loaded source files.

${taskContext}${codeContext}${codeReviewContext}

When responding in this task discussion:
- Be conversational and natural, like a helpful colleague who genuinely wants to help
- Lead with the main point, not a formal status header
- Explain WHY things matter, not just WHAT is missing
- Guide the user toward the next action they should take
- Be encouraging about progress made before discussing what's left
- Use a friendly tone while staying technically accurate
- Avoid excessive formatting, checklists, and status blocks unless the user specifically asks for a detailed breakdown
- Explain tradeoffs and options when relevant, don't just dictate requirements
- Use markdown for code snippets when helpful, but keep prose natural
- The user can mention file paths in their messages and those files will be automatically loaded for you. If you need to see a file that hasn't been loaded, ask the user to mention it by its full path.

Example of the tone to aim for:
"Good news — the notifications screen is built and working! The only thing left is the tab navigation isn't wired up yet. Once you add the tab to _layout.tsx, users will be able to access it. Want me to generate the fix prompt for that?"`;
      userPrompt = message;
    }

    try {
      const anthropic = new Anthropic({ apiKey });
      const aiMsg = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          ...(previousDiscussion ? [{ role: "user" as const, content: `PREVIOUS DISCUSSION:\n${previousDiscussion}` }, { role: "assistant" as const, content: "I have the context from our previous discussion. How can I help?" }] : []),
          { role: "user", content: userPrompt },
        ],
      });

      const responseText = aiMsg.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      storage.addDiscussionMessage(req.params.projectId, req.params.taskId, {
        sender: "claude",
        content: responseText,
        timestamp: new Date().toISOString(),
        filesLoaded: (isAutoAnalysis || isReverification) ? loadedFilePaths : [],
        isAutoAnalysis: !!isAutoAnalysis,
        isReverification: isReverification && loadedFiles.length > 0,
      });

      if (isAutoAnalysis) {
        let analysisResult: "complete" | "incomplete" | "partial" = "incomplete";
        const upper = responseText.toUpperCase();
        if (upper.includes("STATUS: COMPLETE") || upper.includes("STATUS:COMPLETE")) {
          analysisResult = "complete";
        } else if (upper.includes("STATUS: PARTIAL") || upper.includes("STATUS:PARTIAL")) {
          analysisResult = "partial";
        }
        storage.updateTask(req.params.projectId, req.params.taskId, {
          autoAnalysisComplete: true,
          autoAnalysisResult: analysisResult,
          autoAnalysisTimestamp: new Date().toISOString(),
        } as any, bizId);
      }

      const allMessages = storage.getDiscussion(req.params.projectId, req.params.taskId);
      res.json({ messages: allMessages, filesLoaded: loadedFilePaths });
    } catch (err: any) {
      console.error("[discuss] Error:", err);
      let errorMsg = err.message || "Unknown error";
      let statusCode = 500;
      if (err.status === 429 || errorMsg.includes("rate_limit")) {
        errorMsg = "AI rate limit reached. Please wait a moment and try again.";
        statusCode = 429;
      }
      res.status(statusCode).json({ message: errorMsg });
    }
  });

  app.get("/api/businesses/:bizId/repositories/:repoId/files", async (req, res) => {
    const repo = storage.getRepositoryWithToken(req.params.repoId);
    if (!repo) return res.status(404).json({ message: "Repository not found" });
    if (!repo.token || !repo.owner || !repo.repo) {
      return res.status(400).json({ message: "Repository does not have GitHub configuration" });
    }
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/HEAD?recursive=1`;
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `token ${repo.token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "AI-Dev-Hub",
        },
      });
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 409) return res.status(409).json({ message: "Repository is empty — no files to display yet." });
        if (response.status === 404) return res.status(404).json({ message: "Repository not found. Check owner and repo name." });
        if (response.status === 401) return res.status(401).json({ message: "GitHub token is invalid or expired." });
        return res.status(response.status).json({ message: `GitHub API error: ${text}` });
      }
      const data = await response.json();
      const files = (data.tree || []).map((item: any) => ({
        path: item.path,
        type: item.type,
        sha: item.sha,
        size: item.size,
      }));
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: `Failed to fetch files: ${err.message}` });
    }
  });

  app.get("/api/businesses/:bizId/repositories/:repoId/files/content", async (req, res) => {
    const repo = storage.getRepositoryWithToken(req.params.repoId);
    if (!repo) return res.status(404).json({ message: "Repository not found" });
    if (!repo.token || !repo.owner || !repo.repo) {
      return res.status(400).json({ message: "Repository does not have GitHub configuration" });
    }
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ message: "path query parameter is required" });
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${filePath}`,
        {
          headers: {
            Authorization: `token ${repo.token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AI-Dev-Hub",
          },
        }
      );
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ message: `GitHub API error: ${text}` });
      }
      const data = await response.json();
      let content = "";
      if (data.encoding === "base64" && data.content) {
        content = Buffer.from(data.content, "base64").toString("utf-8");
      } else {
        content = data.content || "";
      }
      res.json({ content, encoding: "utf-8", name: data.name, path: data.path, size: data.size });
    } catch (err: any) {
      res.status(500).json({ message: `Failed to fetch file: ${err.message}` });
    }
  });

  app.get("/api/businesses/:bizId/changelog", (req, res) => {
    res.json(storage.getChangelog(req.params.bizId));
  });

  app.get("/api/businesses/:bizId/inbox", (req, res) => {
    res.json(storage.getInboxItems(req.params.bizId));
  });

  app.post("/api/businesses/:bizId/inbox", (req, res) => {
    try {
      const { title, type, priority, description, source, notes } = req.body;
      if (!title) return res.status(400).json({ message: "title is required" });
      const item = storage.addInboxItem(req.params.bizId, {
        title,
        type: type || "Idea",
        priority: priority || "Medium",
        description: description || "",
        source: source || "Customer",
        notes: notes || "",
      });
      res.status(201).json(item);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put("/api/businesses/:bizId/inbox/:itemId", (req, res) => {
    const updated = storage.updateInboxItem(req.params.bizId, req.params.itemId, req.body);
    if (!updated) return res.status(404).json({ message: "Inbox item not found" });
    res.json(updated);
  });

  app.delete("/api/businesses/:bizId/inbox/:itemId", (req, res) => {
    const deleted = storage.deleteInboxItem(req.params.bizId, req.params.itemId);
    if (!deleted) return res.status(404).json({ message: "Inbox item not found" });
    res.json({ success: true });
  });

  app.post("/api/businesses/:bizId/inbox/:itemId/assign", (req, res) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ message: "projectId is required" });
    const result = storage.assignInboxItem(req.params.bizId, req.params.itemId, projectId);
    if (!result) return res.status(404).json({ message: "Inbox item or project not found" });
    res.json(result);
  });

  app.post("/api/businesses/:bizId/inbox/process-transcript", async (req, res) => {
    const biz = storage.getBusiness(req.params.bizId);
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const reviewAgent = storage.getReviewAgent(req.params.bizId);
    const apiKey = reviewAgent?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "No AI agent configured and ANTHROPIC_API_KEY is not set. Add an agent in Settings or set ANTHROPIC_API_KEY in Replit Secrets." });
    }

    const { transcript, meetingTitle, meetingDate } = req.body;
    if (!transcript) return res.status(400).json({ message: "transcript is required" });

    const existingProjects = storage.getProjects(req.params.bizId);
    const projectNames = existingProjects.map((p) => p.name).join(", ");

    try {
      const systemPrompt = `You are analyzing a meeting transcript for a software company. Extract all actionable items mentioned — bugs, feature requests, ideas, improvements, action items. For each item return a JSON object with two fields:
"items": an array where each element has: title (short, clear), type (Bug / Feature / Idea / Improvement), priority (High / Medium / Low), description (1-2 sentences of context), quote (the exact phrase from the transcript that triggered this), suggestedProject (string or null — if the item clearly belongs to a topic not covered by any existing project, suggest a new project name; otherwise null).
"suggestedProjects": an array of objects with: name (short project name), reason (why this project should exist) — only include projects that were suggested above and don't already exist.
Existing projects: ${projectNames || "none"}.
Return only valid JSON with "items" and "suggestedProjects" fields, nothing else.`;

      const userPrompt = `Meeting: ${meetingTitle || "Untitled"}\nDate: ${meetingDate || "Not specified"}\n\nTranscript:\n${transcript}`;

      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      });

      const responseText = msg.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/) || responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(500).json({ message: "Failed to parse Claude response as JSON" });
        }
      }

      let items: any[];
      let suggestedProjects: any[] = [];
      if (Array.isArray(parsed)) {
        items = parsed;
      } else {
        items = parsed.items || [];
        suggestedProjects = parsed.suggestedProjects || [];
      }

      res.json({ items, suggestedProjects });
    } catch (err: any) {
      console.error("[process-transcript] Error:", err);
      res.status(500).json({ message: `Transcript processing failed: ${err.message}` });
    }
  });

  app.post("/api/claude/review", async (req, res) => {
    const { businessId, repositoryId, filePath, taskId, question } = req.body;
    if (!repositoryId || !filePath) {
      return res.status(400).json({ message: "repositoryId and filePath are required" });
    }

    const repo = storage.getRepositoryWithToken(repositoryId);
    if (!repo) return res.status(404).json({ message: "Repository not found" });
    if (!repo.token || !repo.owner || !repo.repo) {
      return res.status(400).json({ message: "Repository does not have GitHub configuration" });
    }

    const bizId = businessId || repo.businessId;
    const reviewAgent = storage.getReviewAgent(bizId);
    const apiKey = reviewAgent?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "No AI agent configured and ANTHROPIC_API_KEY is not set." });
    }

    try {
      const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
      const ghRes = await fetch(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${encodedPath}`,
        {
          headers: {
            Authorization: `token ${repo.token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AI-Dev-Hub",
          },
        }
      );
      if (!ghRes.ok) {
        const text = await ghRes.text();
        return res.status(ghRes.status).json({ message: `Failed to fetch file from GitHub: ${text}` });
      }
      const ghData = await ghRes.json();
      let fileContentStr = "";
      if (ghData.encoding === "base64" && ghData.content) {
        fileContentStr = Buffer.from(ghData.content, "base64").toString("utf-8");
      } else {
        fileContentStr = ghData.content || "";
      }
      if (fileContentStr.length > 500000) {
        return res.status(400).json({ message: "File is too large for review (max 500KB)" });
      }

      let taskContext = "";
      if (taskId) {
        const projects = storage.getProjects(bizId);
        for (const p of projects) {
          const task = storage.getTask(p.id, taskId);
          if (task) {
            taskContext = `\n\nRelated Task: ${task.id} - ${task.title}\nType: ${task.type} | Status: ${task.status} | Priority: ${task.priority}\nDescription: ${task.description}\nFix Steps: ${task.fixSteps}`;
            break;
          }
        }
      }

      const systemPrompt = `You are a senior software engineer reviewing code. Be concise, specific, and actionable. Focus on bugs, security issues, and architectural problems. When a specific task is provided, focus your review on whether that issue has been properly fixed.`;

      let userPrompt = `Review this file: ${filePath}\n\n\`\`\`\n${fileContentStr}\n\`\`\``;
      if (taskContext) userPrompt += taskContext;
      if (question) userPrompt += `\n\nSpecific question: ${question}`;

      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      });

      const reviewText = msg.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n\n");

      if (taskId) {
        const projects = storage.getProjects(bizId);
        let foundProjectId = "";
        for (const p of projects) {
          const t = storage.getTask(p.id, taskId);
          if (t) { foundProjectId = p.id; break; }
        }
        if (foundProjectId) {
          storage.addCodeReview({
            taskId,
            projectId: foundProjectId,
            repositoryId,
            filePath,
            review: reviewText,
            question: question || "",
            timestamp: new Date().toISOString(),
          });
        }
      }

      res.json({ review: reviewText });
    } catch (err: any) {
      console.error("[claude/review] Error:", err);
      res.status(500).json({ message: `Claude review failed: ${err.message}` });
    }
  });

  app.post("/api/claude/extract-tasks", async (req, res) => {
    const { businessId, reviewText } = req.body;
    if (!businessId || !reviewText) {
      return res.status(400).json({ message: "businessId and reviewText are required" });
    }

    const biz = storage.getBusiness(businessId);
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const reviewAgent = storage.getReviewAgent(businessId);
    const apiKey = reviewAgent?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "No AI agent configured and ANTHROPIC_API_KEY is not set." });
    }

    try {
      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `Extract all actionable items from this code review as a JSON array. Each item should have: title (short, clear action statement), type (one of "Bug", "Feature", or "Task"), priority (one of "High", "Medium", or "Low"), description (the issue found), reasoning (why it's a problem), fixSteps (numbered steps to fix it as a single string). Return only valid JSON array, no markdown fences or other text.\n\nCode Review:\n${reviewText}`,
        }],
        system: "You are a task extraction assistant. Analyze code reviews and extract actionable items as structured JSON. Return only a valid JSON array with no additional text, no markdown code fences, no explanation.",
      });

      const rawText = msg.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      let cleanText = rawText.trim();
      const fenceMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        cleanText = fenceMatch[1].trim();
      }

      const tasks = JSON.parse(cleanText);
      if (!Array.isArray(tasks)) {
        return res.status(500).json({ message: "AI did not return a valid task array" });
      }

      const validTypes = ["Bug", "Feature", "Task"];
      const validPriorities = ["High", "Medium", "Low"];
      const sanitized = tasks.map((t: any) => ({
        title: String(t.title || "Untitled task"),
        type: validTypes.includes(t.type) ? t.type : "Task",
        priority: validPriorities.includes(t.priority) ? t.priority : "Medium",
        description: String(t.description || ""),
        reasoning: String(t.reasoning || ""),
        fixSteps: String(t.fixSteps || ""),
      }));

      res.json({ tasks: sanitized });
    } catch (err: any) {
      console.error("[claude/extract-tasks] Error:", err);
      res.status(500).json({ message: `Task extraction failed: ${err.message}` });
    }
  });

  app.post("/api/claude/detect-files", async (req, res) => {
    const { repositoryId, businessId, taskTitle, taskDescription, taskFixSteps } = req.body;
    if (!repositoryId || !taskTitle) {
      return res.status(400).json({ message: "repositoryId and taskTitle are required" });
    }

    const repo = storage.getRepositoryWithToken(repositoryId);
    if (!repo) return res.status(404).json({ message: "Repository not found" });
    if (!repo.token || !repo.owner || !repo.repo) {
      return res.status(400).json({ message: "Repository does not have GitHub configuration" });
    }

    const bizId = businessId || repo.businessId;
    const reviewAgent = storage.getReviewAgent(bizId);
    const apiKey = reviewAgent?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "No AI agent configured and ANTHROPIC_API_KEY is not set." });
    }

    try {
      const ghRes = await fetch(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/main?recursive=1`,
        {
          headers: {
            Authorization: `token ${repo.token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "AI-Dev-Hub",
          },
        }
      );

      let fileList: string[] = [];
      if (ghRes.ok) {
        const treeData = await ghRes.json();
        fileList = (treeData.tree || [])
          .filter((f: any) => f.type === "blob")
          .map((f: any) => f.path)
          .filter((p: string) => !p.includes("node_modules") && !p.includes(".git/") && !p.startsWith("dist/"));
      }

      const taskContext = [
        `Title: ${taskTitle}`,
        taskDescription ? `Description: ${taskDescription}` : "",
        taskFixSteps ? `Fix Steps: ${taskFixSteps}` : "",
      ].filter(Boolean).join("\n");

      const anthropic = new Anthropic({ apiKey });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `Given this task and the list of files in the repository, which files most likely need to be reviewed to address this task? Return a JSON object with: "files" (array of file paths, most relevant first, max 5), "question" (a focused review question based on the task).

Task:
${taskContext}

Repository files:
${fileList.join("\n")}`,
        }],
        system: "You are a code review assistant. Analyze the task and return ONLY valid JSON with 'files' (array of file paths) and 'question' (string). No markdown, no explanation.",
      });

      const rawText = msg.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return res.status(500).json({ message: "Failed to parse AI response" });
        }
      }

      res.json({
        files: Array.isArray(parsed.files) ? parsed.files : [],
        question: parsed.question || `Focus on: ${taskTitle}`,
      });
    } catch (err: any) {
      console.error("[claude/detect-files] Error:", err);
      res.status(500).json({ message: `File detection failed: ${err.message}` });
    }
  });

  app.get("/api/businesses/:bizId/manager", (req, res) => {
    const bizId = req.params.bizId;
    const biz = storage.getBusiness(bizId);
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const messages = storage.getManagerDiscussion(bizId);
    const allProjectData = storage.getAllTasksForBusiness(bizId);
    const inboxItems = storage.getInboxItems(bizId);
    const changelog = storage.getChangelog(bizId);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalOpen = 0, totalInProgress = 0, totalDone = 0, totalBlocked = 0;
    let completedThisWeek = 0;

    const allTasks: (import("@shared/schema").Task & { projectName: string })[] = [];

    for (const { project, tasks } of allProjectData) {
      for (const t of tasks) {
        allTasks.push({ ...t, projectName: project.name });
        if (t.status === "Open") totalOpen++;
        if (t.status === "In Progress") {
          totalInProgress++;
          const lastActivity = t.discussion?.length
            ? new Date(t.discussion[t.discussion.length - 1].timestamp)
            : null;
          const statusChange = changelog.filter(c => c.taskId === t.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
          const lastChange = statusChange ? new Date(statusChange.timestamp) : null;
          const lastDate = lastActivity && lastChange ? (lastActivity > lastChange ? lastActivity : lastChange) : (lastActivity || lastChange);
          if (!lastDate || lastDate < sevenDaysAgo) totalBlocked++;
        }
        if (t.status === "Done") {
          totalDone++;
          const doneEntry = changelog.filter(c => c.taskId === t.id && c.toStatus === "Done").sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
          if (doneEntry && new Date(doneEntry.timestamp) >= oneWeekAgo) completedThisWeek++;
        }
      }
    }

    const pendingInbox = inboxItems.filter(i => i.status === "New" || i.status === "Reviewed").length;

    const alerts: import("@shared/schema").ManagerAlert[] = [];
    let alertId = 0;

    for (const t of allTasks) {
      if (t.type === "Bug" && t.status !== "Done") {
        const created = changelog.filter(c => c.taskId === t.id).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
        if (created && new Date(created.timestamp) < threeDaysAgo) {
          alerts.push({ id: `alert-${alertId++}`, severity: "critical", title: `Bug open for 3+ days`, description: `${t.id}: ${t.title} (${t.projectName})`, relatedTaskId: t.id });
        }
      }
      if (t.status === "In Progress") {
        const lastActivity = t.discussion?.length ? new Date(t.discussion[t.discussion.length - 1].timestamp) : null;
        const statusChange = changelog.filter(c => c.taskId === t.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        const lastChange = statusChange ? new Date(statusChange.timestamp) : null;
        const lastDate = lastActivity && lastChange ? (lastActivity > lastChange ? lastActivity : lastChange) : (lastActivity || lastChange);
        if (!lastDate || lastDate < sevenDaysAgo) {
          alerts.push({ id: `alert-${alertId++}`, severity: "warning", title: `Stalled task (7+ days)`, description: `${t.id}: ${t.title} (${t.projectName})`, relatedTaskId: t.id });
        }
      }
    }

    if (pendingInbox > 10) {
      alerts.push({ id: `alert-${alertId++}`, severity: "critical", title: `Inbox overloaded`, description: `${pendingInbox} items pending review` });
    } else if (pendingInbox > 5) {
      alerts.push({ id: `alert-${alertId++}`, severity: "warning", title: `Inbox needs attention`, description: `${pendingInbox} items pending review` });
    }

    for (const { project, tasks } of allProjectData) {
      const total = tasks.length;
      if (total === 0) continue;
      const done = tasks.filter(t => t.status === "Done").length;
      const pct = Math.round((done / total) * 100);
      if (pct === 50) {
        alerts.push({ id: `alert-${alertId++}`, severity: "info", title: `Milestone: 50% complete`, description: `${project.name}: ${done}/${total} tasks done`, relatedProjectId: project.id });
      }
      if (pct === 100) {
        alerts.push({ id: `alert-${alertId++}`, severity: "info", title: `Project complete`, description: `${project.name}: all ${total} tasks done`, relatedProjectId: project.id });
      }
    }

    const projectStats = allProjectData.map(({ project, tasks }) => {
      const total = tasks.length;
      const done = tasks.filter(t => t.status === "Done").length;
      return { id: project.id, name: project.name, color: project.color, total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    });

    const recentActivity = changelog.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);

    const totalTasks = allTasks.length;
    const healthScore = totalTasks > 0
      ? Math.max(0, Math.min(100, Math.round(
          ((totalDone / totalTasks) * 40) +
          ((1 - Math.min(totalBlocked / Math.max(totalInProgress, 1), 1)) * 30) +
          ((1 - Math.min(pendingInbox / 10, 1)) * 15) +
          (completedThisWeek > 0 ? 15 : 0)
        )))
      : 50;

    res.json({
      messages,
      alerts,
      stats: { totalOpen, totalInProgress, totalDone, totalBlocked, completedThisWeek, pendingInbox, healthScore },
      projectStats,
      recentActivity,
    });
  });

  app.post("/api/businesses/:bizId/manager/chat", async (req, res) => {
    const bizId = req.params.bizId;
    const { message, mode, attachments: uploadedAttachments } = req.body;
    const chatMode = mode || "chat";
    const maxAttachmentSize = 100000;
    const maxAttachments = 10;
    const rawAttachments: { name: string; content: string; type: string }[] = Array.isArray(uploadedAttachments) ? uploadedAttachments : [];
    const attachments = rawAttachments.slice(0, maxAttachments).map(a => ({
      name: String(a.name || "unnamed").slice(0, 255),
      content: String(a.content || "").slice(0, maxAttachmentSize),
      type: String(a.type || "text/plain").slice(0, 100),
    }));

    const biz = storage.getBusiness(bizId);
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const reviewAgent = storage.getReviewAgent(bizId);
    const apiKey = reviewAgent?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "No AI agent configured and ANTHROPIC_API_KEY is not set." });
    }

    const allProjectData = storage.getAllTasksForBusiness(bizId);
    const inboxItems = storage.getInboxItems(bizId);
    const changelog = storage.getChangelog(bizId);
    const repos = storage.getRepositories(bizId);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let contextParts: string[] = [];
    contextParts.push(`BUSINESS CONTEXT:\nBusiness: ${biz.name}\nDescription: ${biz.description}\nDate: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);

    let projectOverview: string[] = [];
    for (const { project, tasks } of allProjectData) {
      const open = tasks.filter(t => t.status === "Open").length;
      const inProg = tasks.filter(t => t.status === "In Progress").length;
      const done = tasks.filter(t => t.status === "Done").length;
      const qr = tasks.filter(t => t.status === "Quality Review").length;
      projectOverview.push(`- ${project.name}: ${open} open, ${inProg} in progress, ${qr} quality review, ${done} done (${tasks.length} total)`);
    }
    contextParts.push(`\nPROJECTS OVERVIEW:\n${projectOverview.join("\n")}`);

    const allOpenHigh: string[] = [];
    const allInProgress: string[] = [];
    const allBlocked: string[] = [];
    const allTasks: string[] = [];

    for (const { project, tasks } of allProjectData) {
      for (const t of tasks) {
        const age = Math.floor((now.getTime() - new Date(changelog.filter(c => c.taskId === t.id).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]?.timestamp || now.toISOString()).getTime()) / (1000 * 60 * 60 * 24));
        const line = `- ${t.id}: ${t.title} (${project.name}) [${t.type}/${t.priority}] - ${age} days old`;
        if (t.status === "Open" && t.priority === "High") allOpenHigh.push(line);
        if (t.status === "In Progress") {
          allInProgress.push(line);
          const lastDiscussion = t.discussion?.length ? new Date(t.discussion[t.discussion.length - 1].timestamp) : null;
          const lastStatusChange = changelog.filter(c => c.taskId === t.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
          const lastChange = lastStatusChange ? new Date(lastStatusChange.timestamp) : null;
          const lastDate = lastDiscussion && lastChange ? (lastDiscussion > lastChange ? lastDiscussion : lastChange) : (lastDiscussion || lastChange);
          if (!lastDate || lastDate < sevenDaysAgo) allBlocked.push(line);
        }
        if (t.status !== "Done") allTasks.push(line);
      }
    }

    if (allOpenHigh.length > 0) contextParts.push(`\nOPEN HIGH PRIORITY TASKS:\n${allOpenHigh.join("\n")}`);
    if (allInProgress.length > 0) contextParts.push(`\nIN PROGRESS TASKS:\n${allInProgress.join("\n")}`);
    if (allBlocked.length > 0) contextParts.push(`\nBLOCKED TASKS (no activity in 7+ days):\n${allBlocked.join("\n")}`);

    const pendingInbox = inboxItems.filter(i => i.status === "New" || i.status === "Reviewed");
    if (pendingInbox.length > 0) {
      const inboxLines = pendingInbox.map(i => `- [${i.type}/${i.priority}] ${i.title}: ${i.description.slice(0, 100)}`);
      contextParts.push(`\nINBOX ITEMS PENDING (${pendingInbox.length}):\n${inboxLines.join("\n")}`);
    }

    const recentChanges = changelog.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);
    if (recentChanges.length > 0) {
      const changeLines = recentChanges.map(c => `- ${c.taskTitle}: ${c.fromStatus} → ${c.toStatus} (${new Date(c.timestamp).toLocaleDateString()})`);
      contextParts.push(`\nRECENT ACTIVITY:\n${changeLines.join("\n")}`);
    }

    const completedThisWeek = changelog.filter(c => c.toStatus === "Done" && new Date(c.timestamp) >= oneWeekAgo);
    const lastWeek = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const completedLastWeek = changelog.filter(c => c.toStatus === "Done" && new Date(c.timestamp) >= lastWeek && new Date(c.timestamp) < oneWeekAgo);
    contextParts.push(`\nVELOCITY:\nCompleted this week: ${completedThisWeek.length}\nCompleted last week: ${completedLastWeek.length}\nTrend: ${completedThisWeek.length > completedLastWeek.length ? "Improving" : completedThisWeek.length < completedLastWeek.length ? "Declining" : "Stable"}`);

    if (repos.length > 0) {
      contextParts.push(`\nREPOSITORIES:\n${repos.map(r => `- ${r.name} (${r.type}): ${r.repoUrl || "no URL"}`).join("\n")}`);
    }

    const reposWithTokens = storage.getRepositoriesWithTokens(bizId);
    const configuredRepos = reposWithTokens.filter(r => r.owner && r.repo && r.token);

    const scanRepos = req.body.scanRepos === true;
    const requestedFiles: string[] = Array.isArray(req.body.fetchFiles) ? req.body.fetchFiles : [];

    if (scanRepos || configuredRepos.length > 0) {
      const treeResults = await Promise.all(configuredRepos.map(r => fetchRepoTopLevelTree(r)));
      const commitResults = await Promise.all(configuredRepos.map(r => fetchRepoRecentCommits(r)));

      for (const tree of treeResults) {
        if (tree && tree.tree.length > 0) {
          contextParts.push(`\nREPOSITORY FILE STRUCTURE - ${tree.name} (${tree.repoId}):\n${tree.tree.join("\n")}`);
        }
      }

      for (const commits of commitResults) {
        if (commits && commits.commits.length > 0) {
          contextParts.push(`\nRECENT COMMITS - ${commits.name}:\n${commits.commits.join("\n")}`);
        }
      }
    }

    const fileContents: { path: string; repoName: string; content: string }[] = [];

    async function fetchFileAcrossRepos(fp: string, contextHint: string): Promise<boolean> {
      if (fileContents.some(f => f.path === fp)) return true;
      const matched = matchFileToRepo(fp, configuredRepos, contextHint);
      const tryOrder = matched
        ? [matched, ...configuredRepos.filter(r => r.id !== matched.id)]
        : configuredRepos;
      for (const repo of tryOrder) {
        const content = await fetchFileFromRepo(repo, fp);
        if (content) {
          const truncated = content.length > 10000 ? content.slice(0, 10000) + "\n... (truncated)" : content;
          fileContents.push({ path: fp, repoName: repo.name, content: truncated });
          return true;
        }
      }
      return false;
    }

    if (requestedFiles.length > 0) {
      for (const fp of requestedFiles) {
        await fetchFileAcrossRepos(fp, message || "");
      }
    }

    if (message && typeof message === "string") {
      const userDetectedPaths = detectFilePathsInText(message);
      for (const fp of userDetectedPaths.slice(0, 8)) {
        await fetchFileAcrossRepos(fp, message);
      }
    }

    const existingMsgs = storage.getManagerDiscussion(bizId);
    const lastManagerMsg = [...existingMsgs].reverse().find(m => m.sender === "manager");
    if (lastManagerMsg) {
      const detectedPaths = detectFilePathsInText(lastManagerMsg.content);
      for (const fp of detectedPaths.slice(0, 5)) {
        await fetchFileAcrossRepos(fp, message || "");
      }
    }

    if (fileContents.length > 0) {
      const fileSection = fileContents.map(f => `--- ${f.path} (from ${f.repoName}) ---\n${f.content}`).join("\n\n");
      contextParts.push(`\nFETCHED FILE CONTENTS:\n${fileSection}`);
    }

    const textAttachments = attachments.filter(a => !a.type.startsWith("image/"));
    const imageAttachments = attachments.filter(a => a.type.startsWith("image/"));

    if (textAttachments.length > 0) {
      const attachSection = textAttachments.map(a => `--- UPLOADED: ${a.name} (${a.type}) ---\n${a.content}`).join("\n\n");
      contextParts.push(`\nUSER UPLOADED FILES:\n${attachSection}`);
    }

    if (imageAttachments.length > 0) {
      contextParts.push(`\nUSER UPLOADED IMAGES: ${imageAttachments.map(a => a.name).join(", ")} (included as image content for visual analysis)`);
    }

    const fullContext = contextParts.join("\n");

    let systemPrompt: string;
    let userPrompt: string;

    const actionInstructions = `\n\nACTIONS: When you identify actionable items, you can propose actions by appending them at the END of your response using this exact format. You may include multiple actions in one response.

ACTION:CREATE_INBOX_ITEM
{"title":"...","type":"Bug|Feature|Idea|Improvement","priority":"High|Medium|Low","source":"AI Manager","description":"...","notes":""}

ACTION:CREATE_TASK
{"projectId":"P1","projectName":"Project Name","title":"...","type":"Bug|Task|Feature","priority":"High|Medium|Low","description":"...","reasoning":"...","fixSteps":"1. ...","replitPrompt":""}

ACTION:UPDATE_TASK_STATUS
{"taskId":"TASK-001","taskTitle":"...","newStatus":"In Progress|Quality Review|Done","reason":"..."}

ACTION:CREATE_PROJECT
{"name":"...","description":"...","color":"#58a6ff"}

ACTION:BULK_UPDATE_REPOSITORY
{"projectId":"P1","projectName":"Project Name","repositoryId":"R1","repositoryName":"Repo Name","onlyUnlinked":true}

ACTION:MOVE_TASK
{"taskId":"TASK-001","taskTitle":"...","fromProjectId":"P1","fromProjectName":"Source Project","toProjectId":"P2","toProjectName":"Target Project","reason":"..."}

RULES:
- Only propose actions when you have clear justification
- Always explain WHY before proposing an action
- Never create duplicates - check existing tasks and inbox items first
- You may propose multiple actions in one response
- Use ONLY real project IDs from the AVAILABLE PROJECTS list below (e.g. P1, P2, etc.)
- For UPDATE_TASK_STATUS, use ONLY actual task IDs that appear in the context above (e.g. ARCH-001, MOB-001, BUG-001, etc.). NEVER invent or guess task IDs.
- If you cannot find the exact task ID for a status update, do NOT propose the action
- For BULK_UPDATE_REPOSITORY, use ONLY real project IDs and repository IDs from the AVAILABLE lists below. This action links all unlinked tasks in a project to a specified repository.
- For MOVE_TASK, use ONLY actual task IDs and real project IDs from the AVAILABLE lists. Include fromProjectId (the task's current project) and toProjectId (the destination project). Always provide the reason for moving.`;

    const projectList = allProjectData.map(p => `  ${p.project.id}: ${p.project.name}${p.project.defaultRepositoryId ? ` (default repo: ${p.project.defaultRepositoryId})` : ""}`).join("\n");
    const repoList = storage.getRepositories(bizId).map(r => `  ${r.id}: ${r.name} (${r.type})`).join("\n");
    const projectRef = `\n\nAVAILABLE PROJECTS:\n${projectList}\n\nAVAILABLE REPOSITORIES:\n${repoList || "  (none)"}`;

    if (chatMode === "briefing") {
      systemPrompt = `You are the AI Business Manager for ${biz.name}. Generate a daily briefing. Use markdown formatting. Structure as:\n\n# Daily Briefing - ${biz.name} - ${now.toLocaleDateString()}\n\n## Yesterday\nList completed tasks with checkmarks\n\n## Today's Priorities\nNumbered list ranked by urgency with severity indicators\n\n## Blockers\nList any or "None currently"\n\n## Inbox\nCount of pending items\n\n## This Week's Goal\nBrief strategic recommendation\n\nAfter the briefing, if you identify urgent items that need action, propose them.${actionInstructions}${projectRef}\n\n${fullContext}`;
      userPrompt = "Generate my daily briefing.";
    } else if (chatMode === "weekly") {
      systemPrompt = `You are the AI Business Manager for ${biz.name}. Generate a weekly report. Use markdown formatting. Structure as:\n\n# Weekly Report - ${now.toLocaleDateString()}\n\n## Velocity\nTasks completed and trend\n\n## Completed This Week\nList with checkmarks\n\n## Still Open\nList with status\n\n## Trends\nKey observations\n\n## Recommendation for Next Week\nStrategic focus areas\n\nAfter the report, if you identify items that need action, propose them.${actionInstructions}${projectRef}\n\n${fullContext}`;
      userPrompt = "Generate my weekly report.";
    } else {
      const fileAccessInfo = configuredRepos.length > 0
        ? `\n\nFILE ACCESS: You have direct access to read files from all connected GitHub repositories. When the user mentions file paths in their message, the system AUTOMATICALLY fetches and includes the file contents in your context (shown under FETCHED FILE CONTENTS below). You do NOT need to ask the user to provide file contents — they are already loaded for you. Simply reference and analyze them directly.\n\nIf no file contents appear but you need to see a specific file, mention its exact path (e.g. \`app/(tabs)/index.tsx\`) and the system will fetch it for the next response. To see repository structure and recent commits, ask the user to click "Scan Repositories".\n\nWhen auditing or analyzing a project, proactively reference file paths you want to review — the system will auto-fetch them.`
        : "";
      systemPrompt = `You are the AI Business Manager for ${biz.name}. You have complete visibility into all projects, tasks, code, and activity for this business. Your role is to:\n- Help prioritize work based on business impact and urgency\n- Identify blockers and risks before they become problems\n- Suggest what to work on next\n- Generate status reports and summaries\n- Connect dots between different projects and tasks\n- Flag when tasks have been stuck too long\n- Identify dependencies between tasks\n- Take action by creating tasks, inbox items, or updating task statuses when asked\n- Review code and file structure from connected repositories\n\nBe proactive, concise, and actionable. Always explain your reasoning. When suggesting priorities, consider: production impact, dependencies, team velocity, and business goals.\n\nYou have memory of this conversation. Reference previous messages when relevant.${fileAccessInfo}${actionInstructions}${projectRef}\n\n${fullContext}`;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "message is required" });
      }
      userPrompt = message;
    }

    if (chatMode === "chat") {
      storage.addManagerMessage(bizId, {
        sender: "user",
        content: message,
        timestamp: new Date().toISOString(),
        mode: "chat",
        actions: [],
        filesLoaded: [],
        attachments: attachments.map(a => ({ name: a.name, content: "", type: a.type })),
      });
    }

    const existingMessages = storage.getManagerDiscussion(bizId);
    const previousConversation = existingMessages
      .slice(-20)
      .map(m => `${m.sender === "user" ? "User" : "Manager"}: ${m.content}`)
      .join("\n\n");

    try {
      const maxTokens = fileContents.length > 0 || imageAttachments.length > 0 ? 4096 : 3000;
      const anthropic = new Anthropic({ apiKey });

      const userContent: any[] = [{ type: "text", text: userPrompt }];
      for (const img of imageAttachments) {
        const mediaType = img.type as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
        if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(img.type)) {
          userContent.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: img.content },
          });
        }
      }

      const aiMsg = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          ...(previousConversation && chatMode === "chat" ? [
            { role: "user" as const, content: `PREVIOUS CONVERSATION:\n${previousConversation}` },
            { role: "assistant" as const, content: "I have context from our previous conversation. How can I help?" },
          ] : []),
          { role: "user" as const, content: userContent },
        ],
      });

      const responseText = aiMsg.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const actionRegex = /ACTION:(CREATE_INBOX_ITEM|CREATE_TASK|UPDATE_TASK_STATUS|CREATE_PROJECT|BULK_UPDATE_REPOSITORY|MOVE_TASK)\s*\n\s*(\{[\s\S]*?\})/g;
      const actions: ManagerAction[] = [];
      let match;
      while ((match = actionRegex.exec(responseText)) !== null) {
        try {
          const parsed = JSON.parse(match[2]);
          actions.push({ type: match[1] as ManagerAction["type"], data: parsed, status: "pending" });
        } catch {}
      }

      const cleanContent = responseText.replace(/ACTION:(CREATE_INBOX_ITEM|CREATE_TASK|UPDATE_TASK_STATUS|CREATE_PROJECT|BULK_UPDATE_REPOSITORY|MOVE_TASK)\s*\n\s*\{[\s\S]*?\}/g, "").trim();

      const filesLoaded = fileContents.map(f => ({ path: f.path, repo: f.repoName }));

      const managerMsg = storage.addManagerMessage(bizId, {
        sender: "manager",
        content: cleanContent,
        timestamp: new Date().toISOString(),
        mode: chatMode,
        actions,
        filesLoaded,
        attachments: [],
      });

      const allMessages = storage.getManagerDiscussion(bizId);
      res.json({ messages: allMessages, response: cleanContent, filesLoaded });
    } catch (err: any) {
      console.error("[manager/chat] Error:", err);
      let errorMsg = err.message || "Unknown error";
      let statusCode = 500;
      if (err.status === 429 || errorMsg.includes("rate_limit")) {
        errorMsg = "AI rate limit reached. Please wait a moment and try again.";
        statusCode = 429;
      }
      res.status(statusCode).json({ message: errorMsg });
    }
  });

  app.post("/api/businesses/:bizId/manager/scan-repos", async (req, res) => {
    const bizId = req.params.bizId;
    const biz = storage.getBusiness(bizId);
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const reposWithTokens = storage.getRepositoriesWithTokens(bizId);
    const configuredRepos = reposWithTokens.filter(r => r.owner && r.repo && r.token);

    if (configuredRepos.length === 0) {
      return res.json({ repositories: [], message: "No configured repositories found" });
    }

    const [treeResults, commitResults] = await Promise.all([
      Promise.all(configuredRepos.map(r => fetchRepoTopLevelTree(r))),
      Promise.all(configuredRepos.map(r => fetchRepoRecentCommits(r))),
    ]);

    const repositories = configuredRepos.map((repo, i) => ({
      id: repo.id,
      name: repo.name,
      owner: repo.owner,
      repo: repo.repo,
      type: repo.type,
      tree: treeResults[i]?.tree || [],
      commits: commitResults[i]?.commits || [],
    }));

    res.json({ repositories });
  });

  app.post("/api/businesses/:bizId/manager/execute-action", (req, res) => {
    const bizId = req.params.bizId;
    const biz = storage.getBusiness(bizId);
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const { actionType, data, messageId, actionIndex } = req.body;

    if (!actionType || !data) {
      return res.status(400).json({ message: "actionType and data are required" });
    }

    if (messageId !== undefined && actionIndex !== undefined) {
      const msgs = storage.getManagerDiscussion(bizId);
      const msg = msgs.find(m => m.id === messageId);
      if (msg && msg.actions && msg.actions[actionIndex]) {
        if (msg.actions[actionIndex].status !== "pending") {
          return res.status(409).json({ message: `Action already ${msg.actions[actionIndex].status}` });
        }
      }
    }

    try {
      let result: any = null;

      switch (actionType) {
        case "CREATE_INBOX_ITEM": {
          if (!data.title) return res.status(400).json({ message: "title is required for inbox item" });
          const item = storage.addInboxItem(bizId, {
            title: data.title || "Untitled",
            type: data.type || "Bug",
            priority: data.priority || "Medium",
            source: (data.source === "AI Manager" || data.source === "Internal") ? "Internal" : (data.source || "Other") as any,
            description: data.description || "",
            notes: data.notes || "Created by AI Manager",
          });
          result = { type: "inbox", item };
          break;
        }
        case "CREATE_TASK": {
          if (!data.projectId) return res.status(400).json({ message: "projectId is required for creating a task" });
          if (!data.title) return res.status(400).json({ message: "title is required for creating a task" });
          const projectId = data.projectId;
          const project = storage.getProject(bizId, projectId);
          if (!project) return res.status(400).json({ message: `Project ${projectId} not found` });
          const task = storage.createTask(projectId, {
            type: data.type || "Task",
            status: "Open",
            priority: data.priority || "Medium",
            title: data.title || "Untitled Task",
            description: data.description || "",
            reasoning: data.reasoning || "",
            fixSteps: data.fixSteps || "",
            replitPrompt: data.replitPrompt || "",
            repositoryId: data.repositoryId || "",
            filePath: data.filePath || "",
            autoAnalysisComplete: false,
          } as InsertTask);
          result = { type: "task", task, projectName: project.name };
          break;
        }
        case "UPDATE_TASK_STATUS": {
          if (!data.taskId) return res.status(400).json({ message: "taskId is required for updating task status" });
          if (!data.newStatus) return res.status(400).json({ message: "newStatus is required for updating task status" });
          const taskId = data.taskId;
          const newStatus = data.newStatus;
          const validStatuses = ["Open", "In Progress", "Quality Review", "Done"];
          if (!validStatuses.includes(newStatus)) {
            return res.status(400).json({ message: `Invalid status: ${newStatus}` });
          }
          const allProjectData = storage.getAllTasksForBusiness(bizId);
          let updatedTask: any = null;
          for (const { project, tasks } of allProjectData) {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              const oldStatus = task.status;
              updatedTask = storage.updateTask(project.id, taskId, { status: newStatus } as any, bizId);
              if (updatedTask && oldStatus !== newStatus) {
                storage.addChangelogEntry(bizId, {
                  taskId: updatedTask.id,
                  taskTitle: updatedTask.title,
                  fromStatus: oldStatus,
                  toStatus: newStatus,
                  timestamp: new Date().toISOString(),
                });
              }
              break;
            }
          }
          if (!updatedTask) return res.status(404).json({ message: `Task ${taskId} not found` });
          result = { type: "taskStatus", task: updatedTask };
          break;
        }
        case "CREATE_PROJECT": {
          if (!data.name) return res.status(400).json({ message: "name is required for creating a project" });
          const project = storage.createProject(bizId, {
            name: data.name || "New Project",
            description: data.description || "",
            color: data.color || "#58a6ff",
            relatedRepositories: data.relatedRepositories || [],
            defaultRepositoryId: data.defaultRepositoryId || "",
          });
          result = { type: "project", project };
          break;
        }
        case "BULK_UPDATE_REPOSITORY": {
          if (!data.projectId) return res.status(400).json({ message: "projectId is required for bulk repository update" });
          if (!data.repositoryId) return res.status(400).json({ message: "repositoryId is required for bulk repository update" });
          const bulkProject = storage.getProject(bizId, data.projectId);
          if (!bulkProject) return res.status(400).json({ message: `Project ${data.projectId} not found` });
          const bulkRepo = storage.getRepositories(bizId).find(r => r.id === data.repositoryId);
          if (!bulkRepo) return res.status(400).json({ message: `Repository ${data.repositoryId} not found` });
          const onlyUnlinked = data.onlyUnlinked !== false;
          const updatedCount = storage.bulkUpdateTasksRepository(data.projectId, data.repositoryId, onlyUnlinked);
          result = { type: "bulkRepository", updated: updatedCount, projectName: bulkProject.name, repositoryName: bulkRepo.name };
          break;
        }
        case "MOVE_TASK": {
          if (!data.taskId) return res.status(400).json({ message: "taskId is required for moving a task" });
          if (!data.fromProjectId) return res.status(400).json({ message: "fromProjectId is required for moving a task" });
          if (!data.toProjectId) return res.status(400).json({ message: "toProjectId is required for moving a task" });
          const moveFromProject = storage.getProject(bizId, data.fromProjectId);
          if (!moveFromProject) return res.status(400).json({ message: `Source project ${data.fromProjectId} not found` });
          const moveToProject = storage.getProject(bizId, data.toProjectId);
          if (!moveToProject) return res.status(400).json({ message: `Target project ${data.toProjectId} not found` });
          if (data.fromProjectId === data.toProjectId) return res.status(400).json({ message: "Source and target projects are the same" });
          const movedTask = storage.moveTask(data.fromProjectId, data.toProjectId, data.taskId);
          if (!movedTask) return res.status(404).json({ message: `Task ${data.taskId} not found in project ${data.fromProjectId}` });
          result = { type: "moveTask", task: movedTask, fromProject: moveFromProject.name, toProject: moveToProject.name };
          break;
        }
        default:
          return res.status(400).json({ message: `Unknown action type: ${actionType}` });
      }

      if (messageId !== undefined && actionIndex !== undefined) {
        const msgs = storage.getManagerDiscussion(bizId);
        const msg = msgs.find(m => m.id === messageId);
        if (msg && msg.actions && msg.actions[actionIndex]) {
          msg.actions[actionIndex].status = "approved";
          storage.updateManagerMessage(bizId, messageId, msg);
        }
      }

      res.json({ success: true, result });
    } catch (err: any) {
      console.error("[manager/execute-action] Error:", err);
      res.status(500).json({ message: err.message || "Failed to execute action" });
    }
  });

  app.post("/api/businesses/:bizId/manager/update-action-status", (req, res) => {
    const bizId = req.params.bizId;
    const biz = storage.getBusiness(bizId);
    if (!biz) return res.status(404).json({ message: "Business not found" });

    const { messageId, actionIndex, status } = req.body;
    if (!messageId || actionIndex === undefined || !status) {
      return res.status(400).json({ message: "messageId, actionIndex, and status are required" });
    }

    const msgs = storage.getManagerDiscussion(bizId);
    const msg = msgs.find(m => m.id === messageId);
    if (!msg) return res.status(404).json({ message: "Message not found" });
    if (!msg.actions || !msg.actions[actionIndex]) {
      return res.status(404).json({ message: "Action not found" });
    }

    msg.actions[actionIndex].status = status;
    storage.updateManagerMessage(bizId, messageId, msg);
    res.json({ success: true });
  });

  app.delete("/api/businesses/:bizId/manager/history", (req, res) => {
    const bizId = req.params.bizId;
    const biz = storage.getBusiness(bizId);
    if (!biz) return res.status(404).json({ message: "Business not found" });
    storage.clearManagerDiscussion(bizId);
    res.json({ success: true });
  });

  return httpServer;
}
