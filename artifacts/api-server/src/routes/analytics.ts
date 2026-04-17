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

export default router;
