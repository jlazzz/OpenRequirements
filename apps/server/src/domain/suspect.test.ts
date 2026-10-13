import { expect, test } from "vitest";
import { changedEnds, isSuspect } from "./suspect.ts";

test("a link is not suspect while both ends are at the confirmed revisions", () => {
  expect(isSuspect({ upstream: 2, downstream: 5 }, { upstream: 2, downstream: 5 })).toBe(false);
});

test("a new version of either end makes the link suspect, and says which end", () => {
  expect(changedEnds({ upstream: 1, downstream: 1 }, { upstream: 2, downstream: 1 })).toEqual({
    upstream: true,
    downstream: false,
  });
  expect(changedEnds({ upstream: 1, downstream: 1 }, { upstream: 1, downstream: 3 })).toEqual({
    upstream: false,
    downstream: true,
  });
  expect(isSuspect({ upstream: 1, downstream: 1 }, { upstream: 2, downstream: 3 })).toBe(true);
});

test("confirming against the current revisions clears the flag until the next change", () => {
  const confirmed = { upstream: 4, downstream: 2 };
  expect(isSuspect(confirmed, { upstream: 4, downstream: 2 })).toBe(false);
  expect(isSuspect(confirmed, { upstream: 5, downstream: 2 })).toBe(true);
});
