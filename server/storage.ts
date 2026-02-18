import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import type {
  Business,
  InsertBusiness,
  Repository,
  InsertRepository,
  RepositorySafe,
  Agent,
  AgentSafe,
  Project,
  InsertProject,
  Task,
  InsertTask,
  ChangelogEntry,
  InboxItem,
  InsertInboxItem,
  StoreData,
  DiscussionMessage,
  CodeReview,
  ManagerMessage,
} from "@shared/schema";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function migrateStore(raw: any): StoreData {
  if (raw.businesses) {
    if (!raw.repositories) raw.repositories = [];
    if (!raw.projects) raw.projects = [];
    if (!raw.tasks) raw.tasks = {};
    if (!raw.inbox) raw.inbox = {};
    if (!raw.changelog) raw.changelog = {};
    if (!raw.agents) raw.agents = {};
    if (!raw.codeReviews) raw.codeReviews = {};
    if (!raw.managerDiscussions) raw.managerDiscussions = {};
    return raw as StoreData;
  }

  const oldRepos: any[] = raw.repositories || [];
  const oldProjects: any[] = raw.projects || [];
  const oldTasks: Record<string, any[]> = raw.tasks || {};
  const oldInbox: Record<string, any[]> = raw.inbox || {};
  const oldChangelog: Record<string, any[]> = raw.changelog || {};

  const businesses: Business[] = [];
  const repositories: Repository[] = [];
  const agents: Record<string, Agent[]> = {};
  const newProjects: Project[] = [];
  const newTasks: Record<string, any[]> = {};
  const newInbox: Record<string, InboxItem[]> = {};
  const newChangelog: Record<string, ChangelogEntry[]> = {};

  for (const oldRepo of oldRepos) {
    const bizId = `B${oldRepo.id.replace(/^R/, "")}`;

    businesses.push({
      id: bizId,
      name: oldRepo.name,
      description: oldRepo.description || "",
      color: oldRepo.color || "#58a6ff",
    });

    if (oldRepo.repoUrl || oldRepo.owner || oldRepo.repo || oldRepo.token) {
      repositories.push({
        id: oldRepo.id,
        businessId: bizId,
        name: oldRepo.repo || oldRepo.name,
        description: "",
        repoUrl: oldRepo.repoUrl || "",
        owner: oldRepo.owner || "",
        repo: oldRepo.repo || "",
        token: oldRepo.token || "",
        type: "other",
      });
    }

    const oldAgents = oldRepo.agents || [];
    agents[bizId] = oldAgents.map((a: any) => ({
      id: a.id || randomUUID(),
      name: a.name,
      type: a.type,
      apiKey: a.apiKey || "",
      role: a.role || "",
      isReviewAgent: a.isReviewAgent || false,
    }));

    const repoProjects = oldProjects.filter((p) => p.repositoryId === oldRepo.id);
    for (const p of repoProjects) {
      newProjects.push({
        id: p.id,
        businessId: bizId,
        name: p.name,
        description: p.description || "",
        color: p.color || "#58a6ff",
        relatedRepositories: oldRepo.repoUrl ? [oldRepo.id] : [],
        defaultRepositoryId: p.defaultRepositoryId || "",
      });
      if (oldTasks[p.id]) {
        newTasks[p.id] = oldTasks[p.id].map((t: any) => ({
          ...t,
          repositoryId: t.repositoryId || "",
          filePath: t.filePath || t.relatedFilePath || "",
        }));
      }
    }

    if (oldInbox[oldRepo.id]) {
      newInbox[bizId] = oldInbox[oldRepo.id];
    }
    if (oldChangelog[oldRepo.id]) {
      newChangelog[bizId] = oldChangelog[oldRepo.id];
    }
  }

  return {
    businesses,
    repositories,
    projects: newProjects,
    tasks: newTasks,
    inbox: newInbox,
    changelog: newChangelog,
    agents,
    codeReviews: {},
    managerDiscussions: {},
  };
}

function readStore(): StoreData {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreData = {
      businesses: [],
      repositories: [],
      projects: [],
      tasks: {},
      inbox: {},
      changelog: {},
      agents: {},
      codeReviews: {},
      managerDiscussions: {},
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  const migrated = migrateStore(raw);
  if (!raw.businesses) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(migrated, null, 2));
  }
  return migrated;
}

