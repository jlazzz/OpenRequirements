import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

test("a password verifies against its own hash only", async () => {
  const hash = await hashPassword("correct horse battery");
  expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  expect(await verifyPassword("wrong", hash)).toBe(false);
});

test("the same password hashes differently each time", async () => {
  expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
});

test("a malformed stored hash never verifies", async () => {
  expect(await verifyPassword("x", "not-a-hash")).toBe(false);
});
