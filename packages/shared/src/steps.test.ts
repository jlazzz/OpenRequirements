import { expect, test } from "vitest";
import { textToDoc } from "./richtext.ts";
import { stepDoc, stepsError, stepsToText, stepText } from "./steps.ts";

test("steps are a list of actions with expected results, as plain text or rich text", () => {
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
  expect(stepsError([{ action: "x".repeat(10_001), expected: "" }])).toMatch(/step 1/);
  expect(stepsError([null])).toMatch(/step 1/);
  expect(stepsError([{ action: textToDoc("Press start"), expected: textToDoc("") }])).toBeNull();
  expect(stepsError([{ action: textToDoc(" "), expected: "" }])).toBe("has no action in step 1");
  expect(stepsError([{ action: { type: "doc", content: [{ type: "script" }] }, expected: "" }])).toMatch(/step 1/);
  expect(
    stepsError([
      { action: { type: "doc", content: [{ type: "image", attrs: { src: "http://x/a.png" } }] }, expected: "" },
    ]),
  ).toMatch(/step 1/);
});

test("a step saved as plain text reads as a document, and a document as text", () => {
  expect(stepDoc("Press start\nWait")).toEqual(textToDoc("Press start\nWait"));
  expect(stepText(textToDoc("Press start\nWait"))).toBe("Press start\nWait");
  expect(stepsToText([{ action: textToDoc("Open\nPress start"), expected: textToDoc("Runs") }])).toBe(
    "1. Open\n   Press start\n   Expected: Runs",
  );
});

test("steps read as numbered lines", () => {
  expect(
    stepsToText([
      { action: "Press start", expected: "The pump runs" },
      { action: "Wait", expected: "" },
    ]),
  ).toBe("1. Press start\n   Expected: The pump runs\n2. Wait");
});
