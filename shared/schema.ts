import { z } from "zod";
import { pgTable, text, varchar, boolean, jsonb } from "drizzle-orm/pg-core";

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

export const aiModelEnum = z.enum([
  "claude-sonnet-4-5-20250929",
  "claude-haiku-3-5-20241022",
  "claude-opus-4-20250514",
]);

export const codeFixFileSchema = z.object({
  path: z.string(),
  originalContent: z.string(),
  newContent: z.string(),
  description: z.string(),
});

export const codeFixSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  timestamp: z.string(),
  commitMessage: z.string(),
  description: z.string(),
  files: z.array(codeFixFileSchema),
  status: z.enum(["generated", "pr_created", "merged", "discarded"]).default("generated"),
  prUrl: z.string().optional(),
  prNumber: z.number().optional(),
  branchName: z.string().optional(),
});

export type CodeFix = z.infer<typeof codeFixSchema>;
export type CodeFixFile = z.infer<typeof codeFixFileSchema>;

export const discussionMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(["user", "claude"]),
  content: z.string(),
  timestamp: z.string(),
  filesLoaded: z.array(z.string()).optional().default([]),
  isAutoAnalysis: z.boolean().optional().default(false),
  isReverification: z.boolean().optional().default(false),
  model: aiModelEnum.optional(),
  codeFix: codeFixSchema.optional(),
});

export type DiscussionMessage = z.infer<typeof discussionMessageSchema>;
export type AIModel = z.infer<typeof aiModelEnum>;

export const AI_MODELS: { id: AIModel; label: string; description: string }[] = [
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", description: "Fast & capable" },
  { id: "claude-haiku-3-5-20241022", label: "Claude Haiku 3.5", description: "Fastest responses" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", description: "Most capable" },
];

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
  dependencies: z.array(z.string()).optional().default([]),
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

export const managerActionTypeEnum = z.enum(["CREATE_INBOX_ITEM", "CREATE_TASK", "UPDATE_TASK_STATUS", "CREATE_PROJECT", "BULK_UPDATE_REPOSITORY", "MOVE_TASK", "GENERATE_CODE_FIX"]);

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
  codeFix: codeFixSchema.optional(),
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

export const businessesTable = pgTable("businesses", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  color: varchar("color", { length: 20 }).notNull().default("#58a6ff"),
});

export const repositoriesTable = pgTable("repositories", {
  id: varchar("id").primaryKey(),
  businessId: varchar("business_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  repoUrl: text("repo_url").notNull().default(""),
  owner: varchar("owner").notNull().default(""),
  repo: varchar("repo").notNull().default(""),
  token: text("token").notNull().default(""),
  type: varchar("type", { length: 20 }).notNull().default("other"),
});

export const projectsTable = pgTable("projects", {
  id: varchar("id").primaryKey(),
  businessId: varchar("business_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  color: varchar("color", { length: 20 }).notNull().default("#58a6ff"),
  relatedRepositories: jsonb("related_repositories").$type<string[]>().notNull().default([]),
  defaultRepositoryId: varchar("default_repository_id").notNull().default(""),
});

export const tasksTable = pgTable("tasks", {
  id: varchar("id").notNull(),
  projectId: varchar("project_id").notNull(),
  repositoryId: varchar("repository_id").notNull().default(""),
  type: varchar("type", { length: 20 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("Open"),
  priority: varchar("priority", { length: 20 }).notNull().default("Medium"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  reasoning: text("reasoning").notNull().default(""),
  fixSteps: text("fix_steps").notNull().default(""),
  replitPrompt: text("replit_prompt").notNull().default(""),
  filePath: text("file_path").notNull().default(""),
  discussion: jsonb("discussion").$type<DiscussionMessage[]>().notNull().default([]),
  autoAnalysisComplete: boolean("auto_analysis_complete").notNull().default(false),
  autoAnalysisResult: varchar("auto_analysis_result", { length: 20 }),
  autoAnalysisTimestamp: text("auto_analysis_timestamp"),
  generatedPrompts: jsonb("generated_prompts").$type<GeneratedPrompt[]>().notNull().default([]),
  dependencies: jsonb("dependencies").$type<string[]>().notNull().default([]),
});

export const agentsTable = pgTable("agents", {
  id: varchar("id").primaryKey(),
  businessId: varchar("business_id").notNull(),
  name: text("name").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  apiKey: text("api_key").notNull().default(""),
  role: text("role").notNull().default(""),
  isReviewAgent: boolean("is_review_agent").notNull().default(false),
});

export const inboxItemsTable = pgTable("inbox_items", {
  id: varchar("id").primaryKey(),
  businessId: varchar("business_id").notNull(),
  title: text("title").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  source: varchar("source", { length: 20 }).notNull(),
  description: text("description").notNull().default(""),
  priority: varchar("priority", { length: 20 }).notNull().default("Medium"),
  status: varchar("status", { length: 20 }).notNull().default("New"),
  dateReceived: text("date_received").notNull(),
  linkedProjectId: varchar("linked_project_id"),
  linkedTaskId: varchar("linked_task_id"),
  notes: text("notes").notNull().default(""),
});

export const changelogEntriesTable = pgTable("changelog_entries", {
  id: varchar("id").primaryKey(),
  businessId: varchar("business_id").notNull(),
  taskId: varchar("task_id").notNull(),
  taskTitle: text("task_title").notNull(),
  fromStatus: varchar("from_status", { length: 30 }).notNull(),
  toStatus: varchar("to_status", { length: 30 }).notNull(),
  timestamp: text("timestamp").notNull(),
});

export const codeReviewsTable = pgTable("code_reviews", {
  id: varchar("id").primaryKey(),
  taskId: varchar("task_id").notNull(),
  projectId: varchar("project_id").notNull(),
  repositoryId: varchar("repository_id").notNull(),
  filePath: text("file_path").notNull().default(""),
  review: text("review").notNull().default(""),
  question: text("question").notNull().default(""),
  timestamp: text("timestamp").notNull(),
});

export const managerMessagesTable = pgTable("manager_messages", {
  id: varchar("id").primaryKey(),
  businessId: varchar("business_id").notNull(),
  sender: varchar("sender", { length: 20 }).notNull(),
  content: text("content").notNull(),
  timestamp: text("timestamp").notNull(),
  mode: varchar("mode", { length: 20 }).notNull().default("chat"),
  actions: jsonb("actions").$type<ManagerAction[]>().notNull().default([]),
  filesLoaded: jsonb("files_loaded").$type<{ path: string; repo: string }[]>().notNull().default([]),
  attachments: jsonb("attachments").$type<{ name: string; content: string; type: string }[]>().notNull().default([]),
  codeFix: jsonb("code_fix").$type<CodeFix>(),
});
