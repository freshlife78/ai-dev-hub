import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
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
import type { StoreData } from "@shared/schema";

const STORE_PATH = path.join(process.cwd(), "data", "store.json");

export async function seedData() {
  const existingBiz = await db.select().from(businessesTable);
  if (existingBiz.length > 0) {
    return;
  }

  if (fs.existsSync(STORE_PATH)) {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const data = JSON.parse(raw) as StoreData;
    if (data.businesses && data.businesses.length > 0) {
      await migrateJsonToDb(data);
      return;
    }
  }

  await db.insert(businessesTable).values({ id: "B1", name: "Cool Dispatch", description: "Fleet logistics app", color: "#58a6ff" });
  await db.insert(repositoriesTable).values({
    id: "R1", businessId: "B1", name: "cooldispatch", description: "Main application repository",
    repoUrl: "https://github.com/freshlife78/cooldispatch", owner: "freshlife78", repo: "cooldispatch", token: "", type: "fullstack",
  });
  await db.insert(projectsTable).values([
    { id: "P1", businessId: "B1", name: "Samsara Integration", description: "Routes, driver sync & API connectivity", color: "#58a6ff", relatedRepositories: ["R1"], defaultRepositoryId: "" },
    { id: "P2", businessId: "B1", name: "Account Migration", description: "User-centric to company-centric fixes", color: "#f78166", relatedRepositories: ["R1"], defaultRepositoryId: "" },
  ]);

  const seedTasks = [
    { id: "BUG-001", projectId: "P1", repositoryId: "R1", type: "Bug", status: "Open", priority: "High", title: "Samsara API: Driver assignment not syncing", description: "Route #10 shows driver Jatinder correctly assigned in the app and saved to the database, but the assignment was never pushed to Samsara.", reasoning: "", fixSteps: "", replitPrompt: "", filePath: "", discussion: [], autoAnalysisComplete: false, generatedPrompts: [] },
    { id: "ARCH-001", projectId: "P1", repositoryId: "R1", type: "Bug", status: "Open", priority: "High", title: "Samsara sync failure warning not shown to admin", description: "When a driver is assigned to a route and the Samsara sync fails, the admin UI is not displaying the warning.", reasoning: "", fixSteps: "", replitPrompt: "", filePath: "", discussion: [], autoAnalysisComplete: false, generatedPrompts: [] },
    { id: "ARCH-002", projectId: "P2", repositoryId: "R1", type: "Task", status: "Open", priority: "High", title: "Route ownership split across userId, accountId, companyId", description: "Route requests use a three-way ownership check.", reasoning: "", fixSteps: "", replitPrompt: "", filePath: "", discussion: [], autoAnalysisComplete: false, generatedPrompts: [] },
  ];
  for (const t of seedTasks) {
    await db.insert(tasksTable).values(t);
  }

  await db.insert(inboxItemsTable).values([
    { id: randomUUID(), businessId: "B1", title: "Payment processing fails for international cards", type: "Bug", source: "Customer", description: "Customer reports international credit cards being declined.", priority: "High", status: "New", dateReceived: new Date().toISOString(), notes: "" },
    { id: randomUUID(), businessId: "B1", title: "Drivers want to see their weekly earnings summary", type: "Feature", source: "Customer", description: "Multiple drivers have requested a weekly earnings summary.", priority: "Medium", status: "New", dateReceived: new Date().toISOString(), notes: "" },
  ]);
}

