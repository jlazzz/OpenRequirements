import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** Stored instead of a hash for an account that cannot sign in yet: one created by restoring a backup. An invitation gives it a password. */
export const NO_PASSWORD = "none";

// Cost is stored in each hash, so it can be raised later without breaking old passwords.
const COST = 2 ** 15;

function derive(password: string, salt: Buffer, cost: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, length, { N: cost, maxmem: 256 * cost * 8 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, 64);
  return `scrypt$${COST}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), Number(cost), expected.length);
  return timingSafeEqual(actual, expected);
}
