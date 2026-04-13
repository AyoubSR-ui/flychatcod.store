import { createServer } from "http";
import app from "./app";
import { setupSocketIO } from "./socket.js";
import { startInstagramTokenRefreshCron } from "./lib/instagram-token-refresh.js";
import { pool } from "@workspace/db";

async function runMigrations() {
  try {
    await pool.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(store_id, is_archived);
    `);
    console.log("[Migration] is_archived column ready");
  } catch (err) {
    console.error("[Migration] Failed:", err);
  }
}


const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
setupSocketIO(httpServer);
startInstagramTokenRefreshCron();

runMigrations().then(() => {
  httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
