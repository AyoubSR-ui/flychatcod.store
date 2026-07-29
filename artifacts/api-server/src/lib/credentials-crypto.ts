import crypto from "crypto";

// Encrypts carrier credentials (Yalidine/Noest/ZR Express/... API tokens) at
// rest in carrier_connections.credentials. AES-256-GCM, key derived from a
// server-side secret — never the credentials themselves in plaintext in the DB.
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY (or JWT_SECRET as fallback) must be set to store carrier credentials");
  }
  return crypto.scryptSync(secret, "flychat-carrier-credentials", 32);
}

export function encryptCredentials(data: Record<string, string>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptCredentials(payload: string): Record<string, string> {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted credentials payload");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}
