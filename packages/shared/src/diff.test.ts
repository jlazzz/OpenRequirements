import { expect, test } from "vitest";
import { diffWords } from "./diff.ts";

const rebuild = (parts: ReturnType<typeof diffWords>, drop: "added" | "removed") =>
  parts
    .filter((p) => p.change !== drop)
    .map((p) => p.text)
    .join("");

test("a changed word is reported as one removal and one addition", () => {
  expect(diffWords("shall operate from 5 V DC", "shall operate from 12 V DC")).toEqual([
    { text: "shall operate from ", change: "same" },
    { text: "5", change: "removed" },
    { text: "12", change: "added" },
    { text: " V DC", change: "same" },
  ]);
});

test("identical and empty texts", () => {
  expect(diffWords("same text", "same text")).toEqual([{ text: "same text", change: "same" }]);
  expect(diffWords("", "")).toEqual([]);
  expect(diffWords("", "new")).toEqual([{ text: "new", change: "added" }]);
  expect(diffWords("old", "")).toEqual([{ text: "old", change: "removed" }]);
});

test.each([
  ["The device shall\noperate.", "The device should not\n\noperate at all."],
  ["a b c d e", "e d c b a"],
  ["  leading and trailing  ", "leading  and trailing"],
])("the parts always rebuild both texts exactly: %j", (before, after) => {
  const parts = diffWords(before, after);
  expect(rebuild(parts, "added")).toBe(before);
  expect(rebuild(parts, "removed")).toBe(after);
});

test("very long texts fall back to whole-text replacement and still rebuild", () => {
  const before = "a ".repeat(3000);
  const after = "b ".repeat(3000);
  const parts = diffWords(before, after);
  expect(parts).toHaveLength(2);
  expect(rebuild(parts, "added")).toBe(before);
  expect(rebuild(parts, "removed")).toBe(after);
});
