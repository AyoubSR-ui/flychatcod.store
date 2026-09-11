import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";

const app: Express = express();

app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));

// ─── Stripe webhook needs raw body BEFORE json middleware ─────────────────────
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

// ─── Shopify webhooks need raw body BEFORE json middleware ────────────────────
// The HMAC has to be verified over the exact bytes Shopify signed. express.json()
// re-serializes the payload (key order, whitespace, unicode escapes), so a digest
// taken after it would never match and every webhook would 401.
// Two mounts because app.use matches whole path segments: the legacy singular
// /webhook (orders/create, products/*) and the /webhooks/* compliance topics.
app.use("/api/shopify/webhook", express.raw({ type: "application/json" }));
app.use("/api/shopify/webhooks", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

export default app;
