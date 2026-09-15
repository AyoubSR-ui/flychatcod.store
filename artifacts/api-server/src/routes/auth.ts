import { Router } from "express";
import { db, usersTable, organizationsTable, storesTable, subscriptionsTable, teamMembersTable, widgetConfigsTable, channelConnectionsTable, inviteTokensTable, passwordResetTokensTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { hashPassword, verifyPassword, createToken, verifyToken, hashToken } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { randomBytes } from "crypto";

function buildResetUrl(token: string): string {
  const configured = process.env.APP_BASE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  const base = configured || "http://localhost:5173";
  return `${base}/reset-password/confirm?token=${token}`;
}

const LOGIN_SELECTION_TTL_SECONDS = 5 * 60;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const router = Router();

router.post("/signup", async (req, res) => {
  try {
    const { email, password, name, language = "en" } = req.body;
    if (!email || !password || !name) {
      res.status(400).json({ error: "validation_error", message: "email, password, and name are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "validation_error", message: "Password must be at least 8 characters" });
      return;
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    if (existing) {
      res.status(409).json({ error: "conflict", message: "Email already in use" });
      return;
    }

    const userId = generateId("usr");
    const passwordHash = hashPassword(password);

    await db.insert(usersTable).values({
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: "owner",
      language: language as "en" | "fr",
      onboardingCompleted: false,
    });

    const token = createToken({ userId, email: email.toLowerCase() });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    res.status(201).json({
      user: serializeUser(user),
      token,
      needsOnboarding: true,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "internal_error", message: "Signup failed" });
  }
});

function issueAuthResponse(user: typeof usersTable.$inferSelect) {
  const token = createToken({ userId: user.id, email: user.email, storeId: user.storeId });
  return {
    user: serializeUser(user),
    token,
    needsOnboarding: !user.onboardingCompleted,
  };
}

async function storeNameFor(storeId: string | null): Promise<string> {
  if (!storeId) return "No store yet";
  const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  return store?.name || "Store";
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "validation_error", message: "email and password are required" });
      return;
    }

    // Find all accounts with this email (a person may have several — own store + invited stores)
    const users = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
    const matches = users.filter(u => verifyPassword(password, u.passwordHash));

    if (matches.length === 0) {
      res.status(401).json({ error: "unauthorized", message: "Invalid email or password" });
      return;
    }

    if (matches.length === 1) {
      res.json(issueAuthResponse(matches[0]));
      return;
    }

    // Several accounts share this email+password — don't silently pick one.
    // Hand back a short-lived token naming exactly these candidate ids;
    // /auth/login/select trades it (plus a chosen userId) for a real session,
    // without re-sending the password.
    const selectionToken = createToken(
      { kind: "login_select", email: email.toLowerCase(), candidates: matches.map(u => u.id) },
      LOGIN_SELECTION_TTL_SECONDS
    );
    const accounts = await Promise.all(matches.map(async (u) => ({
      userId: u.id,
      storeName: await storeNameFor(u.storeId),
      role: u.role,
    })));

    res.json({ requiresSelection: true, selectionToken, accounts });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "internal_error", message: "Login failed" });
  }
});

router.post("/login/select", async (req, res) => {
  try {
    const { selectionToken, userId } = req.body;
    if (!selectionToken || !userId) {
      res.status(400).json({ error: "validation_error", message: "selectionToken and userId are required" });
      return;
    }

    const payload = verifyToken(selectionToken);
    if (!payload || payload.kind !== "login_select" || !Array.isArray(payload.candidates) || !payload.candidates.includes(userId)) {
      res.status(401).json({ error: "unauthorized", message: "This selection has expired. Please log in again." });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "unauthorized", message: "This selection has expired. Please log in again." });
      return;
    }

    res.json(issueAuthResponse(user));
  } catch (err) {
    console.error("Login select error:", err);
    res.status(500).json({ error: "internal_error", message: "Login failed" });
  }
});

