import { Router } from "express";
import { db, conversationsTable, ordersTable } from "@workspace/db";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getAgentTeamMemberId } from "../lib/order-access.js";

const router = Router();

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const storeId = user.storeId;

    if (!storeId) {
      res.json({
        chatsToday: 0,
        newOrders: 0,
        confirmedOrders: 0,
        pendingConfirmations: 0,
        conversionRate: 0,
        recentConversations: [],
        recentOrders: [],
      });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // An agent's dashboard shows only their own order numbers — this is the
    // same scoping the orders list/stats routes apply, just against a
    // different set of queries. Conversations stay store-wide for now
    // (chatsToday, recentConversations) — whether agents should only see
    // conversations assigned to them is a separate, not-yet-made decision.
    const isAgent = user.role === "agent";
    const ownAgentId = isAgent ? await getAgentTeamMemberId(user.id, storeId) : null;
    // An agent with no roster link (shouldn't normally happen) gets zero
    // orders rather than the store's — never falls back to unscoped.
    const orderScope = isAgent
      ? and(eq(ordersTable.storeId, storeId), eq(ordersTable.assignedAgentId, ownAgentId || "__no_agent_link__"))
      : eq(ordersTable.storeId, storeId);

    // Chats today
    const [chatsTodayResult] = await db
      .select({ count: count() })
      .from(conversationsTable)
      .where(and(eq(conversationsTable.storeId, storeId), gte(conversationsTable.createdAt, today)));

    // Orders
    const [newOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(orderScope, eq(ordersTable.status, "new")));

    const [confirmedOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(orderScope, eq(ordersTable.status, "confirmed")));

    const [pendingResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(orderScope, eq(ordersTable.status, "awaiting_confirmation")));

    // Conversion rate (confirmed / total conversations) — conversations
    // aren't agent-scoped (see note above), so for an agent this reads as
    // "their orders over the store's total conversations": an approximation,
    // not a true personal conversion rate, until conversation scoping exists.
    const [totalConvResult] = await db
      .select({ count: count() })
      .from(conversationsTable)
      .where(eq(conversationsTable.storeId, storeId));

    const [totalOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(orderScope);

    const totalConvCount = totalConvResult?.count ?? 0;
    const totalOrderCount = totalOrdersResult?.count ?? 0;
    const conversionRate = totalConvCount > 0 ? Math.round((Number(totalOrderCount) / Number(totalConvCount)) * 100) : 0;

    // Recent conversations
    const recentConversations = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.storeId, storeId))
      .orderBy(sql`${conversationsTable.updatedAt} desc`)
      .limit(5);

    // Recent orders
    const recentOrders = await db
      .select()
      .from(ordersTable)
      .where(orderScope)
      .orderBy(sql`${ordersTable.createdAt} desc`)
      .limit(5);

    res.json({
      chatsToday: Number(chatsTodayResult?.count ?? 0),
      newOrders: Number(newOrdersResult?.count ?? 0),
      confirmedOrders: Number(confirmedOrdersResult?.count ?? 0),
      pendingConfirmations: Number(pendingResult?.count ?? 0),
      conversionRate,
      recentConversations: recentConversations.map(c => ({
        id: c.id,
        customerName: c.customerName,
        lastMessage: c.lastMessage || "No messages yet",
        status: c.status,
        updatedAt: c.updatedAt,
      })),
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        total: Number(o.total),
        status: o.status,
        createdAt: o.createdAt,
      })),
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to load dashboard stats" });
  }
});

export default router;
