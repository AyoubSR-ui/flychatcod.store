import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/lead-stats", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;

    if (!storeId) {
      res.json({ stats: null, topRefs: [], dropOff: [] });
      return;
    }

    const { rows } = await pool.query(
      `SELECT
        COUNT(*) as total_conversations,
        COUNT(CASE WHEN lead_stage = 'interested' THEN 1 END) as interested,
        COUNT(CASE WHEN lead_stage = 'engaged' THEN 1 END) as engaged,
        COUNT(CASE WHEN lead_stage = 'qualified_lead' THEN 1 END) as qualified,
        COUNT(CASE WHEN order_stage = 'order_confirmed' THEN 1 END) as confirmed,
        COUNT(CASE WHEN intent_level = 'high' THEN 1 END) as high_intent,
        ROUND(
          COUNT(CASE WHEN lead_stage = 'qualified_lead' THEN 1 END)::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as qualification_rate,
        ROUND(
          COUNT(CASE WHEN order_stage = 'order_confirmed' THEN 1 END)::numeric /
          NULLIF(COUNT(CASE WHEN lead_stage = 'qualified_lead' THEN 1 END), 0) * 100, 1
        ) as conversion_rate
      FROM conversations
      WHERE store_id = $1
        AND created_at > NOW() - INTERVAL '30 days'`,
      [storeId]
    );

    const { rows: topRefs } = await pool.query(
      `SELECT
        ad_ref,
        COUNT(*) as total,
        COUNT(CASE WHEN lead_stage = 'qualified_lead' THEN 1 END) as qualified
      FROM conversations
      WHERE store_id = $1 AND ad_ref IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY ad_ref
      ORDER BY qualified DESC
      LIMIT 10`,
      [storeId]
    );

    const { rows: dropOff } = await pool.query(
      `SELECT
        lead_stage,
        COUNT(*) as count,
        ROUND(AVG(message_count), 1) as avg_messages
      FROM (
        SELECT
          c.lead_stage,
          COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.store_id = $1
          AND c.created_at > NOW() - INTERVAL '30 days'
        GROUP BY c.id, c.lead_stage
      ) sub
      GROUP BY lead_stage
      ORDER BY
        CASE lead_stage
          WHEN 'interested' THEN 1
          WHEN 'engaged' THEN 2
          WHEN 'qualified_lead' THEN 3
          WHEN 'order_confirmed' THEN 4
          ELSE 5
        END`,
      [storeId]
    );

    const { rows: recentQualified } = await pool.query(
      `SELECT id, customer_name, channel, lead_wilaya, lead_phone, lead_size,
              intent_level, qualified_at, updated_at
       FROM conversations
       WHERE store_id = $1 AND lead_stage = 'qualified_lead'
       ORDER BY qualified_at DESC NULLS LAST, updated_at DESC
       LIMIT 10`,
      [storeId]
    );

    res.json({
      stats: rows[0],
      topRefs,
      dropOff,
      recentQualified,
    });
  } catch (err) {
    console.error("[Analytics] lead-stats failed:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ─── Communication Optimizer ──────────────────────────────────────────────────

const AGENT_URL = process.env.AI_AGENT_URL;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

async function proxyToOptimizer(path: string, body: unknown) {
  if (!AGENT_URL) throw new Error("AI_AGENT_URL not configured");
  const res = await fetch(`${AGENT_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-secret": AGENT_SECRET,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Optimizer error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Shared helper: fetch qualifying conversations for a store ─────────────────
async function fetchOptimizerConversations(storeId: string, limit = 150) {
  const { rows } = await pool.query(`
    SELECT
      c.id            AS conversation_id,
      c.store_id,
      c.lead_stage,
      c.intent_level,
      c.order_stage,
      c.qualified_at,
      c.confirmed_at,
      c.channel,
      COUNT(m.id)     AS message_count,
      json_agg(
        json_build_object(
          'sender',     m.sender,
          'content',    m.content,
          'created_at', m.created_at
        ) ORDER BY m.created_at
      ) AS messages
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    WHERE c.store_id = $1
      AND c.created_at > NOW() - INTERVAL '30 days'
      AND (
        c.lead_stage IN ('engaged', 'qualified_lead', 'order_confirmed')
        OR c.intent_level = 'high'
      )
    GROUP BY c.id
    HAVING COUNT(m.id) >= 6
    ORDER BY c.created_at DESC
    LIMIT $2
  `, [storeId, limit]);

  return rows.map((c: any) => ({
    conversation_id: c.conversation_id,
    store_id: c.store_id,
    messages: c.messages,
    outcome: c.order_stage === "order_confirmed" ? "confirmed" : c.lead_stage,
    lead_stage: c.lead_stage,
    order_confirmed: c.order_stage === "order_confirmed",
    message_count: parseInt(c.message_count, 10),
    qualified_at: c.qualified_at,
    confirmed_at: c.confirmed_at,
    channel: c.channel,
  }));
}

// ── Helper: get store plan ────────────────────────────────────────────────────
async function getStorePlan(storeId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT s.organization_id, sub.plan
     FROM stores s
     LEFT JOIN subscriptions sub ON sub.organization_id = s.organization_id
     WHERE s.id = $1 LIMIT 1`,
    [storeId]
  );
  return rows[0]?.plan ?? "starter";
}

// GET /api/analytics/optimizer/estimate
// Estimates credit cost before running — no API calls, no credit deduction
router.post("/optimizer/estimate", requireAuth, async (req, res) => {
  try {
    if (!AGENT_URL) {
      res.json({ ready_to_run: false, error: "AI agent not configured" });
      return;
    }
    const storeId = req.user!.storeId!;
    const plan = await getStorePlan(storeId);
    const conversations = await fetchOptimizerConversations(storeId, 150);

    if (!conversations.length) {
      res.json({
        ready_to_run: false,
        conversations_available: 0,
        conversations_to_analyze: 0,
        credits_required: 0,
        message: "No qualifying conversations found in the last 30 days."
      });
      return;
    }

    const result = await proxyToOptimizer("/optimize/estimate", {
      conversations,
      storeId,
      plan,
    });
    res.json(result);
  } catch (err: any) {
    console.error("[Optimizer] Estimate failed:", err);
    res.status(500).json({ error: "Estimate failed", detail: err?.message });
  }
});

// POST /api/analytics/optimizer/run
// Fetches last 30 days of qualified conversations and sends to Python for analysis
router.post("/optimizer/run", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId!;
    const plan = await getStorePlan(storeId);
    const conversations = await fetchOptimizerConversations(storeId, 150);

    if (!conversations.length) {
      res.json({ status: "no_data", message: "No qualifying conversations found in the last 30 days." });
      return;
    }

    const result = await proxyToOptimizer("/optimize", {
      conversations,
      storeId,
      plan,
      autoApprove: false,
    });

    res.json(result);
  } catch (err: any) {
    console.error("[Optimizer] Run failed:", err);
    res.status(500).json({ error: "Optimizer run failed", detail: err?.message });
  }
});