router.post("/logout", (_req, res) => {
  res.json({ success: true, message: "Logged out" });
});

router.get("/me", requireAuth, async (req, res) => {
  res.json(serializeUser(req.user!));
});

const RESET_SENT_MESSAGE = "If an account exists with this email, a reset link will be sent.";

router.post("/reset-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "validation_error", message: "email is required" });
    return;
  }

  // Always the same response whether or not the email matches an account —
  // never let this endpoint be used to probe which emails are registered.
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
    if (users.length > 0) {
      const accounts = await Promise.all(users.map(async (user) => {
        const token = randomBytes(32).toString("hex");
        await db.insert(passwordResetTokensTable).values({
          id: generateId("prt"),
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        });
        return { storeName: await storeNameFor(user.storeId), resetUrl: buildResetUrl(token) };
      }));
      await sendPasswordResetEmail({ to: email.toLowerCase(), accounts });
    }
  } catch (err) {
    console.error("Reset password request error:", err);
    // Still fall through to the generic success response below.
  }

  res.json({ success: true, message: RESET_SENT_MESSAGE });
});

router.post("/reset-password/confirm", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400).json({ error: "validation_error", message: "token and password are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "validation_error", message: "Password must be at least 8 characters" });
      return;
    }

    const [resetToken] = await db.select().from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, hashToken(token)))
      .limit(1);

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: "invalid_token", message: "This reset link is invalid or has expired. Please request a new one." });
      return;
    }

    await db.update(usersTable)
      .set({ passwordHash: hashPassword(password), updatedAt: new Date() })
      .where(eq(usersTable.id, resetToken.userId));

    await db.update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, resetToken.id));

    res.json({ success: true, message: "Password updated. You can now log in." });
  } catch (err) {
    console.error("Reset password confirm error:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to reset password" });
  }
});

router.get("/validate-invite", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "validation_error", message: "token is required" });
      return;
    }

    const [invite] = await db.select().from(inviteTokensTable)
      .where(and(eq(inviteTokensTable.token, token), isNull(inviteTokensTable.usedAt)))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: "invalid_token", message: "This invitation link is invalid or has already been used." });
      return;
    }
    if (new Date() > invite.expiresAt) {
      res.status(410).json({ error: "expired_token", message: "This invitation link has expired. Please ask the store owner to resend the invitation." });
      return;
    }

  const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, invite.storeId)).limit(1);
   res.json({
  valid: true,
  email: invite.email,
  role: invite.role,
  storeName: store?.name || "Store",
  isExistingUser: false, // always create new account scoped to invited store
  });
  } catch (err) {
    console.error("Validate invite error:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to validate invite" });
  }
});

router.post("/accept-invite", async (req, res) => {
  try {
    const { token, name, password } = req.body;
    if (!token || !name) {
      res.status(400).json({ error: "validation_error", message: "token and name are required" });
      return;
    }

    const [invite] = await db.select().from(inviteTokensTable)
      .where(and(eq(inviteTokensTable.token, token), isNull(inviteTokensTable.usedAt)))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: "invalid_token", message: "This invitation link is invalid or has already been used." });
      return;
    }
    if (new Date() > invite.expiresAt) {
      res.status(410).json({ error: "expired_token", message: "This invitation link has expired." });
      return;
    }

    // Always require password — each invitation creates a new account scoped to the invited store
  if (!password || password.length < 8) {
  res.status(400).json({ error: "validation_error", message: "Password must be at least 8 characters" });
  return;
   }

   const [store] = await db.select({ organizationId: storesTable.organizationId })
  .from(storesTable).where(eq(storesTable.id, invite.storeId)).limit(1);

  const userId = generateId("usr");
  const passwordHash = hashPassword(password);

  await db.insert(usersTable).values({
  id: userId,
  email: invite.email.toLowerCase(),
  passwordHash,
  name,
  role: invite.role === "admin" ? "admin" : "agent",
  language: "fr",
  storeId: invite.storeId,
  organizationId: store?.organizationId || null,
  onboardingCompleted: true,
  });
   
    await db.update(teamMembersTable).set({
      userId,
      name,
      status: "active",
      updatedAt: new Date(),
    }).where(eq(teamMembersTable.id, invite.teamMemberId));

    await db.update(inviteTokensTable).set({ usedAt: new Date() }).where(eq(inviteTokensTable.id, invite.id));

    const jwtToken = createToken({ userId, email: invite.email.toLowerCase() });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    res.json({
      success: true,
      user: serializeUser(user),
      token: jwtToken,
      needsOnboarding: false,
    });
  } catch (err) {
    console.error("Accept invite error:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to accept invitation" });
  }
});

