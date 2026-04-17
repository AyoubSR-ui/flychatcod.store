import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("./lib/db/node_modules/pg");

const DATABASE_URL =
  "postgresql://postgres:UVMKQunzpnrMCGXafgyOPbexXQtgGSGE@autorack.proxy.rlwy.net:14102/railway";

const raw = readFileSync("./backup.sql", "utf8");
const lines = raw.split("\n");

// ── Parser ────────────────────────────────────────────────────────────────────
// Returns array of { type: 'sql'|'copy', sql?, table?, columns?, rows? }
function parse(lines) {
  const chunks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip psql meta-commands (\restrict, \unrestrict, etc.)
    if (/^\\./.test(line.trim())) { i++; continue; }

    // Detect COPY block
    const copyMatch = line.match(/^COPY\s+(\S+)\s+\(([^)]+)\)\s+FROM\s+stdin\s*;/i);
    if (copyMatch) {
      const table = copyMatch[1];
      const columns = copyMatch[2].split(",").map(c => c.trim());
      const rows = [];
      i++;
      while (i < lines.length && lines[i] !== "\\.") {
        if (lines[i] !== "") rows.push(lines[i]);
        i++;
      }
      i++; // skip \.
      chunks.push({ type: "copy", table, columns, rows });
      continue;
    }

    // Accumulate a SQL statement (ends with ;)
    let stmt = "";
    while (i < lines.length) {
      const l = lines[i];
      i++;
      if (/^\\./.test(l.trim())) break; // psql meta
      stmt += l + "\n";
      if (l.trimEnd().endsWith(";")) break;
    }
    const trimmed = stmt.trim();
    if (trimmed && trimmed !== ";") {
      chunks.push({ type: "sql", sql: trimmed });
    }
  }

  return chunks;
}

// ── Value escaping ────────────────────────────────────────────────────────────
function escapePgLiteral(val) {
  if (val === "\\N") return "NULL";
  // Boolean literals
  if (val === "t") return "true";
  if (val === "f") return "false";
  // Escape single quotes and backslashes
  const escaped = val.replace(/\\/g, "\\\\").replace(/'/g, "''");
  return `'${escaped}'`;
}

// Convert a COPY chunk to batched INSERT statements
function copyToInserts(chunk) {
  if (chunk.rows.length === 0) return [];
  const { table, columns, rows } = chunk;
  const colList = columns.join(", ");
  const inserts = [];
  const BATCH = 50;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const valuesClauses = batch.map(row => {
      const fields = row.split("\t");
      const vals = columns.map((_, idx) => {
        const v = fields[idx] ?? "\\N";
        return escapePgLiteral(v);
      });
      return `(${vals.join(", ")})`;
    });
    inserts.push(
      `INSERT INTO ${table} (${colList}) VALUES\n${valuesClauses.join(",\n")}\nON CONFLICT DO NOTHING;`
    );
  }
  return inserts;
}

// ── Restore ───────────────────────────────────────────────────────────────────
async function restore() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("✓ Connected to Railway PostgreSQL\n");

  const chunks = parse(lines);
  console.log(`Parsed ${chunks.length} chunks (SQL + COPY blocks)\n`);

  let ok = 0, skipped = 0, errors = 0;

  async function run(sql, label) {
    try {
      await client.query(sql);
      ok++;
    } catch (err) {
      const msg = err.message;
      if (
        msg.includes("already exists") ||
        msg.includes("duplicate key") ||
        msg.includes("multiple primary keys") ||
        msg.includes("does not exist") && msg.includes("constraint")
      ) {
        skipped++;
      } else {
        console.warn(`  [WARN] ${label}: ${msg.slice(0, 100)}`);
        errors++;
      }
    }
  }

  // Phase 1: DDL (CREATE TYPE, CREATE TABLE, etc.)
  console.log("── Phase 1: DDL ─────────────────────────────────────");
  for (const chunk of chunks) {
    if (chunk.type !== "sql") continue;
    const upper = chunk.sql.toUpperCase();
    if (
      upper.startsWith("CREATE TYPE") ||
      upper.startsWith("CREATE TABLE") ||
      upper.startsWith("CREATE SEQUENCE") ||
      upper.startsWith("CREATE INDEX") ||
      upper.startsWith("CREATE UNIQUE") ||
      upper.startsWith("ALTER TABLE") ||
      upper.startsWith("SET ") ||
      upper.startsWith("SELECT PG_CATALOG")
    ) {
      await run(chunk.sql, chunk.sql.slice(0, 60).replace(/\n/g, " "));
    }
  }
  console.log(`  DDL done: ${ok} ok, ${skipped} skipped, ${errors} errors\n`);

  // Phase 2: Data (COPY blocks → INSERT)
  const dataBefore = ok; const errBefore = errors;
  console.log("── Phase 2: Data ────────────────────────────────────");
  for (const chunk of chunks) {
    if (chunk.type !== "copy") continue;
    if (chunk.rows.length === 0) {
      console.log(`  ${chunk.table}: 0 rows, skip`);
      continue;
    }
    const inserts = copyToInserts(chunk);
    for (const ins of inserts) {
      await run(ins, `INSERT into ${chunk.table}`);
    }
    console.log(`  ${chunk.table}: ${chunk.rows.length} rows`);
  }
  console.log(`  Data done: ${ok - dataBefore} ok, ${errors - errBefore} errors\n`);

  // Phase 3: Sequences
  console.log("── Phase 3: Sequences / Indexes ─────────────────────");
  for (const chunk of chunks) {
    if (chunk.type !== "sql") continue;
    const upper = chunk.sql.toUpperCase();
    if (upper.startsWith("SELECT SETVAL") || upper.startsWith("SETVAL")) {
      await run(chunk.sql, "setval");
    }
  }
  console.log(`  Done\n`);

  // ── Verify ────────────────────────────────────────────────────────────────
  console.log("── Verification ─────────────────────────────────────");
  const tables = [
    "stores", "users", "organizations", "conversations",
    "messages", "orders", "order_items", "customers",
    "products", "channel_connections", "team_members",
  ];
  for (const t of tables) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*) FROM public.${t}`);
      console.log(`  ${t.padEnd(22)}: ${rows[0].count} rows`);
    } catch {
      console.log(`  ${t.padEnd(22)}: not found`);
    }
  }

  await client.end();
  console.log("\n✓ Restore complete");
}

restore().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
