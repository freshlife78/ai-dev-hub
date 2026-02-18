import { z } from "zod";

export const agentTypeEnum = z.enum(["Claude", "ChatGPT", "Replit", "Other"]);

export const agentSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: agentTypeEnum,
  apiKey: z.string(),
  role: z.string(),
  isReviewAgent: z.boolean().default(false),
});

export type Agent = z.infer<typeof agentSchema>;
export type AgentSafe = Omit<Agent, "apiKey">;

export const businessSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  color: z.string(),
});

export const insertBusinessSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  color: z.string().optional().default("#58a6ff"),
});

export type Business = z.infer<typeof businessSchema>;
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;

export const repositoryTypeEnum = z.enum(["backend", "frontend", "mobile", "fullstack", "api", "other"]);

export const repositorySchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string().min(1),
  description: z.string(),
  repoUrl: z.string(),
  owner: z.string(),
  repo: z.string(),
  token: z.string(),
  type: repositoryTypeEnum.optional().default("other"),
});

export const insertRepositorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  repoUrl: z.string().optional().default(""),
  token: z.string().optional().default(""),
  type: repositoryTypeEnum.optional().default("other"),
});

export type Repository = z.infer<typeof repositorySchema>;
export type InsertRepository = z.infer<typeof insertRepositorySchema>;
export type RepositorySafe = Omit<Repository, "token">;

export const projectSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  name: z.string().min(1),
  description: z.string(),
  color: z.string(),
  relatedRepositories: z.array(z.string()).optional().default([]),
  defaultRepositoryId: z.string().optional().default(""),
});

export const insertProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  color: z.string().optional().default("#58a6ff"),
  relatedRepositories: z.array(z.string()).optional().default([]),
  defaultRepositoryId: z.string().optional().default(""),
});

export type Project = z.infer<typeof projectSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const taskTypeEnum = z.enum(["Bug", "Feature", "Task"]);
export const taskStatusEnum = z.enum(["Open", "In Progress", "Quality Review", "Done"]);
export const taskPriorityEnum = z.enum(["High", "Medium", "Low"]);

export const discussionMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(["user", "claude"]),
  content: z.string(),
  timestamp: z.string(),
  filesLoaded: z.array(z.string()).optional().default([]),
  isAutoAnalysis: z.boolean().optional().default(false),
  isReverification: z.boolean().optional().default(false),
});

export type DiscussionMessage = z.infer<typeof discussionMessageSchema>;

export const autoAnalysisResultEnum = z.enum(["complete", "incomplete", "partial"]);

export const generatedPromptSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  source: z.enum(["code_review", "discussion"]),
  prompt: z.string(),
  filePath: z.string().optional().default(""),
});

export type GeneratedPrompt = z.infer<typeof generatedPromptSchema>;

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  repositoryId: z.string().optional().default(""),
  type: taskTypeEnum,
  status: taskStatusEnum,
  priority: taskPriorityEnum,
  title: z.string().min(1),
  description: z.string(),
  reasoning: z.string(),
  fixSteps: z.string(),
  replitPrompt: z.string(),
  filePath: z.string().optional().default(""),
  discussion: z.array(discussionMessageSchema).optional().default([]),
  autoAnalysisComplete: z.boolean().optional().default(false),
  autoAnalysisResult: autoAnalysisResultEnum.optional(),
  autoAnalysisTimestamp: z.string().optional(),
  generatedPrompts: z.array(generatedPromptSchema).optional().default([]),
});

export const insertTaskSchema = taskSchema.omit({ id: true, projectId: true, discussion: true });

export type Task = z.infer<typeof taskSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskType = z.infer<typeof taskTypeEnum>;
export type TaskStatus = z.infer<typeof taskStatusEnum>;
export type TaskPriority = z.infer<typeof taskPriorityEnum>;

export const changelogEntrySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  taskTitle: z.string(),
  fromStatus: z.string(),
  toStatus: z.string(),
  timestamp: z.string(),
});

export type ChangelogEntry = z.infer<typeof changelogEntrySchema>;

export interface GitHubFile {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface FileContent {
  content: string;
  encoding: string;
  name: string;
  path: string;
  size: number;
}

export const inboxTypeEnum = z.enum(["Bug", "Feature", "Idea", "Improvement"]);
export const inboxSourceEnum = z.enum(["Customer", "Internal", "Meeting", "Other"]);
export const inboxStatusEnum = z.enum(["New", "Reviewed", "Assigned", "Dismissed"]);
export const inboxPriorityEnum = z.enum(["High", "Medium", "Low"]);

export const inboxItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  type: inboxTypeEnum,
  source: inboxSourceEnum,
  description: z.string(),
  priority: inboxPriorityEnum,
  status: inboxStatusEnum,
  dateReceived: z.string(),
  linkedProjectId: z.string().nullable(),
  linkedTaskId: z.string().nullable(),
  notes: z.string(),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;

export const insertInboxItemSchema = inboxItemSchema.omit({ id: true, dateReceived: true, linkedProjectId: true, linkedTaskId: true, status: true });
export type InsertInboxItem = z.infer<typeof insertInboxItemSchema>;

export const codeReviewSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  projectId: z.string(),
  repositoryId: z.string(),
  filePath: z.string(),
  review: z.string(),
  question: z.string().optional().default(""),
  timestamp: z.string(),
});

export type CodeReview = z.infer<typeof codeReviewSchema>;

export const managerActionTypeEnum = z.enum(["CREATE_INBOX_ITEM", "CREATE_TASK", "UPDATE_TASK_STATUS", "CREATE_PROJECT", "BULK_UPDATE_REPOSITORY", "MOVE_TASK"]);

export const managerActionSchema = z.object({
  type: managerActionTypeEnum,
  data: z.record(z.any()),
  status: z.enum(["pending", "approved", "cancelled"]).optional().default("pending"),
});

export type ManagerAction = z.infer<typeof managerActionSchema>;

export const managerMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(["user", "manager"]),
  content: z.string(),
  timestamp: z.string(),
  mode: z.enum(["chat", "briefing", "weekly"]).optional().default("chat"),
  actions: z.array(managerActionSchema).optional().default([]),
  filesLoaded: z.array(z.object({
    path: z.string(),
    repo: z.string(),
  })).optional().default([]),
  attachments: z.array(z.object({
    name: z.string(),
    content: z.string(),
    type: z.string(),
  })).optional().default([]),
});

export type ManagerMessage = z.infer<typeof managerMessageSchema>;

export const managerAlertSeverityEnum = z.enum(["critical", "warning", "info"]);

export interface ManagerAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  relatedTaskId?: string;
  relatedProjectId?: string;
}

export interface StoreData {
  businesses: Business[];
  repositories: Repository[];
  projects: Project[];
  tasks: Record<string, Task[]>;
  inbox: Record<string, InboxItem[]>;
  changelog: Record<string, ChangelogEntry[]>;
  agents: Record<string, Agent[]>;
  codeReviews: Record<string, CodeReview[]>;
  managerDiscussions: Record<string, ManagerMessage[]>;
}
