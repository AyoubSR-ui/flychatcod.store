import { Router } from "express";
import { db, usersTable, storesTable, conversationsTable, ordersTable, subscriptionsTable, auditLogsTable } from "@workspace/db";
import { count, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth.js";

const router = Router();

router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const [{ totalStores }] = await db.select({ totalStores: count() }).from(storesTable);
    const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);
    const [{ totalConversations }] = await db.select({ totalConversations: count() }).from(conversationsTable);
    const [{ totalOrders }] = await db.select({ totalOrders: count() }).from(ordersTable);

    const subs = await db.select().from(subscriptionsTable);
    const planDistribution: Record<string, number> = {};
    for (const sub of subs) {
      planDistribution[sub.plan] = (planDistribution[sub.plan] || 0) + 1;
    }

    const recentSignups = await db.select().from(usersTable)
      .orderBy(sql`${usersTable.createdAt} desc`).limit(5);

    const recentActivity = await db.select().from(auditLogsTable)
      .orderBy(sql`${auditLogsTable.createdAt} desc`).limit(10);

    res.json({
      totalStores: Number(totalStores),
      totalUsers: Number(totalUsers),
      totalConversations: Number(totalConversations),
      totalOrders: Number(totalOrders),
      planDistribution,
      recentSignups: recentSignups.map(u => ({
        id: u.id, email: u.email, name: u.name, role: u.role,
        language: u.language, organizationId: u.organizationId, storeId: u.storeId,
        onboardingCompleted: u.onboardingCompleted, createdAt: u.createdAt,
      })),
      recentActivity: recentActivity.map(a => ({
        event: a.event, description: a.description, timestamp: a.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch admin stats" });
  }
});

router.get("/stores", requireAdmin, async (req, res) => {
  try {
    const { page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const stores = await db.select().from(storesTable).limit(limitNum).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(storesTable);

    res.json({
      stores: stores.map(s => ({
        id: s.id, name: s.name, description: s.description, phone: s.phone,
        logoUrl: s.logoUrl, websiteUrl: s.websiteUrl, defaultLanguage: s.defaultLanguage,
        widgetLanguage: s.widgetLanguage, shippingWilayas: s.shippingWilayas || [],
      })),
      total: Number(total), page: pageNum, limit: limitNum,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch stores" });
  }
});

router.get("/users", requireAdmin, async (req, res) => {
  try {
    const { page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const users = await db.select().from(usersTable).orderBy(sql`${usersTable.createdAt} desc`).limit(limitNum).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(usersTable);

    res.json({
      users: users.map(u => ({
        id: u.id, email: u.email, name: u.name, role: u.role,
        language: u.language, organizationId: u.organizationId, storeId: u.storeId,
        onboardingCompleted: u.onboardingCompleted, createdAt: u.createdAt,
      })),
      total: Number(total), page: pageNum, limit: limitNum,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch users" });
  }
});

export default router;