async function migrateJsonToDb(data: StoreData) {
  console.log("[Migration] Starting JSON to database migration...");

  for (const biz of data.businesses) {
    await db.insert(businessesTable).values(biz).onConflictDoNothing();
  }
  console.log(`[Migration] Migrated ${data.businesses.length} businesses`);

  for (const repo of data.repositories) {
    await db.insert(repositoriesTable).values({
      id: repo.id, businessId: repo.businessId, name: repo.name,
      description: repo.description || "", repoUrl: repo.repoUrl || "",
      owner: repo.owner || "", repo: repo.repo || "", token: repo.token || "",
      type: repo.type || "other",
    }).onConflictDoNothing();
  }
  console.log(`[Migration] Migrated ${data.repositories.length} repositories`);

  for (const proj of data.projects) {
    await db.insert(projectsTable).values({
      id: proj.id, businessId: proj.businessId, name: proj.name,
      description: proj.description || "", color: proj.color || "#58a6ff",
      relatedRepositories: proj.relatedRepositories || [],
      defaultRepositoryId: (proj as any).defaultRepositoryId || "",
    }).onConflictDoNothing();
  }
  console.log(`[Migration] Migrated ${data.projects.length} projects`);

  let taskCount = 0;
  for (const [projectId, tasks] of Object.entries(data.tasks || {})) {
    for (const task of tasks) {
      await db.insert(tasksTable).values({
        id: task.id, projectId: task.projectId || projectId,
        repositoryId: task.repositoryId || "", type: task.type,
        status: task.status, priority: task.priority, title: task.title,
        description: task.description || "", reasoning: task.reasoning || "",
        fixSteps: task.fixSteps || "", replitPrompt: task.replitPrompt || "",
        filePath: task.filePath || "", discussion: task.discussion || [],
        autoAnalysisComplete: task.autoAnalysisComplete || false,
        autoAnalysisResult: task.autoAnalysisResult || null,
        autoAnalysisTimestamp: task.autoAnalysisTimestamp || null,
        generatedPrompts: task.generatedPrompts || [],
      }).onConflictDoNothing();
      taskCount++;
    }
  }
  console.log(`[Migration] Migrated ${taskCount} tasks`);

  for (const [bizId, agents] of Object.entries(data.agents || {})) {
    for (const agent of agents) {
      await db.insert(agentsTable).values({
        id: agent.id, businessId: bizId, name: agent.name, type: agent.type,
        apiKey: agent.apiKey || "", role: agent.role || "",
        isReviewAgent: agent.isReviewAgent || false,
      }).onConflictDoNothing();
    }
  }
  console.log(`[Migration] Migrated agents`);

  let inboxCount = 0;
  for (const [bizId, items] of Object.entries(data.inbox || {})) {
    for (const item of items) {
      await db.insert(inboxItemsTable).values({
        id: item.id, businessId: bizId, title: item.title, type: item.type,
        source: item.source, description: item.description || "",
        priority: item.priority, status: item.status,
        dateReceived: item.dateReceived, linkedProjectId: item.linkedProjectId || null,
        linkedTaskId: item.linkedTaskId || null, notes: item.notes || "",
      }).onConflictDoNothing();
      inboxCount++;
    }
  }
  console.log(`[Migration] Migrated ${inboxCount} inbox items`);

  let changelogCount = 0;
  for (const [bizId, entries] of Object.entries(data.changelog || {})) {
    for (const entry of entries) {
      await db.insert(changelogEntriesTable).values({
        id: entry.id, businessId: bizId, taskId: entry.taskId,
        taskTitle: entry.taskTitle, fromStatus: entry.fromStatus,
        toStatus: entry.toStatus, timestamp: entry.timestamp,
      }).onConflictDoNothing();
      changelogCount++;
    }
  }
  console.log(`[Migration] Migrated ${changelogCount} changelog entries`);

  for (const [_taskId, reviews] of Object.entries(data.codeReviews || {})) {
    for (const review of reviews) {
      await db.insert(codeReviewsTable).values({
        id: review.id, taskId: review.taskId, projectId: review.projectId,
        repositoryId: review.repositoryId, filePath: review.filePath || "",
        review: review.review || "", question: review.question || "",
        timestamp: review.timestamp,
      }).onConflictDoNothing();
    }
  }
  console.log(`[Migration] Migrated code reviews`);

  let msgCount = 0;
  for (const [bizId, messages] of Object.entries(data.managerDiscussions || {})) {
    for (const msg of messages) {
      await db.insert(managerMessagesTable).values({
        id: msg.id, businessId: bizId, sender: msg.sender, content: msg.content,
        timestamp: msg.timestamp, mode: msg.mode || "chat",
        actions: msg.actions || [], filesLoaded: msg.filesLoaded || [],
        attachments: msg.attachments || [],
      }).onConflictDoNothing();
      msgCount++;
    }
  }
  console.log(`[Migration] Migrated ${msgCount} manager messages`);
  console.log("[Migration] JSON to database migration complete!");
}