// POST /api/analytics/optimizer/approve
router.post("/optimizer/approve", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId!;
    const result = await proxyToOptimizer("/optimize/approve", { storeId });
    res.json(result);
  } catch (err: any) {
    console.error("[Optimizer] Approve failed:", err);
    res.status(500).json({ error: "Approve failed", detail: err?.message });
  }
});

// GET /api/analytics/optimizer/status
router.get("/optimizer/status", requireAuth, async (req, res) => {
  try {
    if (!AGENT_URL) { res.json({ has_pending: false, has_approved: false }); return; }
    const storeId = req.user!.storeId!;
    const result = await fetch(`${AGENT_URL}/optimize/status?storeId=${storeId}`, {
      headers: { "x-agent-secret": AGENT_SECRET },
    });
    res.json(await result.json());
  } catch (err: any) {
    console.error("[Optimizer] Status failed:", err);
    res.json({ has_pending: false, has_approved: false });
  }
});

// ─── TEMPORARY — one-time lead-stage backfill for pre-existing conversations ──
// Real lead_stage values (verified against lib/lead-intent.ts and how this
// same file already queries them above): 'interested' | 'engaged' |
// 'qualified_lead' | 'order_confirmed' — NOT 'qualified'/'confirmed'. Gated
// behind requireAuth (not a hardcoded secret) and scoped to the calling
// user's own store — remove this route once the backfill has been run.
router.post("/admin/backfill-lead-stages", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    const results: any = {};

    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'interested'`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS intent_level TEXT DEFAULT 'low'`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMP`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_phone TEXT`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_wilaya TEXT`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_color TEXT`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_size TEXT`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_product TEXT`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_delivery_type TEXT`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'interested'`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_id TEXT`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS channel TEXT`);
    results.columns = "added";

    const r1 = await pool.query(
      `UPDATE conversations SET lead_stage = 'interested', intent_level = 'low' WHERE store_id = $1`,
      [storeId]
    );
    results.resetToInterested = r1.rowCount;

    // Engaged — a customer message contains what looks like an Algerian mobile number.
    const r2 = await pool.query(`
      UPDATE conversations
      SET lead_stage = 'engaged', intent_level = 'medium'
      WHERE store_id = $1
        AND lead_stage = 'interested'
        AND id IN (
          SELECT DISTINCT conversation_id FROM messages
          WHERE sender = 'customer' AND conversation_id IS NOT NULL
            AND (
              content LIKE '%0550%' OR content LIKE '%0560%' OR content LIKE '%0570%' OR
              content LIKE '%0660%' OR content LIKE '%0661%' OR content LIKE '%0662%' OR
              content LIKE '%0770%' OR content LIKE '%0771%' OR content LIKE '%0772%' OR
              content LIKE '%0780%' OR content LIKE '%0790%' OR content LIKE '%0540%' OR
              content LIKE '%0541%' OR content LIKE '%0561%' OR content LIKE '%0699%' OR
              content LIKE '%0698%' OR content LIKE '%+213%'
            )
        )`,
      [storeId]
    );
    results.engaged = r2.rowCount;

    // Qualified lead — an order exists off this conversation.
    const r3 = await pool.query(`
      UPDATE conversations
      SET lead_stage = 'qualified_lead', intent_level = 'high', qualified_at = COALESCE(qualified_at, NOW())
      WHERE store_id = $1
        AND id IN (SELECT DISTINCT conversation_id FROM orders WHERE conversation_id IS NOT NULL AND store_id = $1)`,
      [storeId]
    );
    results.qualifiedLead = r3.rowCount;

    // Order confirmed — the order actually progressed past confirmation.
    const r4 = await pool.query(`
      UPDATE conversations
      SET lead_stage = 'order_confirmed', confirmed_at = COALESCE(confirmed_at, NOW())
      WHERE store_id = $1
        AND id IN (
          SELECT DISTINCT conversation_id FROM orders
          WHERE conversation_id IS NOT NULL AND store_id = $1
            AND status IN ('confirmed', 'self_confirmed', 'shipped', 'delivered')
        )`,
      [storeId]
    );
    results.orderConfirmed = r4.rowCount;

    // Sync to customers — highest-ranked stage across all of a customer's conversations.
    await pool.query(`
      UPDATE customers c SET lead_stage = conv_data.best_stage
      FROM (
        SELECT customer_id,
          CASE MAX(CASE lead_stage WHEN 'order_confirmed' THEN 4 WHEN 'qualified_lead' THEN 3 WHEN 'engaged' THEN 2 ELSE 1 END)
            WHEN 4 THEN 'order_confirmed' WHEN 3 THEN 'qualified_lead' WHEN 2 THEN 'engaged' ELSE 'interested'
          END AS best_stage
        FROM conversations WHERE store_id = $1 AND customer_id IS NOT NULL GROUP BY customer_id
      ) conv_data
      WHERE c.id = conv_data.customer_id AND c.store_id = $1`,
      [storeId]
    );
    results.customerSync = "done";

    await pool.query(`
      UPDATE customers c SET meta_id = sub.external_id, channel = sub.channel::text
      FROM (
        SELECT DISTINCT ON (customer_id) customer_id, external_id, channel
        FROM conversations
        WHERE store_id = $1 AND customer_id IS NOT NULL AND channel IN ('messenger', 'instagram')
          AND external_id IS NOT NULL AND external_id != '' AND external_id != 'pending' AND LENGTH(external_id) > 5
        ORDER BY customer_id, created_at DESC
      ) sub
      WHERE c.id = sub.customer_id AND c.store_id = $1`,
      [storeId]
    );
    results.metaIdSync = "done";

    const { rows: convCounts } = await pool.query(
      `SELECT lead_stage, COUNT(*) FROM conversations WHERE store_id = $1 GROUP BY lead_stage ORDER BY COUNT(*) DESC`,
      [storeId]
    );
    results.conversationCounts = convCounts;

    const { rows: custCounts } = await pool.query(
      `SELECT lead_stage, COUNT(*) FROM customers WHERE store_id = $1 GROUP BY lead_stage ORDER BY COUNT(*) DESC`,
      [storeId]
    );
    results.customerCounts = custCounts;

    console.log("[Backfill] Complete:", results);
    res.json({ success: true, results });
  } catch (err: any) {
    console.error("[Backfill] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
