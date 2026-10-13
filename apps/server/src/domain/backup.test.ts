import { expect, test } from "vitest";
import { parentsFirst, remapIds } from "./backup.ts";

test("folders are ordered before their contents, and a loop is detected", () => {
  const nodes = [
    { id: "c", parentId: "b" },
    { id: "b", parentId: "a" },
    { id: "a", parentId: null },
    { id: "d", parentId: null },
  ];
  expect(parentsFirst(nodes)?.map((n) => n.id)).toEqual(["a", "d", "b", "c"]);
  expect(
    parentsFirst([
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ]),
  ).toBeNull();
});

test("ids are replaced wherever they appear: as values, as keys and inside text", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const unknown = "33333333-3333-4333-8333-333333333333";
  const value = { id: a, attributes: { [a]: "x" }, src: `/api/attachments/${a.toUpperCase()}`, other: unknown };
  expect(remapIds(value, new Map([[a, b]]))).toEqual({
    id: b,
    attributes: { [b]: "x" },
    src: `/api/attachments/${b}`,
    other: unknown,
  });
});