router.post("/onboarding", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const {
      businessName,
      storeName,
      businessPhone,
      language = "en",
      widgetLanguage = "fr",
      storeDescription,
      logoUrl,
      shippingWilayas = [],
      hasWebsite = false,
      websiteUrl,
      needsHostedPage = false,
    } = req.body;

    if (!businessName || !storeName || !businessPhone) {
      res.status(400).json({ error: "validation_error", message: "businessName, storeName, and businessPhone are required" });
      return;
    }

    // Create organization
    const orgId = generateId("org");
    await db.insert(organizationsTable).values({
      id: orgId,
      name: businessName,
      ownerId: user.id,
    });

    // Create store
    const storeId = generateId("str");
    await db.insert(storesTable).values({
      id: storeId,
      organizationId: orgId,
      name: storeName,
      description: storeDescription,
      phone: businessPhone,
      logoUrl,
      websiteUrl,
      defaultLanguage: language as "en" | "fr",
      widgetLanguage: widgetLanguage as "en" | "fr",
      shippingWilayas: Array.isArray(shippingWilayas) ? shippingWilayas : [],
      hasWebsite,
      needsHostedPage,
    });

    // Create widget config
    await db.insert(widgetConfigsTable).values({
      id: generateId("wgt"),
      storeId,
      defaultLanguage: widgetLanguage,
      welcomeMessageEn: "Hello! How can we help you today?",
      welcomeMessageFr: "Bonjour! Comment pouvons-nous vous aider aujourd'hui?",
    });

    // Create widget channel connection (active)
    await db.insert(channelConnectionsTable).values({
    id: generateId("ch"),
    storeId,
    channel: "widget",
    status: "disconnected",
    });
    // Create other channel connections (disconnected)
    for (const ch of ["whatsapp", "instagram", "messenger"] as const) {
      await db.insert(channelConnectionsTable).values({
        id: generateId("ch"),
        storeId,
        channel: ch,
        status: "disconnected",
      });
    }

    // Create subscription
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await db.insert(subscriptionsTable).values({
  id: generateId("sub"),
  organizationId: orgId,
  plan: "free",
  status: "trialing",
  currentPeriodStart: now,
  currentPeriodEnd: trialEnd,
  aiMonthlyCreditsIncluded: 50, // free plan
  aiCreditsResetAt: trialEnd,
  });

    // Add owner as team member
    await db.insert(teamMembersTable).values({
      id: generateId("tm"),
      userId: user.id,
      storeId,
      email: user.email,
      name: user.name,
      role: "owner",
      status: "active",
    });

    // Update user
    await db.update(usersTable).set({
      organizationId: orgId,
      storeId,
      language: language as "en" | "fr",
      onboardingCompleted: true,
    }).where(eq(usersTable.id, user.id));

    res.json({ success: true, storeId, organizationId: orgId });
  } catch (err) {
    console.error("Onboarding error:", err);
    res.status(500).json({ error: "internal_error", message: "Onboarding failed" });
  }
});

function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
    organizationId: user.organizationId,
    storeId: user.storeId,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
  };
}

export default router;
