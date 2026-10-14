import { expect, test } from "vitest";
import { isLocked, lockAfterFailure, NO_LIMITS, passwordExpired, sessionIdle } from "./accountsecurity.ts";

const now = new Date("2026-01-10T12:00:00Z");
const on = { lockoutAttempts: 3, lockoutMinutes: 10, passwordMaxAgeDays: 90, idleMinutes: 30 };

test("with no limits set nothing locks, expires or idles", () => {
  expect(lockAfterFailure(1000, now, NO_LIMITS)).toBeNull();
  expect(passwordExpired(new Date(0), now, NO_LIMITS)).toBe(false);
  expect(sessionIdle(new Date(0), now, NO_LIMITS)).toBe(false);
});

test("the account locks on the Nth failure, for the window", () => {
  expect(lockAfterFailure(2, now, on)).toBeNull();
  const until = lockAfterFailure(3, now, on);
  expect(until?.toISOString()).toBe("2026-01-10T12:10:00.000Z");
  expect(isLocked(until, now)).toBe(true);
  expect(isLocked(until, new Date("2026-01-10T12:10:00Z"))).toBe(false);
  expect(isLocked(null, now)).toBe(false);
});

test("a password expires after the set days", () => {
  expect(passwordExpired(new Date("2025-10-12T12:00:00Z"), now, on)).toBe(false);
  expect(passwordExpired(new Date("2025-10-10T12:00:00Z"), now, on)).toBe(true);
});

test("a session idles after the set minutes", () => {
  expect(sessionIdle(new Date("2026-01-10T11:35:00Z"), now, on)).toBe(false);
  expect(sessionIdle(new Date("2026-01-10T11:29:00Z"), now, on)).toBe(true);
});
