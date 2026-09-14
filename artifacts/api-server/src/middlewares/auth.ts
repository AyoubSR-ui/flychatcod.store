import { Request, Response, NextFunction } from "express";
import { getUserFromToken } from "../lib/auth.js";
import type { User } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "No token provided" });
    return;
  }
  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
    return;
  }
  req.user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (!req.user || req.user.role !== "superadmin") {
      res.status(403).json({ error: "forbidden", message: "Admin access required" });
      return;
    }
    next();
  });
}

// Merchant-team owner only — distinct from requireAdmin above, which gates
// FlyChat's own platform staff (role "superadmin"). "owner" here is the
// per-store role from users.role (see lib/db/src/schema/users.ts). Used for
// billing and team management, which stay owner-only even for "admin" —
// see requireOwnerOrAdmin for everything else "admin" is treated as
// owner-equivalent for.
export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (!req.user || req.user.role !== "owner") {
      res.status(403).json({ error: "forbidden", message: "Only the store owner can do this" });
      return;
    }
    next();
  });
}

// Merchant-team owner or admin — the default gate for store-management
// actions (channels, carriers, store profile, AI settings, automation,
// widget, ad links). "agent" is excluded; billing and team use the
// stricter requireOwner instead, since the decision is admin should not
// have owner-only power there.
export async function requireOwnerOrAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (!req.user || (req.user.role !== "owner" && req.user.role !== "admin")) {
      res.status(403).json({ error: "forbidden", message: "Only the store owner or an admin can do this" });
      return;
    }
    next();
  });
}
