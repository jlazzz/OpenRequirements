import { expect, test } from "vitest";
import { scripts } from "./scripts.ts";

test("every script has a unique external id, steps, and an expected result for each step", () => {
  expect(new Set(scripts.map((s) => s.id)).size).toBe(scripts.length);
  expect(new Set(scripts.map((s) => s.name)).size).toBe(scripts.length);
  for (const s of scripts) {
    expect(s.steps.length, s.id).toBeGreaterThan(0);
    for (const step of s.steps) {
      expect(step.action.trim(), s.id).not.toBe("");
      expect(step.expected.trim(), s.id).not.toBe("");
    }
  }
});
