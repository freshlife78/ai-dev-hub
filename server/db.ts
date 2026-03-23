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
    const taskCols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'`
    );
    const taskExisting = new Set(taskCols.rows.map((r: any) => r.column_name));

    if (!taskExisting.has("dependencies")) {
      await client.query(
        `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '[]'::jsonb`
      );
      console.log("[db] Added missing column: tasks.dependencies");
    }

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
    const ticketsExists = await client.query(
      `SELECT to_regclass('public.tickets') AS cls`
    );
    if (!ticketsExists.rows[0]?.cls) {
      await client.query(`
        CREATE TABLE tickets (
          id              serial PRIMARY KEY,
          reporter_type   text NOT NULL,
          reporter_name   text,
          reporter_id     text,
          lane            text,
          urgency         text DEFAULT 'normal',
          status          text DEFAULT 'open',
          title           text,
          description     text NOT NULL,
          page_url        text,
          route_id        integer,
          screenshot_urls jsonb DEFAULT '[]',
          triage_notes    text,
          triage_confidence integer,
          assigned_agent  text,
          branch_name     text,
          feedback        text,
          created_at      timestamptz DEFAULT now(),
          updated_at      timestamptz DEFAULT now()
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
