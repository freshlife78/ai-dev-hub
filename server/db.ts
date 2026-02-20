import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function ensureSchemaUpToDate() {
  const client = await pool.connect();
  try {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'`
    );
    const existing = new Set(cols.rows.map((r: any) => r.column_name));

    if (!existing.has("dependencies")) {
      await client.query(
        `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '[]'::jsonb`
      );
      console.log("[db] Added missing column: tasks.dependencies");
    }
  } catch (err) {
    console.error("[db] Schema migration error:", err);
  } finally {
    client.release();
  }
}
