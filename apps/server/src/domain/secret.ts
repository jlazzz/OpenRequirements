import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM. The key is the SHA-256 of INTEGRATION_KEY, so any long random string will do.
const keyOf = (secret: string) => createHash("sha256").update(secret).digest();

/** Encrypts a connection token for storage. The result is "iv.tag.ciphertext" in base64url. */
export function encrypt(secret: string, text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

/** Reverses encrypt. Throws when the key is not the one it was encrypted with, or the value was changed. */
export function decrypt(secret: string, stored: string): string {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data) throw new Error("not an encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
