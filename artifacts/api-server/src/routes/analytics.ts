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

// POST /api/analytics/optimizer/run
// Fetches last 30 days of qualified conversations and sends to Python for analysis
router.post("/optimizer/run", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId!;

    const { rows: conversations } = await pool.query(`
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
      LIMIT 100
    `, [storeId]);

    if (!conversations.length) {
      res.json({ status: "no_data", message: "No qualifying conversations found in the last 30 days." });
      return;
    }

    const formatted = conversations.map((c: any) => ({
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

    const result = await proxyToOptimizer("/optimize", {
      conversations: formatted,
      storeId,
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

export default router;
