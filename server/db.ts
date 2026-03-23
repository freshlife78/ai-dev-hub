import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });

export async function ensureSchemaUpToDate() {
  const client = await pool.connect();
  try {
    // ── tasks ──────────────────────────────────────────────────────────────
    const taskCols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'`
    );
    const taskExisting = new Set(taskCols.rows.map((r: any) => r.column_name));

    const taskMigrations: [string, string][] = [
      ["dependencies",          `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '[]'::jsonb`],
      ["source",                `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source varchar(30) NOT NULL DEFAULT ''`],
      ["repository_id",         `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repository_id varchar NOT NULL DEFAULT ''`],
      ["reasoning",             `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reasoning text NOT NULL DEFAULT ''`],
      ["fix_steps",             `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS fix_steps text NOT NULL DEFAULT ''`],
      ["replit_prompt",         `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS replit_prompt text NOT NULL DEFAULT ''`],
      ["file_path",             `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS file_path text NOT NULL DEFAULT ''`],
      ["discussion",            `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS discussion jsonb NOT NULL DEFAULT '[]'::jsonb`],
      ["auto_analysis_complete",`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_analysis_complete boolean NOT NULL DEFAULT false`],
      ["auto_analysis_result",  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_analysis_result varchar(20)`],
      ["auto_analysis_timestamp",`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_analysis_timestamp text`],
      ["generated_prompts",     `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS generated_prompts jsonb NOT NULL DEFAULT '[]'::jsonb`],
    ];

    for (const [col, sql] of taskMigrations) {
      if (!taskExisting.has(col)) {
        await client.query(sql);
        console.log(`[db] Added missing column: tasks.${col}`);
      }
    }

    // ── inbox_items ────────────────────────────────────────────────────────
    const inboxExists = await client.query(
      `SELECT to_regclass('public.inbox_items') AS cls`
    );
    if (!inboxExists.rows[0]?.cls) {
      await client.query(`
        CREATE TABLE inbox_items (
          id                varchar PRIMARY KEY,
          business_id       varchar NOT NULL,
          title             text NOT NULL,
          type              varchar(20) NOT NULL,
          source            varchar(20) NOT NULL,
          description       text NOT NULL DEFAULT '',
          priority          varchar(20) NOT NULL DEFAULT 'Medium',
          status            varchar(20) NOT NULL DEFAULT 'New',
          date_received     text NOT NULL,
          linked_project_id varchar,
          linked_task_id    varchar,
          notes             text NOT NULL DEFAULT ''
        )
      `);
      console.log("[db] Created table: inbox_items");
    } else {
      const inboxCols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'inbox_items'`
      );
      const inboxExisting = new Set(inboxCols.rows.map((r: any) => r.column_name));

      const inboxMigrations: [string, string][] = [
        ["source",            `ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT ''`],
        ["description",       `ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''`],
        ["priority",          `ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'Medium'`],
        ["status",            `ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'New'`],
        ["linked_project_id", `ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS linked_project_id varchar`],
        ["linked_task_id",    `ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS linked_task_id varchar`],
        ["notes",             `ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT ''`],
      ];

      for (const [col, sql] of inboxMigrations) {
        if (!inboxExisting.has(col)) {
          await client.query(sql);
          console.log(`[db] Added missing column: inbox_items.${col}`);
        }
      }
    }

    // ── manager_messages ───────────────────────────────────────────────────
    const mgrCols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'manager_messages'`
    );
    const mgrExisting = new Set(mgrCols.rows.map((r: any) => r.column_name));

    if (!mgrExisting.has("code_fix")) {
      await client.query(
        `ALTER TABLE manager_messages ADD COLUMN IF NOT EXISTS code_fix jsonb`
      );
      console.log("[db] Added missing column: manager_messages.code_fix");
    }

    // ── tickets ────────────────────────────────────────────────────────────
    const ticketsExists = await client.query(
      `SELECT to_regclass('public.tickets') AS cls`
    );
    if (!ticketsExists.rows[0]?.cls) {
      await client.query(`
        CREATE TABLE tickets (
          id                  serial PRIMARY KEY,
          reporter_type       text NOT NULL,
          reporter_name       text,
          reporter_id         text,
          lane                text,
          urgency             text DEFAULT 'normal',
          status              text DEFAULT 'open',
          title               text,
          description         text NOT NULL,
          page_url            text,
          route_id            integer,
          screenshot_urls     jsonb DEFAULT '[]',
          triage_notes        text,
          triage_confidence   integer,
          assigned_agent      text,
          branch_name         text,
          feedback            text,
          created_at          timestamptz DEFAULT now(),
          updated_at          timestamptz DEFAULT now()
        )
      `);
      console.log("[db] Created table: tickets");
    }
  } catch (err) {
    console.error("[db] Schema migration error:", err);
  } finally {
    client.release();
  }
}
