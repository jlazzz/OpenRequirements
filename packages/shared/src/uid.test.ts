import { expect, test } from "vitest";
import { formatUid } from "./uid.js";

test("formatUid pads to three digits and grows past them", () => {
  expect(formatUid("SRS", 1)).toBe("SRS-001");
  expect(formatUid("SYS", 42)).toBe("SYS-042");
  expect(formatUid("SYS", 1234)).toBe("SYS-1234");
});

test("formatUid rejects non-positive and fractional counters", () => {
  expect(() => formatUid("SRS", 0)).toThrow(RangeError);
  expect(() => formatUid("SRS", 1.5)).toThrow(RangeError);
});
