import { expect, test } from "vitest";
import { descendantIds, placeBefore } from "./tree.ts";

test("descendantIds finds every level below a node and nothing else", () => {
  const nodes = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "d", parentId: null },
  ];
  expect(descendantIds(nodes, "a")).toEqual(new Set(["b", "c"]));
  expect(descendantIds(nodes, "c")).toEqual(new Set());
});

test("placeBefore reorders within a list and inserts into another", () => {
  expect(placeBefore(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  expect(placeBefore(["a", "b", "c"], "a", "c")).toEqual(["b", "a", "c"]);
  expect(placeBefore(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
  expect(placeBefore(["a", "b"], "x", "b")).toEqual(["a", "x", "b"]);
  expect(placeBefore([], "x", null)).toEqual(["x"]);
});

test("placeBefore rejects a target that is not another sibling", () => {
  expect(placeBefore(["a", "b"], "a", "zzz")).toBeNull();
  expect(placeBefore(["a", "b"], "a", "a")).toBeNull();
});
