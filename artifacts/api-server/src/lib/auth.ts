import { createHmac, randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "flychat-dev-secret-change-in-prod";
// bcrypt work factor. Bumped from the previously-unused SALT_ROUNDS = 10:
// this only runs on signup/accept-invite/login submits, not a hot path, and
// 12 costs roughly 250ms/hash vs ~60ms at 10 — an easy trade for
// meaningfully higher brute-force resistance if the hash table ever leaks.
const SALT_ROUNDS = 12;

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

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// bcrypt hashes always start with $2a$/$2b$/$2y$ (version) followed by the
// cost factor — anything else is the old scheme (`${salt}:${sha256hex}`,
// see legacyVerify below). Lets verifyPassword accept both formats during
// the transition, and login() re-hash a legacy row the moment it verifies
// successfully (see routes/auth.ts) — no forced reset, no user-visible
// change, passwords migrate to bcrypt as people log in.
const BCRYPT_PREFIX = /^\$2[aby]\$/;

export function isLegacyHash(stored: string): boolean {
  return !BCRYPT_PREFIX.test(stored);
}

function legacyVerify(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
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

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isLegacyHash(stored)) {
    return legacyVerify(password, stored);
  }
  return bcrypt.compare(password, stored);
}

export async function getUserFromToken(token: string): Promise<User | null> {
  const payload = verifyToken(token);
  if (!payload || !payload.userId) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId as string)).limit(1);
  return user || null;
}
