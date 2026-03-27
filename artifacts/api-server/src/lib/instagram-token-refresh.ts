import { pool } from "@workspace/db";

const REFRESH_THRESHOLD_DAYS = 50; // refresh if token is older than 50 days

async function refreshInstagramTokens(): Promise<void> {
  console.log("[IG Token Refresh] Starting scheduled token refresh check...");

  try {
    // Find all connected Instagram channels where token hasn't been refreshed in 50+ days
    const { rows } = await pool.query(
      `SELECT id, store_id, access_token, metadata, updated_at
       FROM channel_connections
       WHERE channel = 'instagram'
       AND status = 'connected'
       AND access_token IS NOT NULL
       AND updated_at < NOW() - INTERVAL '${REFRESH_THRESHOLD_DAYS} days'`
    );

    if (rows.length === 0) {
      console.log("[IG Token Refresh] No tokens need refreshing.");
      return;
    }

    console.log(`[IG Token Refresh] Found ${rows.length} token(s) to refresh.`);

    for (const channel of rows) {
      try {
        const res = await fetch(
          `https://graph.instagram.com/refresh_access_token?` +
          new URLSearchParams({
            grant_type: "ig_refresh_token",
            access_token: channel.access_token,
          })
        );

        const data = await res.json() as any;

        if (!res.ok || !data.access_token) {
          console.error(`[IG Token Refresh] Failed for channel ${channel.id}:`, JSON.stringify(data));
          // Mark as error so owner knows to reconnect
          await pool.query(
            `UPDATE channel_connections SET status = 'error', updated_at = NOW() WHERE id = $1`,
            [channel.id]
          );
          continue;
        }

        // Save refreshed token
        await pool.query(
          `UPDATE channel_connections 
           SET access_token = $1, updated_at = NOW()
           WHERE id = $2`,
          [data.access_token, channel.id]
        );

        console.log(`[IG Token Refresh] Successfully refreshed token for channel ${channel.id} (store: ${channel.store_id}). Expires in ${data.expires_in}s`);
      } catch (err) {
        console.error(`[IG Token Refresh] Error refreshing channel ${channel.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[IG Token Refresh] Cron job error:", err);
  }
}

// Run every 24 hours
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startInstagramTokenRefreshCron(): void {
  console.log("[IG Token Refresh] Cron job started — runs every 24 hours.");

  // Run once on startup to catch any expired tokens immediately
  refreshInstagramTokens();

  // Then run every 24 hours
  setInterval(refreshInstagramTokens, INTERVAL_MS);
}