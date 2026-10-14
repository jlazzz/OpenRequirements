import { expect, test } from "vitest";
import { checkAttributes, type FieldDef } from "./attributes.ts";

const field = (id: string, type: string, options: string[] | null = null): FieldDef => ({
  id,
  name: id,
  type,
  options,
});
const fields = [
  field("text", "text"),
  field("number", "number"),
  field("flag", "boolean"),
  field("date", "date"),
  field("status", "enum", ["Draft", "Approved"]),
  field("tags", "multi_enum", ["a", "b"]),
];

test("valid values of every type are kept", () => {
  const values = { text: "x", number: 1.5, flag: false, date: "2026-10-12", status: "Draft", tags: ["a", "b"] };
  expect(checkAttributes(fields, values)).toEqual({ attributes: values });
});

test("empty values are dropped, so a field can be cleared", () => {
  expect(checkAttributes(fields, { text: "", status: null, tags: [], number: 0 })).toEqual({
    attributes: { number: 0 },
  });
});

test("a value equal to the kept one passes, though its field or option is gone", () => {
  const kept = { gone: "x", status: "Retired" };
  expect(checkAttributes(fields, { ...kept }, kept)).toEqual({ attributes: kept });
  expect(checkAttributes(fields, { status: "Other" }, kept)).toEqual({ error: expect.stringContaining("status") });
  expect(checkAttributes(fields, { gone: "y" }, kept)).toEqual({ error: expect.stringContaining("Unknown field") });
});

test.each([
  [{ nope: "x" }, "Unknown field"],
  [{ text: 5 }, "text must be text"],
  [{ number: "5" }, "number must be a number"],
  [{ number: Number.NaN }, "number must be a number"],
  [{ flag: "yes" }, "flag must be yes or no"],
  [{ date: "2026-13-40" }, "date must be a date"],
  [{ date: "12/10/2026" }, "date must be a date"],
  [{ status: "Other" }, "status must be one of"],
  [{ tags: ["a", "c"] }, "tags must be a list"],
  [{ tags: ["a", "a"] }, "tags must be a list"],
  [{ tags: "a" }, "tags must be a list"],
])("%j is rejected", (values, message) => {
  expect(checkAttributes(fields, values)).toEqual({ error: expect.stringContaining(message) });
});
