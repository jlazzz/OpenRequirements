import { expect, test } from "vitest";
import { compareBaseline } from "./baseline.ts";

test("comparing a baseline with now reports added, removed and changed items only", () => {
  const frozen = [
    { id: "same", revision: 2 },
    { id: "edited", revision: 1 },
    { id: "deleted", revision: 4 },
  ];
  const current = [
    { id: "same", revision: 2 },
    { id: "edited", revision: 3 },
    { id: "new", revision: 1 },
  ];
  expect(Object.fromEntries(compareBaseline(frozen, current))).toEqual({
    edited: "changed",
    deleted: "removed",
    new: "added",
  });
  expect(compareBaseline(frozen, frozen).size).toBe(0);
});
