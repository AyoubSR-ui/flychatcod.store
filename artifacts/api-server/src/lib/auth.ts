import { createHmac, randomBytes, createHash } from "crypto";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "flychat-dev-secret-change-in-prod";
const SALT_ROUNDS = 10;

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf-8");
}

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

export function createToken(payload: Record<string, unknown>, ttlSeconds: number = SEVEN_DAYS_SECONDS): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split(".");
    const expectedSig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(password + salt).digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const computed = createHash("sha256").update(password + salt).digest("hex");
  return computed === hash;
}

// For high-entropy random tokens (password reset links) — no salt needed,
// unlike hashPassword: the token itself already has 256 bits of randomness,
// so a plain digest is enough to make the stored value useless without the
// original link.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getUserFromToken(token: string): Promise<User | null> {
  const payload = verifyToken(token);
  if (!payload || !payload.userId) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId as string)).limit(1);
  return user || null;
}
