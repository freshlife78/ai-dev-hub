import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  businessesTable,
  repositoriesTable,
  projectsTable,
  tasksTable,
  agentsTable,
  inboxItemsTable,
  changelogEntriesTable,
  codeReviewsTable,
  managerMessagesTable,
} from "@shared/schema";
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
  DiscussionMessage,
  CodeReview,
  ManagerMessage,
} from "@shared/schema";
import type { IStorage } from "./storage";

function stripAgentKeys(agent: Agent): AgentSafe {
  const { apiKey, ...safe } = agent;
  return safe;
}

function stripRepoSensitive(repo: Repository): RepositorySafe {
  const { token, ...rest } = repo;
  return rest;
}

function generateTaskId(type: string, existingTasks: Task[]): string {
  const prefix = type === "Bug" ? "BUG" : type === "Feature" ? "FEAT" : "ARCH";
  const existing = existingTasks
    .filter((t) => t.id.startsWith(prefix + "-"))
    .map((t) => {
      const num = parseInt(t.id.split("-")[1], 10);
      return isNaN(num) ? 0 : num;
    });
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

function rowToRepo(row: any): Repository {
  return {
    id: row.id, businessId: row.businessId, name: row.name,
    description: row.description, repoUrl: row.repoUrl, owner: row.owner,
    repo: row.repo, token: row.token, type: row.type || "other",
  };
}

function rowToProject(row: any): Project {
  return {
    id: row.id, businessId: row.businessId, name: row.name,
    description: row.description, color: row.color,
    relatedRepositories: row.relatedRepositories || [],
    defaultRepositoryId: row.defaultRepositoryId || "",
  };
}

function rowToTask(row: any): Task {
  return {
    id: row.id, projectId: row.projectId, repositoryId: row.repositoryId || "",
    type: row.type, status: row.status, priority: row.priority,
    title: row.title, description: row.description || "",
    reasoning: row.reasoning || "", fixSteps: row.fixSteps || "",
    replitPrompt: row.replitPrompt || "", filePath: row.filePath || "",
    discussion: row.discussion || [],
    autoAnalysisComplete: row.autoAnalysisComplete || false,
    autoAnalysisResult: row.autoAnalysisResult || undefined,
    autoAnalysisTimestamp: row.autoAnalysisTimestamp || undefined,
    generatedPrompts: row.generatedPrompts || [],
  };
}

function rowToAgent(row: any): Agent {
  return {
    id: row.id, name: row.name, type: row.type,
    apiKey: row.apiKey, role: row.role, isReviewAgent: row.isReviewAgent,
  };
}

function rowToInboxItem(row: any): InboxItem {
  return {
    id: row.id, title: row.title, type: row.type, source: row.source,
    description: row.description, priority: row.priority, status: row.status,
    dateReceived: row.dateReceived, linkedProjectId: row.linkedProjectId || null,
    linkedTaskId: row.linkedTaskId || null, notes: row.notes,
  };
}

function rowToManagerMessage(row: any): ManagerMessage {
  return {
    id: row.id, sender: row.sender, content: row.content,
    timestamp: row.timestamp, mode: row.mode || "chat",
    actions: row.actions || [], filesLoaded: row.filesLoaded || [],
    attachments: row.attachments || [],
  };
}

export class DatabaseStorage implements IStorage {
  async getBusinesses(): Promise<Business[]> {
    const rows = await db.select().from(businessesTable);
    return rows as Business[];
  }

  async getBusiness(id: string): Promise<Business | undefined> {
    const rows = await db.select().from(businessesTable).where(eq(businessesTable.id, id));
    return rows[0] as Business | undefined;
  }

  async createBusiness(data: InsertBusiness): Promise<Business> {
    const existing = await db.select().from(businessesTable);
    const id = `B${existing.length + 1}-${Date.now().toString(36)}`;
    const business: Business = { id, name: data.name, description: data.description || "", color: data.color || "#58a6ff" };
    await db.insert(businessesTable).values(business);
    return business;
  }

  async updateBusiness(id: string, data: Partial<InsertBusiness>): Promise<Business | undefined> {
    const rows = await db.select().from(businessesTable).where(eq(businessesTable.id, id));
    if (rows.length === 0) return undefined;
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.color !== undefined) updates.color = data.color;
    if (Object.keys(updates).length > 0) {
      await db.update(businessesTable).set(updates).where(eq(businessesTable.id, id));
    }
    const updated = await db.select().from(businessesTable).where(eq(businessesTable.id, id));
    return updated[0] as Business;
  }

  async deleteBusiness(id: string): Promise<boolean> {
    const rows = await db.select().from(businessesTable).where(eq(businessesTable.id, id));
    if (rows.length === 0) return false;
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.businessId, id));
    for (const p of projects) {
      await db.delete(tasksTable).where(eq(tasksTable.projectId, p.id));
    }
    await db.delete(projectsTable).where(eq(projectsTable.businessId, id));
    await db.delete(repositoriesTable).where(eq(repositoriesTable.businessId, id));
    await db.delete(agentsTable).where(eq(agentsTable.businessId, id));
    await db.delete(inboxItemsTable).where(eq(inboxItemsTable.businessId, id));
    await db.delete(changelogEntriesTable).where(eq(changelogEntriesTable.businessId, id));
    await db.delete(managerMessagesTable).where(eq(managerMessagesTable.businessId, id));
    await db.delete(businessesTable).where(eq(businessesTable.id, id));
    return true;
  }

  async getRepositories(bizId: string): Promise<RepositorySafe[]> {
    const rows = await db.select().from(repositoriesTable).where(eq(repositoriesTable.businessId, bizId));
    return rows.map(r => stripRepoSensitive(rowToRepo(r)));
  }

  async getRepository(bizId: string, repoId: string): Promise<RepositorySafe | undefined> {
    const rows = await db.select().from(repositoriesTable).where(
      and(eq(repositoriesTable.id, repoId), eq(repositoriesTable.businessId, bizId))
    );
    return rows[0] ? stripRepoSensitive(rowToRepo(rows[0])) : undefined;
  }

  async getRepositoryWithToken(repoId: string): Promise<Repository | undefined> {
    const rows = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, repoId));
    return rows[0] ? rowToRepo(rows[0]) : undefined;
  }

  async getRepositoriesWithTokens(bizId: string): Promise<Repository[]> {
    const rows = await db.select().from(repositoriesTable).where(eq(repositoriesTable.businessId, bizId));
    return rows.map(rowToRepo);
  }

  async createRepository(bizId: string, data: InsertRepository): Promise<RepositorySafe> {
    let owner = "", repo = "";
    if (data.repoUrl) {
      const match = data.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) { owner = match[1]; repo = match[2].replace(/\.git$/, ""); }
    }
    const existing = await db.select().from(repositoriesTable);
    const id = `R${existing.length + 1}-${Date.now().toString(36)}`;
    const repository = { id, businessId: bizId, name: data.name, description: data.description || "", repoUrl: data.repoUrl || "", owner, repo, token: data.token || "", type: (data.type as any) || "other" };
    await db.insert(repositoriesTable).values(repository);
    return stripRepoSensitive(rowToRepo(repository));
  }

  async updateRepository(bizId: string, repoId: string, data: Record<string, any>): Promise<RepositorySafe | undefined> {
    const rows = await db.select().from(repositoriesTable).where(and(eq(repositoriesTable.id, repoId), eq(repositoriesTable.businessId, bizId)));
    if (rows.length === 0) return undefined;
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.repoUrl !== undefined) {
      updates.repoUrl = data.repoUrl;
      const match = data.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) { updates.owner = match[1]; updates.repo = match[2].replace(/\.git$/, ""); }
    }
    if (data.owner !== undefined && data.owner !== "") updates.owner = data.owner;
    if (data.repo !== undefined && data.repo !== "") updates.repo = data.repo;
    if (data.token !== undefined && data.token !== "") updates.token = data.token;
    if (data.type !== undefined) updates.type = data.type;
    if (Object.keys(updates).length > 0) {
      await db.update(repositoriesTable).set(updates).where(eq(repositoriesTable.id, repoId));
    }
    const updated = await db.select().from(repositoriesTable).where(eq(repositoriesTable.id, repoId));
    return updated[0] ? stripRepoSensitive(rowToRepo(updated[0])) : undefined;
  }

  async deleteRepository(bizId: string, repoId: string): Promise<boolean> {
    const rows = await db.select().from(repositoriesTable).where(and(eq(repositoriesTable.id, repoId), eq(repositoriesTable.businessId, bizId)));
    if (rows.length === 0) return false;
    await db.delete(repositoriesTable).where(eq(repositoriesTable.id, repoId));
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.businessId, bizId));
    for (const p of projects) {
      const proj = rowToProject(p);
      if (proj.relatedRepositories?.includes(repoId)) {
        await db.update(projectsTable).set({ relatedRepositories: proj.relatedRepositories.filter(rid => rid !== repoId) }).where(eq(projectsTable.id, p.id));
      }
    }
    return true;
  }

  async getBusinessAgents(bizId: string): Promise<AgentSafe[]> {
    const rows = await db.select().from(agentsTable).where(eq(agentsTable.businessId, bizId));
    return rows.map(r => stripAgentKeys(rowToAgent(r)));
  }

  async addAgent(bizId: string, agent: Omit<Agent, "id">): Promise<AgentSafe | undefined> {
    const biz = await this.getBusiness(bizId);
    if (!biz) return undefined;
    const full: Agent = { id: randomUUID(), ...agent };
    await db.insert(agentsTable).values({ id: full.id, businessId: bizId, name: full.name, type: full.type, apiKey: full.apiKey, role: full.role, isReviewAgent: full.isReviewAgent });
    return stripAgentKeys(full);
  }

  async updateAgent(bizId: string, agentId: string, data: Partial<Omit<Agent, "id">>): Promise<AgentSafe | undefined> {
    const rows = await db.select().from(agentsTable).where(and(eq(agentsTable.id, agentId), eq(agentsTable.businessId, bizId)));
    if (rows.length === 0) return undefined;
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.type !== undefined) updates.type = data.type;
    if (data.apiKey !== undefined && data.apiKey !== "") updates.apiKey = data.apiKey;
    if (data.role !== undefined) updates.role = data.role;
    if (data.isReviewAgent !== undefined) {
      if (data.isReviewAgent) { await db.update(agentsTable).set({ isReviewAgent: false }).where(eq(agentsTable.businessId, bizId)); }
      updates.isReviewAgent = data.isReviewAgent;
    }
    if (Object.keys(updates).length > 0) {
      await db.update(agentsTable).set(updates).where(eq(agentsTable.id, agentId));
    }
    const updated = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
    return updated[0] ? stripAgentKeys(rowToAgent(updated[0])) : undefined;
  }

  async deleteAgent(bizId: string, agentId: string): Promise<boolean> {
    const rows = await db.select().from(agentsTable).where(and(eq(agentsTable.id, agentId), eq(agentsTable.businessId, bizId)));
    if (rows.length === 0) return false;
    await db.delete(agentsTable).where(eq(agentsTable.id, agentId));
    return true;
  }

  async getReviewAgent(bizId: string): Promise<Agent | undefined> {
    const rows = await db.select().from(agentsTable).where(and(eq(agentsTable.businessId, bizId), eq(agentsTable.isReviewAgent, true)));
    return rows[0] ? rowToAgent(rows[0]) : undefined;
  }

  async getProjects(bizId: string): Promise<Project[]> {
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.businessId, bizId));
    return rows.map(rowToProject);
  }

  async getProject(bizId: string, projectId: string): Promise<Project | undefined> {
    const rows = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.businessId, bizId)));
    return rows[0] ? rowToProject(rows[0]) : undefined;
  }

  async createProject(bizId: string, data: InsertProject): Promise<Project> {
    const existing = await db.select().from(projectsTable);
    const project: Project = {
      id: `P${existing.length + 1}-${Date.now().toString(36)}`,
      businessId: bizId, name: data.name, description: data.description || "",
      color: data.color || "#58a6ff", relatedRepositories: data.relatedRepositories || [],
      defaultRepositoryId: data.defaultRepositoryId || "",
    };
    await db.insert(projectsTable).values({ id: project.id, businessId: project.businessId, name: project.name, description: project.description, color: project.color, relatedRepositories: project.relatedRepositories, defaultRepositoryId: project.defaultRepositoryId });
    return project;
  }

  async updateProject(bizId: string, projectId: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const rows = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.businessId, bizId)));
    if (rows.length === 0) return undefined;
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.color !== undefined) updates.color = data.color;
    if (data.relatedRepositories !== undefined) updates.relatedRepositories = data.relatedRepositories;
    if (data.defaultRepositoryId !== undefined) updates.defaultRepositoryId = data.defaultRepositoryId;
    if (Object.keys(updates).length > 0) {
      await db.update(projectsTable).set(updates).where(eq(projectsTable.id, projectId));
    }
    const updated = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    return updated[0] ? rowToProject(updated[0]) : undefined;
  }

  async deleteProject(bizId: string, projectId: string): Promise<boolean> {
    const rows = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.businessId, bizId)));
    if (rows.length === 0) return false;
    await db.delete(tasksTable).where(eq(tasksTable.projectId, projectId));
    await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
    return true;
  }

  async getTasks(projectId: string): Promise<Task[]> {
    const rows = await db.select().from(tasksTable).where(eq(tasksTable.projectId, projectId));
    return rows.map(rowToTask);
  }

  async getAllTasksForBusiness(bizId: string): Promise<{ project: Project; tasks: Task[] }[]> {
    const projects = await this.getProjects(bizId);
    const result: { project: Project; tasks: Task[] }[] = [];
    for (const p of projects) {
      const tasks = await this.getTasks(p.id);
      result.push({ project: p, tasks });
    }
    return result;
  }

  async getTask(projectId: string, taskId: string): Promise<Task | undefined> {
    const rows = await db.select().from(tasksTable).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, taskId)));
    return rows[0] ? rowToTask(rows[0]) : undefined;
  }

  async createTask(projectId: string, data: InsertTask, customId?: string): Promise<Task> {
    const existingTasks = await this.getTasks(projectId);
    const existingIds = new Set(existingTasks.map(t => t.id));
    const id = customId && !existingIds.has(customId) ? customId : generateTaskId(data.type, existingTasks);
    const task: Task = {
      id, projectId, repositoryId: data.repositoryId || "", type: data.type,
      status: data.status || "Open", priority: data.priority || "Medium",
      title: data.title, description: data.description || "",
      reasoning: data.reasoning || "", fixSteps: data.fixSteps || "",
      replitPrompt: data.replitPrompt || "", filePath: data.filePath || "",
      discussion: [], autoAnalysisComplete: false, generatedPrompts: [],
    };
    await db.insert(tasksTable).values({
      id: task.id, projectId: task.projectId, repositoryId: task.repositoryId,
      type: task.type, status: task.status, priority: task.priority,
      title: task.title, description: task.description, reasoning: task.reasoning,
      fixSteps: task.fixSteps, replitPrompt: task.replitPrompt, filePath: task.filePath,
      discussion: task.discussion, autoAnalysisComplete: task.autoAnalysisComplete,
      generatedPrompts: task.generatedPrompts,
    });
    return task;
  }

  async updateTask(projectId: string, taskId: string, data: Partial<InsertTask>, bizId?: string): Promise<Task | undefined> {
    const rows = await db.select().from(tasksTable).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, taskId)));
    if (rows.length === 0) return undefined;
    const oldTask = rowToTask(rows[0]);
    const oldStatus = oldTask.status;
    const updates: any = {};
    if (data.type !== undefined) updates.type = data.type;
    if (data.status !== undefined) updates.status = data.status;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.reasoning !== undefined) updates.reasoning = data.reasoning;
    if (data.fixSteps !== undefined) updates.fixSteps = data.fixSteps;
    if (data.replitPrompt !== undefined) updates.replitPrompt = data.replitPrompt;
    if (data.repositoryId !== undefined) updates.repositoryId = data.repositoryId;
    if (data.filePath !== undefined) updates.filePath = data.filePath;
    if ((data as any).autoAnalysisComplete !== undefined) updates.autoAnalysisComplete = (data as any).autoAnalysisComplete;
    if ((data as any).autoAnalysisResult !== undefined) updates.autoAnalysisResult = (data as any).autoAnalysisResult;
    if ((data as any).autoAnalysisTimestamp !== undefined) updates.autoAnalysisTimestamp = (data as any).autoAnalysisTimestamp;
    if (Object.keys(updates).length > 0) {
      await db.update(tasksTable).set(updates).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, taskId)));
    }
    if (data.status !== undefined && data.status !== oldStatus) {
      let resolvedBizId = bizId;
      if (!resolvedBizId) {
        const proj = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
        resolvedBizId = proj[0]?.businessId;
      }
      if (resolvedBizId) {
        await db.insert(changelogEntriesTable).values({
          id: randomUUID(), businessId: resolvedBizId, taskId: oldTask.id,
          taskTitle: data.title || oldTask.title, fromStatus: oldStatus,
          toStatus: data.status, timestamp: new Date().toISOString(),
        });
      }
    }
    const updated = await db.select().from(tasksTable).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, taskId)));
    return updated[0] ? rowToTask(updated[0]) : undefined;
  }

  async deleteTask(projectId: string, taskId: string): Promise<boolean> {
    const rows = await db.select().from(tasksTable).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, taskId)));
    if (rows.length === 0) return false;
    await db.delete(tasksTable).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, taskId)));
    return true;
  }

  async moveTask(fromProjectId: string, toProjectId: string, taskId: string): Promise<Task | undefined> {
    const rows = await db.select().from(tasksTable).where(and(eq(tasksTable.projectId, fromProjectId), eq(tasksTable.id, taskId)));
    if (rows.length === 0) return undefined;
    await db.update(tasksTable).set({ projectId: toProjectId }).where(and(eq(tasksTable.projectId, fromProjectId), eq(tasksTable.id, taskId)));
    const updated = await db.select().from(tasksTable).where(and(eq(tasksTable.projectId, toProjectId), eq(tasksTable.id, taskId)));
    return updated[0] ? rowToTask(updated[0]) : undefined;
  }

  async bulkUpdateTasksRepository(projectId: string, repositoryId: string, onlyUnlinked: boolean): Promise<number> {
    const tasks = await this.getTasks(projectId);
    let count = 0;
    for (const task of tasks) {
      if (onlyUnlinked && task.repositoryId) continue;
      await db.update(tasksTable).set({ repositoryId }).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, task.id)));
      count++;
    }
    return count;
  }

  async getDiscussion(projectId: string, taskId: string): Promise<DiscussionMessage[]> {
    const task = await this.getTask(projectId, taskId);
    return task?.discussion || [];
  }

  async addDiscussionMessage(projectId: string, taskId: string, message: Omit<DiscussionMessage, "id">): Promise<DiscussionMessage | undefined> {
    const task = await this.getTask(projectId, taskId);
    if (!task) return undefined;
    const full: DiscussionMessage = { id: randomUUID(), ...message };
    const discussion = [...(task.discussion || []), full];
    await db.update(tasksTable).set({ discussion }).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, taskId)));
    return full;
  }

  async addGeneratedPrompt(projectId: string, taskId: string, prompt: { source: "code_review" | "discussion"; prompt: string; filePath?: string }): Promise<Task | undefined> {
    const task = await this.getTask(projectId, taskId);
    if (!task) return undefined;
    const prompts = [...(task.generatedPrompts || [])];
    prompts.push({ id: `gp_${randomUUID().slice(0, 8)}`, timestamp: new Date().toISOString(), source: prompt.source, prompt: prompt.prompt, filePath: prompt.filePath || "" });
    await db.update(tasksTable).set({ generatedPrompts: prompts }).where(and(eq(tasksTable.projectId, projectId), eq(tasksTable.id, taskId)));
    return await this.getTask(projectId, taskId);
  }

  async getCodeReviews(taskId: string): Promise<CodeReview[]> {
    const rows = await db.select().from(codeReviewsTable).where(eq(codeReviewsTable.taskId, taskId));
    return rows.map(r => ({ id: r.id, taskId: r.taskId, projectId: r.projectId, repositoryId: r.repositoryId, filePath: r.filePath, review: r.review, question: r.question, timestamp: r.timestamp }));
  }

  async addCodeReview(review: Omit<CodeReview, "id">): Promise<CodeReview> {
    const full: CodeReview = { id: randomUUID(), ...review };
    await db.insert(codeReviewsTable).values(full);
    return full;
  }

  async getChangelog(bizId: string): Promise<ChangelogEntry[]> {
    const rows = await db.select().from(changelogEntriesTable).where(eq(changelogEntriesTable.businessId, bizId));
    return rows.map(r => ({ id: r.id, taskId: r.taskId, taskTitle: r.taskTitle, fromStatus: r.fromStatus, toStatus: r.toStatus, timestamp: r.timestamp }));
  }

  async addChangelogEntry(bizId: string, entry: Omit<ChangelogEntry, "id">): Promise<ChangelogEntry> {
    const full: ChangelogEntry = { id: randomUUID(), ...entry };
    await db.insert(changelogEntriesTable).values({ ...full, businessId: bizId });
    return full;
  }

  async getInboxItems(bizId: string): Promise<InboxItem[]> {
    const rows = await db.select().from(inboxItemsTable).where(eq(inboxItemsTable.businessId, bizId));
    return rows.map(rowToInboxItem);
  }

  async getInboxItem(bizId: string, id: string): Promise<InboxItem | undefined> {
    const rows = await db.select().from(inboxItemsTable).where(and(eq(inboxItemsTable.id, id), eq(inboxItemsTable.businessId, bizId)));
    return rows[0] ? rowToInboxItem(rows[0]) : undefined;
  }

  async addInboxItem(bizId: string, data: InsertInboxItem): Promise<InboxItem> {
    const item: InboxItem = {
      id: randomUUID(), title: data.title, type: data.type as any,
      source: data.source as any, description: data.description,
      priority: data.priority as any, status: "New",
      dateReceived: new Date().toISOString(),
      linkedProjectId: null, linkedTaskId: null, notes: data.notes,
    };
    await db.insert(inboxItemsTable).values({ ...item, businessId: bizId });
    return item;
  }

  async updateInboxItem(bizId: string, id: string, data: Partial<InboxItem>): Promise<InboxItem | undefined> {
    const rows = await db.select().from(inboxItemsTable).where(and(eq(inboxItemsTable.id, id), eq(inboxItemsTable.businessId, bizId)));
    if (rows.length === 0) return undefined;
    const updates: any = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.type !== undefined) updates.type = data.type;
    if (data.source !== undefined) updates.source = data.source;
    if (data.description !== undefined) updates.description = data.description;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.status !== undefined) updates.status = data.status;
    if (data.linkedProjectId !== undefined) updates.linkedProjectId = data.linkedProjectId;
    if (data.linkedTaskId !== undefined) updates.linkedTaskId = data.linkedTaskId;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (Object.keys(updates).length > 0) {
      await db.update(inboxItemsTable).set(updates).where(eq(inboxItemsTable.id, id));
    }
    const updated = await db.select().from(inboxItemsTable).where(eq(inboxItemsTable.id, id));
    return updated[0] ? rowToInboxItem(updated[0]) : undefined;
  }

  async deleteInboxItem(bizId: string, id: string): Promise<boolean> {
    const rows = await db.select().from(inboxItemsTable).where(and(eq(inboxItemsTable.id, id), eq(inboxItemsTable.businessId, bizId)));
    if (rows.length === 0) return false;
    await db.delete(inboxItemsTable).where(eq(inboxItemsTable.id, id));
    return true;
  }

  async assignInboxItem(bizId: string, id: string, projectId: string): Promise<{ inboxItem: InboxItem; task: Task } | undefined> {
    const item = await this.getInboxItem(bizId, id);
    if (!item) return undefined;
    const project = await this.getProject(bizId, projectId);
    if (!project) return undefined;
    const taskTypeMap: Record<string, string> = { Bug: "Bug", Feature: "Feature", Idea: "Feature", Improvement: "Task" };
    const taskType = taskTypeMap[item.type] || "Task";
    const task = await this.createTask(projectId, {
      type: taskType as any, status: "Open", priority: item.priority as any,
      title: item.title, description: item.description, reasoning: "",
      fixSteps: "", replitPrompt: "", filePath: "", repositoryId: "",
      autoAnalysisComplete: false, generatedPrompts: [],
    });
    const updatedItem = await this.updateInboxItem(bizId, id, { status: "Assigned", linkedProjectId: projectId, linkedTaskId: task.id });
    return { inboxItem: updatedItem || item, task };
  }

  async getManagerDiscussion(bizId: string): Promise<ManagerMessage[]> {
    const rows = await db.select().from(managerMessagesTable).where(eq(managerMessagesTable.businessId, bizId));
    return rows.map(rowToManagerMessage);
  }

  async addManagerMessage(bizId: string, message: Omit<ManagerMessage, "id">): Promise<ManagerMessage> {
    const full: ManagerMessage = { id: randomUUID(), ...message };
    await db.insert(managerMessagesTable).values({
      id: full.id, businessId: bizId, sender: full.sender, content: full.content,
      timestamp: full.timestamp, mode: full.mode || "chat", actions: full.actions || [],
      filesLoaded: full.filesLoaded || [], attachments: full.attachments || [],
    });
    return full;
  }

  async updateManagerMessage(bizId: string, messageId: string, updates: Partial<ManagerMessage>): Promise<ManagerMessage | undefined> {
    const rows = await db.select().from(managerMessagesTable).where(and(eq(managerMessagesTable.id, messageId), eq(managerMessagesTable.businessId, bizId)));
    if (rows.length === 0) return undefined;
    const updateData: any = {};
    if (updates.actions !== undefined) updateData.actions = updates.actions;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (Object.keys(updateData).length > 0) {
      await db.update(managerMessagesTable).set(updateData).where(eq(managerMessagesTable.id, messageId));
    }
    const updated = await db.select().from(managerMessagesTable).where(eq(managerMessagesTable.id, messageId));
    return updated[0] ? rowToManagerMessage(updated[0]) : undefined;
  }

  async clearManagerDiscussion(bizId: string): Promise<void> {
    await db.delete(managerMessagesTable).where(eq(managerMessagesTable.businessId, bizId));
  }
}
