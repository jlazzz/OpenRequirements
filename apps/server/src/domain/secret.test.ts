import { expect, test } from "vitest";
import { decrypt, encrypt } from "./secret.ts";

test("a token comes back with the same key and never with another", () => {
  const stored = encrypt("key one", "ghp_secret");
  expect(stored).not.toContain("ghp_secret");
  expect(encrypt("key one", "ghp_secret")).not.toBe(stored);
  expect(decrypt("key one", stored)).toBe("ghp_secret");
  expect(() => decrypt("key two", stored)).toThrow();
  expect(() => decrypt("key one", "garbage")).toThrow();
});
