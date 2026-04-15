import { createServer } from "http";
import app from "./app";
import { setupSocketIO } from "./socket.js";
import { startInstagramTokenRefreshCron } from "./lib/instagram-token-refresh.js";
import { pool } from "@workspace/db";
import { syncInstagramOutgoing } from "./routes/sync.js";

async function runMigrations() {
  try {
    await pool.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(store_id, is_archived);
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id ON messages(external_id) WHERE external_id IS NOT NULL;
    `);
    console.log("[Migration] Schema ready (is_archived, messages.external_id unique index)");
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

  // Sync Instagram outgoing messages every 6 hours
  setInterval(async () => {
    try {
      const result = await syncInstagramOutgoing();
      console.log(`[Sync] Instagram outgoing sync completed — synced: ${result.synced}, skipped: ${result.skipped}`);
    } catch (err) {
      console.error("[Sync] Instagram sync failed:", err);
    }
  }, 6 * 60 * 60 * 1000);
});
