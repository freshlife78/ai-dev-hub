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

export interface IStorage {
  getBusinesses(): Promise<Business[]>;
  getBusiness(id: string): Promise<Business | undefined>;
  createBusiness(data: InsertBusiness): Promise<Business>;
  updateBusiness(id: string, data: Partial<InsertBusiness>): Promise<Business | undefined>;
  deleteBusiness(id: string): Promise<boolean>;

  getRepositories(bizId: string): Promise<RepositorySafe[]>;
  getRepository(bizId: string, repoId: string): Promise<RepositorySafe | undefined>;
  getRepositoryWithToken(repoId: string): Promise<Repository | undefined>;
  getRepositoriesWithTokens(bizId: string): Promise<Repository[]>;
  createRepository(bizId: string, data: InsertRepository): Promise<RepositorySafe>;
  updateRepository(bizId: string, repoId: string, data: Record<string, any>): Promise<RepositorySafe | undefined>;
  deleteRepository(bizId: string, repoId: string): Promise<boolean>;

  getBusinessAgents(bizId: string): Promise<AgentSafe[]>;
  addAgent(bizId: string, agent: Omit<Agent, "id">): Promise<AgentSafe | undefined>;
  updateAgent(bizId: string, agentId: string, data: Partial<Omit<Agent, "id">>): Promise<AgentSafe | undefined>;
  deleteAgent(bizId: string, agentId: string): Promise<boolean>;
  getReviewAgent(bizId: string): Promise<Agent | undefined>;

  getProjects(bizId: string): Promise<Project[]>;
  getProject(bizId: string, projectId: string): Promise<Project | undefined>;
  createProject(bizId: string, data: InsertProject): Promise<Project>;
  updateProject(bizId: string, projectId: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(bizId: string, projectId: string): Promise<boolean>;

  getTasks(projectId: string): Promise<Task[]>;
  getAllTasksForBusiness(bizId: string): Promise<{ project: Project; tasks: Task[] }[]>;
  getTask(projectId: string, taskId: string): Promise<Task | undefined>;
  createTask(projectId: string, data: InsertTask, customId?: string): Promise<Task>;
  updateTask(projectId: string, taskId: string, data: Partial<InsertTask>, bizId?: string): Promise<Task | undefined>;
  deleteTask(projectId: string, taskId: string): Promise<boolean>;
  moveTask(fromProjectId: string, toProjectId: string, taskId: string): Promise<Task | undefined>;
  bulkUpdateTasksRepository(projectId: string, repositoryId: string, onlyUnlinked: boolean): Promise<number>;

  getDiscussion(projectId: string, taskId: string): Promise<DiscussionMessage[]>;
  addDiscussionMessage(projectId: string, taskId: string, message: Omit<DiscussionMessage, "id">): Promise<DiscussionMessage | undefined>;
  updateDiscussionCodeFix(projectId: string, taskId: string, codeFixId: string, codeFix: any): Promise<void>;

  addGeneratedPrompt(projectId: string, taskId: string, prompt: { source: "code_review" | "discussion"; prompt: string; filePath?: string }): Promise<Task | undefined>;

  getCodeReviews(taskId: string): Promise<CodeReview[]>;
  addCodeReview(review: Omit<CodeReview, "id">): Promise<CodeReview>;

  getChangelog(bizId: string): Promise<ChangelogEntry[]>;
  addChangelogEntry(bizId: string, entry: Omit<ChangelogEntry, "id">): Promise<ChangelogEntry>;

  getInboxItems(bizId: string): Promise<InboxItem[]>;
  getInboxItem(bizId: string, id: string): Promise<InboxItem | undefined>;
  addInboxItem(bizId: string, data: InsertInboxItem): Promise<InboxItem>;
  updateInboxItem(bizId: string, id: string, data: Partial<InboxItem>): Promise<InboxItem | undefined>;
  deleteInboxItem(bizId: string, id: string): Promise<boolean>;
  assignInboxItem(bizId: string, id: string, projectId: string): Promise<{ inboxItem: InboxItem; task: Task } | undefined>;

  getManagerDiscussion(bizId: string): Promise<ManagerMessage[]>;
  addManagerMessage(bizId: string, message: Omit<ManagerMessage, "id">): Promise<ManagerMessage>;
  updateManagerMessage(bizId: string, messageId: string, updates: Partial<ManagerMessage>): Promise<ManagerMessage | undefined>;
  clearManagerDiscussion(bizId: string): Promise<void>;
}

import { DatabaseStorage } from "./dbStorage";
export const storage: IStorage = new DatabaseStorage();
