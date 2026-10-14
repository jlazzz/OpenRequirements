import { expect, test } from "vitest";
import { stepsError, stepsToText } from "./steps.ts";

test("steps are a list of actions with expected results, as plain text", () => {
  expect(stepsError([{ action: "Press start", expected: "The pump runs" }])).toBeNull();
  expect(stepsError([{ action: "Press start", expected: "" }])).toBeNull();
  expect(stepsError("Press start")).toMatch(/list/);
  expect(stepsError(Array(201).fill({ action: "x", expected: "" }))).toMatch(/at most 200/);
  expect(
    stepsError([
      { action: "ok", expected: "" },
      { action: "  ", expected: "x" },
    ]),
  ).toBe("has no action in step 2");
  expect(stepsError([{ action: "x" }])).toMatch(/step 1/);
  expect(stepsError([{ action: "x", expected: "y", extra: 1 }])).toMatch(/step 1/);
  expect(stepsError([{ action: "x".repeat(2001), expected: "" }])).toMatch(/step 1/);
  expect(stepsError([null])).toMatch(/step 1/);
});

test("steps read as numbered lines", () => {
  expect(
    stepsToText([
      { action: "Press start", expected: "The pump runs" },
      { action: "Wait", expected: "" },
    ]),
  ).toBe("1. Press start\n   Expected: The pump runs\n2. Wait");
});
