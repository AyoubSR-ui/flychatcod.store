import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Host + database name only — never credentials. process.env.DATABASE_URL
// itself (or any prefix of it) must never reach a log line: for a typical
// postgresql://user:password@host:port/db string the password sits right
// after the first ':', so even a truncated slice can leak it.
function describeConnection(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

console.log("[DB] Connecting to:", describeConnection(process.env.DATABASE_URL));
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
