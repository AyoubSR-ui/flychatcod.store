import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import storageRouter from "./storage.js";
import organizationRouter from "./organization.js";
import dashboardRouter from "./dashboard.js";
import conversationsRouter from "./conversations.js";
import ordersRouter from "./orders.js";
import customersRouter from "./customers.js";
import productsRouter from "./products.js";
import widgetRouter from "./widget.js";
import automationRouter from "./automation.js";
import channelsRouter from "./channels.js";
import teamRouter from "./team.js";
import billingRouter from "./billing.js";
import settingsRouter from "./settings.js";
import adminRouter from "./admin.js";
import aiRouter from "./ai.js";
import voiceRouter from "./voice.js";
import adLinksRouter from "./ad-links.js";
import { whatsappRouter } from "./whatsapp.js";
import { instagramRouter } from "./instagram.js";
import { messengerRouter } from "./messenger.js";
import shopifyRouter from "./shopify.js";
import stripeRouter from "./stripe.js";




const router = Router();


router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/organization", organizationRouter);
router.use("/dashboard", dashboardRouter);
router.use("/conversations", conversationsRouter);
router.use("/orders", ordersRouter);
router.use("/customers", customersRouter);
router.use("/products", productsRouter);
router.use("/widget", widgetRouter);
router.use("/automation", automationRouter);
router.use("/channels", channelsRouter);
router.use("/team", teamRouter);
router.use("/billing", billingRouter);
router.use("/settings", settingsRouter);
router.use("/admin", adminRouter);
router.use("/ai", aiRouter);
router.use("/voice", voiceRouter);
router.use("/ad-links", adLinksRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/instagram", instagramRouter);
router.use("/messenger", messengerRouter);
router.use("/shopify", shopifyRouter);
router.use("/stripe", stripeRouter);
router.use("/", storageRouter);

export default router;