function writeStore(data: StoreData) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function stripAgentKeys(agent: Agent): AgentSafe {
  const { apiKey, ...safe } = agent;
  return safe;
}

function stripRepoSensitive(repo: Repository): RepositorySafe {
  const { token, ...rest } = repo;
  return rest;
}

function generateTaskId(type: string, existingTasks: Task[]): string {
  const prefix =
    type === "Bug" ? "BUG" : type === "Feature" ? "FEAT" : "ARCH";
  const existing = existingTasks
    .filter((t) => t.id.startsWith(prefix + "-"))
    .map((t) => {
      const num = parseInt(t.id.split("-")[1], 10);
      return isNaN(num) ? 0 : num;
    });
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

export interface IStorage {
  getBusinesses(): Business[];
  getBusiness(id: string): Business | undefined;
  createBusiness(data: InsertBusiness): Business;
  updateBusiness(id: string, data: Partial<InsertBusiness>): Business | undefined;
  deleteBusiness(id: string): boolean;

  getRepositories(bizId: string): RepositorySafe[];
  getRepository(bizId: string, repoId: string): RepositorySafe | undefined;
  getRepositoryWithToken(repoId: string): Repository | undefined;
  getRepositoriesWithTokens(bizId: string): Repository[];
  createRepository(bizId: string, data: InsertRepository): RepositorySafe;
  updateRepository(bizId: string, repoId: string, data: Record<string, any>): RepositorySafe | undefined;
  deleteRepository(bizId: string, repoId: string): boolean;

  getBusinessAgents(bizId: string): AgentSafe[];
  addAgent(bizId: string, agent: Omit<Agent, "id">): AgentSafe | undefined;
  updateAgent(bizId: string, agentId: string, data: Partial<Omit<Agent, "id">>): AgentSafe | undefined;
  deleteAgent(bizId: string, agentId: string): boolean;
  getReviewAgent(bizId: string): Agent | undefined;

  getProjects(bizId: string): Project[];
  getProject(bizId: string, projectId: string): Project | undefined;
  createProject(bizId: string, data: InsertProject): Project;
  updateProject(bizId: string, projectId: string, data: Partial<InsertProject>): Project | undefined;
  deleteProject(bizId: string, projectId: string): boolean;

  getTasks(projectId: string): Task[];
  getAllTasksForBusiness(bizId: string): { project: Project; tasks: Task[] }[];
  getTask(projectId: string, taskId: string): Task | undefined;
  createTask(projectId: string, data: InsertTask, customId?: string): Task;
  updateTask(projectId: string, taskId: string, data: Partial<InsertTask>, bizId?: string): Task | undefined;
  deleteTask(projectId: string, taskId: string): boolean;
  moveTask(fromProjectId: string, toProjectId: string, taskId: string): Task | undefined;
  bulkUpdateTasksRepository(projectId: string, repositoryId: string, onlyUnlinked: boolean): number;

  getDiscussion(projectId: string, taskId: string): DiscussionMessage[];
  addDiscussionMessage(projectId: string, taskId: string, message: Omit<DiscussionMessage, "id">): DiscussionMessage | undefined;

  addGeneratedPrompt(projectId: string, taskId: string, prompt: { source: "code_review" | "discussion"; prompt: string; filePath?: string }): Task | undefined;

  getCodeReviews(taskId: string): CodeReview[];
  addCodeReview(review: Omit<CodeReview, "id">): CodeReview;

  getChangelog(bizId: string): ChangelogEntry[];
  addChangelogEntry(bizId: string, entry: Omit<ChangelogEntry, "id">): ChangelogEntry;

  getInboxItems(bizId: string): InboxItem[];
  getInboxItem(bizId: string, id: string): InboxItem | undefined;
  addInboxItem(bizId: string, data: InsertInboxItem): InboxItem;
  updateInboxItem(bizId: string, id: string, data: Partial<InboxItem>): InboxItem | undefined;
  deleteInboxItem(bizId: string, id: string): boolean;
  assignInboxItem(bizId: string, id: string, projectId: string): { inboxItem: InboxItem; task: Task } | undefined;

  getManagerDiscussion(bizId: string): ManagerMessage[];
  addManagerMessage(bizId: string, message: Omit<ManagerMessage, "id">): ManagerMessage;
  updateManagerMessage(bizId: string, messageId: string, updates: Partial<ManagerMessage>): ManagerMessage | undefined;
  clearManagerDiscussion(bizId: string): void;
}

export class JsonFileStorage implements IStorage {
  getBusinesses(): Business[] {
    const store = readStore();
    return store.businesses;
  }

  getBusiness(id: string): Business | undefined {
    const store = readStore();
    return store.businesses.find((b) => b.id === id);
  }

  createBusiness(data: InsertBusiness): Business {
    const store = readStore();
    const id = `B${store.businesses.length + 1}-${Date.now().toString(36)}`;
    const business: Business = {
      id,
      name: data.name,
      description: data.description || "",
      color: data.color || "#58a6ff",
    };
    store.businesses.push(business);
    store.inbox[id] = [];
    store.changelog[id] = [];
    store.agents[id] = [];
    writeStore(store);
    return business;
  }

  updateBusiness(id: string, data: Partial<InsertBusiness>): Business | undefined {
    const store = readStore();
    const idx = store.businesses.findIndex((b) => b.id === id);
    if (idx === -1) return undefined;
    const biz = store.businesses[idx];
    if (data.name !== undefined) biz.name = data.name;
    if (data.description !== undefined) biz.description = data.description;
    if (data.color !== undefined) biz.color = data.color;
    store.businesses[idx] = biz;
    writeStore(store);
    return biz;
  }

  deleteBusiness(id: string): boolean {
    const store = readStore();
    const idx = store.businesses.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    store.businesses.splice(idx, 1);
    store.repositories = store.repositories.filter((r) => r.businessId !== id);
    const projectIds = store.projects.filter((p) => p.businessId === id).map((p) => p.id);
    store.projects = store.projects.filter((p) => p.businessId !== id);
    for (const pid of projectIds) {
      delete store.tasks[pid];
    }
    delete store.inbox[id];
    delete store.changelog[id];
    delete store.agents[id];
    writeStore(store);
    return true;
  }

  getRepositories(bizId: string): RepositorySafe[] {
    const store = readStore();
    return store.repositories.filter((r) => r.businessId === bizId).map(stripRepoSensitive);
  }

  getRepository(bizId: string, repoId: string): RepositorySafe | undefined {
    const store = readStore();
    const repo = store.repositories.find((r) => r.id === repoId && r.businessId === bizId);
    return repo ? stripRepoSensitive(repo) : undefined;
  }

  getRepositoryWithToken(repoId: string): Repository | undefined {
    const store = readStore();
    return store.repositories.find((r) => r.id === repoId);
  }

  getRepositoriesWithTokens(bizId: string): Repository[] {
    const store = readStore();
    return store.repositories.filter((r) => r.businessId === bizId);
  }

  createRepository(bizId: string, data: InsertRepository): RepositorySafe {
    const store = readStore();
    let owner = "";
    let repo = "";
    if (data.repoUrl) {
      const match = data.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        owner = match[1];
        repo = match[2].replace(/\.git$/, "");
      }
    }
    const id = `R${store.repositories.length + 1}-${Date.now().toString(36)}`;
    const repository: Repository = {
      id,
      businessId: bizId,
      name: data.name,
      description: data.description || "",
      repoUrl: data.repoUrl || "",
      owner,
      repo,
      token: data.token || "",
      type: (data.type as any) || "other",
    };
    store.repositories.push(repository);
    writeStore(store);
    return stripRepoSensitive(repository);
  }

  updateRepository(bizId: string, repoId: string, data: Record<string, any>): RepositorySafe | undefined {
    const store = readStore();
    const idx = store.repositories.findIndex((r) => r.id === repoId && r.businessId === bizId);
    if (idx === -1) return undefined;
    const repo = store.repositories[idx];
    if (data.name !== undefined) repo.name = data.name;
    if (data.description !== undefined) repo.description = data.description;
    if (data.repoUrl !== undefined) {
      repo.repoUrl = data.repoUrl;
      const match = data.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        repo.owner = match[1];
        repo.repo = match[2].replace(/\.git$/, "");
      }
    }
    if (data.owner !== undefined && data.owner !== "") repo.owner = data.owner;
    if (data.repo !== undefined && data.repo !== "") repo.repo = data.repo;
    if (data.token !== undefined && data.token !== "") repo.token = data.token;
    if (data.type !== undefined) repo.type = data.type;
    store.repositories[idx] = repo;
    writeStore(store);
    return stripRepoSensitive(repo);
  }

  deleteRepository(bizId: string, repoId: string): boolean {
    const store = readStore();
    const idx = store.repositories.findIndex((r) => r.id === repoId && r.businessId === bizId);
    if (idx === -1) return false;
    store.repositories.splice(idx, 1);
    for (const p of store.projects) {
      if (p.relatedRepositories) {
        p.relatedRepositories = p.relatedRepositories.filter((rid) => rid !== repoId);
      }
    }
    writeStore(store);
    return true;
  }

  getBusinessAgents(bizId: string): AgentSafe[] {
    const store = readStore();
    return (store.agents[bizId] || []).map(stripAgentKeys);
  }

  addAgent(bizId: string, agent: Omit<Agent, "id">): AgentSafe | undefined {
    const store = readStore();
    if (!store.businesses.find((b) => b.id === bizId)) return undefined;
    if (!store.agents[bizId]) store.agents[bizId] = [];
    const full: Agent = { id: randomUUID(), ...agent };
    store.agents[bizId].push(full);
    writeStore(store);
    return stripAgentKeys(full);
  }

  updateAgent(bizId: string, agentId: string, data: Partial<Omit<Agent, "id">>): AgentSafe | undefined {
    const store = readStore();
    const agents = store.agents[bizId];
    if (!agents) return undefined;
    const idx = agents.findIndex((a) => a.id === agentId);
    if (idx === -1) return undefined;
    const agent = agents[idx];
    if (data.name !== undefined) agent.name = data.name;
    if (data.type !== undefined) agent.type = data.type;
    if (data.apiKey !== undefined && data.apiKey !== "") agent.apiKey = data.apiKey;
    if (data.role !== undefined) agent.role = data.role;
    if (data.isReviewAgent !== undefined) {
      if (data.isReviewAgent) {
        agents.forEach((a) => (a.isReviewAgent = false));
      }
      agent.isReviewAgent = data.isReviewAgent;
    }
    agents[idx] = agent;
    store.agents[bizId] = agents;
    writeStore(store);
    return stripAgentKeys(agent);
  }

  deleteAgent(bizId: string, agentId: string): boolean {
    const store = readStore();
    const agents = store.agents[bizId];
    if (!agents) return false;
    const idx = agents.findIndex((a) => a.id === agentId);
    if (idx === -1) return false;
    agents.splice(idx, 1);
    store.agents[bizId] = agents;
    writeStore(store);
    return true;
  }

  getReviewAgent(bizId: string): Agent | undefined {
    const store = readStore();
    const agents = store.agents[bizId] || [];
    return agents.find((a) => a.isReviewAgent);
  }

  getProjects(bizId: string): Project[] {
    const store = readStore();
    return store.projects.filter((p) => p.businessId === bizId);
  }

  getProject(bizId: string, projectId: string): Project | undefined {
    const store = readStore();
    return store.projects.find((p) => p.id === projectId && p.businessId === bizId);
  }

  createProject(bizId: string, data: InsertProject): Project {
    const store = readStore();
    const project: Project = {
      id: `P${store.projects.length + 1}-${Date.now().toString(36)}`,
      businessId: bizId,
      name: data.name,
      description: data.description || "",
      color: data.color || "#58a6ff",
      relatedRepositories: data.relatedRepositories || [],
      defaultRepositoryId: data.defaultRepositoryId || "",
    };
    store.projects.push(project);
    store.tasks[project.id] = [];
    writeStore(store);
    return project;
  }

  updateProject(bizId: string, projectId: string, data: Partial<InsertProject>): Project | undefined {
    const store = readStore();
    const idx = store.projects.findIndex((p) => p.id === projectId && p.businessId === bizId);
    if (idx === -1) return undefined;
    const project = store.projects[idx];
    if (data.name !== undefined) project.name = data.name;
    if (data.description !== undefined) project.description = data.description;
    if (data.color !== undefined) project.color = data.color;
    if (data.relatedRepositories !== undefined) project.relatedRepositories = data.relatedRepositories;
    store.projects[idx] = project;
    writeStore(store);
    return project;
  }

  deleteProject(bizId: string, projectId: string): boolean {
    const store = readStore();
    const idx = store.projects.findIndex((p) => p.id === projectId && p.businessId === bizId);
    if (idx === -1) return false;
    store.projects.splice(idx, 1);
    delete store.tasks[projectId];
    writeStore(store);
    return true;
  }

  getTasks(projectId: string): Task[] {
    const store = readStore();
    return store.tasks[projectId] || [];
  }

  getAllTasksForBusiness(bizId: string): { project: Project; tasks: Task[] }[] {
    const store = readStore();
    const bizProjects = store.projects.filter((p) => p.businessId === bizId);
    return bizProjects.map((p) => ({
      project: p,
      tasks: store.tasks[p.id] || [],
    }));
  }

  getTask(projectId: string, taskId: string): Task | undefined {
    const tasks = this.getTasks(projectId);
    return tasks.find((t) => t.id === taskId);
  }

  createTask(projectId: string, data: InsertTask, customId?: string): Task {
    const store = readStore();
    if (!store.tasks[projectId]) store.tasks[projectId] = [];
    const allTasks = store.tasks[projectId];
    const existingIds = new Set(allTasks.map(t => t.id));
    const id = customId && !existingIds.has(customId) ? customId : generateTaskId(data.type, allTasks);
    const task: Task = {
      id,
      projectId,
      repositoryId: data.repositoryId || "",
      type: data.type,
      status: data.status || "Open",
      priority: data.priority || "Medium",
      title: data.title,
      description: data.description || "",
      reasoning: data.reasoning || "",
      fixSteps: data.fixSteps || "",
      replitPrompt: data.replitPrompt || "",
      filePath: data.filePath || "",
      discussion: [],
      autoAnalysisComplete: false,
      generatedPrompts: [],
    };
    store.tasks[projectId].push(task);
    writeStore(store);
    return task;
  }

  updateTask(projectId: string, taskId: string, data: Partial<InsertTask>, bizId?: string): Task | undefined {
    const store = readStore();
    const tasks = store.tasks[projectId];
    if (!tasks) return undefined;
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    const oldTask = tasks[idx];
    const oldStatus = oldTask.status;
    if (data.type !== undefined) oldTask.type = data.type;
    if (data.status !== undefined) oldTask.status = data.status;
    if (data.priority !== undefined) oldTask.priority = data.priority;
    if (data.title !== undefined) oldTask.title = data.title;
    if (data.description !== undefined) oldTask.description = data.description;
    if (data.reasoning !== undefined) oldTask.reasoning = data.reasoning;
    if (data.fixSteps !== undefined) oldTask.fixSteps = data.fixSteps;
    if (data.replitPrompt !== undefined) oldTask.replitPrompt = data.replitPrompt;
    if (data.repositoryId !== undefined) oldTask.repositoryId = data.repositoryId;
    if (data.filePath !== undefined) oldTask.filePath = data.filePath;
    if ((data as any).autoAnalysisComplete !== undefined) (oldTask as any).autoAnalysisComplete = (data as any).autoAnalysisComplete;
    if ((data as any).autoAnalysisResult !== undefined) (oldTask as any).autoAnalysisResult = (data as any).autoAnalysisResult;
    if ((data as any).autoAnalysisTimestamp !== undefined) (oldTask as any).autoAnalysisTimestamp = (data as any).autoAnalysisTimestamp;
    store.tasks[projectId][idx] = oldTask;

    if (data.status !== undefined && data.status !== oldStatus) {
      const resolvedBizId = bizId || store.projects.find((p) => p.id === projectId)?.businessId;
      if (resolvedBizId) {
        if (!store.changelog[resolvedBizId]) store.changelog[resolvedBizId] = [];
        store.changelog[resolvedBizId].push({
          id: randomUUID(),
          taskId: oldTask.id,
          taskTitle: oldTask.title,
          fromStatus: oldStatus,
          toStatus: data.status,
          timestamp: new Date().toISOString(),
        });
      }
    }
    writeStore(store);
    return oldTask;
  }

  deleteTask(projectId: string, taskId: string): boolean {
    const store = readStore();
    const tasks = store.tasks[projectId];
    if (!tasks) return false;
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;
    tasks.splice(idx, 1);
    store.tasks[projectId] = tasks;
    writeStore(store);
    return true;
  }

  moveTask(fromProjectId: string, toProjectId: string, taskId: string): Task | undefined {
    const store = readStore();
    const fromTasks = store.tasks[fromProjectId];
    if (!fromTasks) return undefined;
    const idx = fromTasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    const task = fromTasks.splice(idx, 1)[0];
    task.projectId = toProjectId;
    if (!store.tasks[toProjectId]) store.tasks[toProjectId] = [];
    store.tasks[toProjectId].push(task);
    writeStore(store);
    return task;
  }

  bulkUpdateTasksRepository(projectId: string, repositoryId: string, onlyUnlinked: boolean): number {
    const store = readStore();
    const tasks = store.tasks[projectId];
    if (!tasks) return 0;
    let count = 0;
    for (const task of tasks) {
      if (onlyUnlinked && task.repositoryId) continue;
      task.repositoryId = repositoryId;
      count++;
    }
    writeStore(store);
    return count;
  }

  getDiscussion(projectId: string, taskId: string): DiscussionMessage[] {
    const store = readStore();
    const tasks = store.tasks[projectId] || [];
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return [];
    return (task as any).discussion || [];
  }

  addDiscussionMessage(projectId: string, taskId: string, message: Omit<DiscussionMessage, "id">): DiscussionMessage | undefined {
    const store = readStore();
    const tasks = store.tasks[projectId];
    if (!tasks) return undefined;
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    const task = tasks[idx] as any;
    if (!task.discussion) task.discussion = [];
    const full: DiscussionMessage = { id: randomUUID(), ...message };
    task.discussion.push(full);
    store.tasks[projectId][idx] = task;
    writeStore(store);
    return full;
  }

  getCodeReviews(taskId: string): CodeReview[] {
    const store = readStore();
    const all: CodeReview[] = [];
    for (const reviews of Object.values(store.codeReviews)) {
      all.push(...reviews.filter((r) => r.taskId === taskId));
    }
    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return all;
  }

  addCodeReview(review: Omit<CodeReview, "id">): CodeReview {
    const store = readStore();
    if (!store.codeReviews[review.taskId]) store.codeReviews[review.taskId] = [];
    const full: CodeReview = { id: randomUUID(), ...review };
    store.codeReviews[review.taskId].push(full);
    writeStore(store);
    return full;
  }

  addGeneratedPrompt(projectId: string, taskId: string, prompt: { source: "code_review" | "discussion"; prompt: string; filePath?: string }): Task | undefined {
    const store = readStore();
    const tasks = store.tasks[projectId];
    if (!tasks) return undefined;
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    const task = tasks[idx] as any;
    if (!task.generatedPrompts) task.generatedPrompts = [];
    task.generatedPrompts.push({
      id: `gp_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      source: prompt.source,
      prompt: prompt.prompt,
      filePath: prompt.filePath || "",
    });
    store.tasks[projectId][idx] = task;
    writeStore(store);
    return task;
  }

  getChangelog(bizId: string): ChangelogEntry[] {
    const store = readStore();
    return store.changelog[bizId] || [];
  }

  addChangelogEntry(bizId: string, entry: Omit<ChangelogEntry, "id">): ChangelogEntry {
    const store = readStore();
    if (!store.changelog[bizId]) store.changelog[bizId] = [];
    const full: ChangelogEntry = { id: randomUUID(), ...entry };
    store.changelog[bizId].push(full);
    writeStore(store);
    return full;
  }

  getInboxItems(bizId: string): InboxItem[] {
    const store = readStore();
    return store.inbox[bizId] || [];
  }

  getInboxItem(bizId: string, id: string): InboxItem | undefined {
    const store = readStore();
    const items = store.inbox[bizId] || [];
    return items.find((item) => item.id === id);
  }

  addInboxItem(bizId: string, data: InsertInboxItem): InboxItem {
    const store = readStore();
    if (!store.inbox[bizId]) store.inbox[bizId] = [];
    const item: InboxItem = {
      id: randomUUID(),
      title: data.title,
      type: data.type as any,
      source: data.source as any,
      description: data.description,
      priority: data.priority as any,
      status: "New",
      dateReceived: new Date().toISOString(),
      linkedProjectId: null,
      linkedTaskId: null,
      notes: data.notes,
    };
    store.inbox[bizId].push(item);
    writeStore(store);
    return item;
  }

  updateInboxItem(bizId: string, id: string, data: Partial<InboxItem>): InboxItem | undefined {
    const store = readStore();
    const items = store.inbox[bizId] || [];
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return undefined;
    const item = items[idx];
    if (data.title !== undefined) item.title = data.title;
    if (data.type !== undefined) item.type = data.type;
    if (data.source !== undefined) item.source = data.source;
    if (data.description !== undefined) item.description = data.description;
    if (data.priority !== undefined) item.priority = data.priority;
    if (data.status !== undefined) item.status = data.status;
    if (data.linkedProjectId !== undefined) item.linkedProjectId = data.linkedProjectId;
    if (data.linkedTaskId !== undefined) item.linkedTaskId = data.linkedTaskId;
    if (data.notes !== undefined) item.notes = data.notes;
    items[idx] = item;
    store.inbox[bizId] = items;
    writeStore(store);
    return item;
  }

  deleteInboxItem(bizId: string, id: string): boolean {
    const store = readStore();
    const items = store.inbox[bizId] || [];
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    store.inbox[bizId] = items;
    writeStore(store);
    return true;
  }

  assignInboxItem(bizId: string, id: string, projectId: string): { inboxItem: InboxItem; task: Task } | undefined {
    const store = readStore();
    const items = store.inbox[bizId] || [];
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return undefined;
    const project = store.projects.find((p) => p.id === projectId && p.businessId === bizId);
    if (!project) return undefined;
    const inboxItem = items[idx];
    if (!store.tasks[projectId]) store.tasks[projectId] = [];
    const taskTypeMap: Record<string, string> = { Bug: "Bug", Feature: "Feature", Idea: "Feature", Improvement: "Task" };
    const taskType = taskTypeMap[inboxItem.type] || "Task";
    const allTasks = store.tasks[projectId];
    const taskId = generateTaskId(taskType, allTasks);
    const task: Task = {
      id: taskId,
      projectId,
      repositoryId: "",
      type: taskType as any,
      status: "Open",
      priority: inboxItem.priority as any,
      title: inboxItem.title,
      description: inboxItem.description,
      reasoning: "",
      fixSteps: "",
      replitPrompt: "",
      filePath: "",
      discussion: [],
      autoAnalysisComplete: false,
      generatedPrompts: [],
    };
    store.tasks[projectId].push(task);
    inboxItem.status = "Assigned";
    inboxItem.linkedProjectId = projectId;
    inboxItem.linkedTaskId = task.id;
    items[idx] = inboxItem;
    store.inbox[bizId] = items;
    writeStore(store);
    return { inboxItem, task };
  }
  getManagerDiscussion(bizId: string): ManagerMessage[] {
    const store = readStore();
    return store.managerDiscussions[bizId] || [];
  }

  addManagerMessage(bizId: string, message: Omit<ManagerMessage, "id">): ManagerMessage {
    const store = readStore();
    if (!store.managerDiscussions[bizId]) store.managerDiscussions[bizId] = [];
    const full: ManagerMessage = { id: randomUUID(), ...message };
    store.managerDiscussions[bizId].push(full);
    writeStore(store);
    return full;
  }

  updateManagerMessage(bizId: string, messageId: string, updates: Partial<ManagerMessage>): ManagerMessage | undefined {
    const store = readStore();
    const msgs = store.managerDiscussions[bizId] || [];
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx === -1) return undefined;
    const msg = msgs[idx];
    if (updates.actions !== undefined) msg.actions = updates.actions;
    if (updates.content !== undefined) msg.content = updates.content;
    store.managerDiscussions[bizId][idx] = msg;
    writeStore(store);
    return msg;
  }

  clearManagerDiscussion(bizId: string): void {
    const store = readStore();
    store.managerDiscussions[bizId] = [];
    writeStore(store);
  }
}

export const storage = new JsonFileStorage();
