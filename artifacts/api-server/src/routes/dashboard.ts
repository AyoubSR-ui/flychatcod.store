import { Router } from "express";
import { db, conversationsTable, ordersTable } from "@workspace/db";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

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

    // Chats today
    const [chatsTodayResult] = await db
      .select({ count: count() })
      .from(conversationsTable)
      .where(and(eq(conversationsTable.storeId, storeId), gte(conversationsTable.createdAt, today)));

    // Orders
    const [newOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.storeId, storeId), eq(ordersTable.status, "new")));

    const [confirmedOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.storeId, storeId), eq(ordersTable.status, "confirmed")));

    const [pendingResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.storeId, storeId), eq(ordersTable.status, "awaiting_confirmation")));

    // Conversion rate (confirmed / total conversations)
    const [totalConvResult] = await db
      .select({ count: count() })
      .from(conversationsTable)
      .where(eq(conversationsTable.storeId, storeId));

    const [totalOrdersResult] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(eq(ordersTable.storeId, storeId));

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
      .where(eq(ordersTable.storeId, storeId))
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
