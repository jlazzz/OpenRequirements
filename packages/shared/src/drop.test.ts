import { expect, test } from "vitest";
import { type DropNode, dropPlacement } from "./drop.ts";

const nodes: DropNode[] = [
  { id: "F", parentId: null, kind: "folder" },
  { id: "A", parentId: "F", kind: "item" },
  { id: "B", parentId: "F", kind: "item" },
  { id: "C", parentId: "B", kind: "item" },
  { id: "G", parentId: null, kind: "folder" },
  { id: "X", parentId: null, kind: "item" },
];

test("before, after and inside", () => {
  expect(dropPlacement(nodes, "X", "A", "before")).toEqual({ parentId: "F", beforeId: "A" });
  expect(dropPlacement(nodes, "X", "A", "after")).toEqual({ parentId: "F", beforeId: "B" });
  expect(dropPlacement(nodes, "X", "B", "after")).toEqual({ parentId: "F", beforeId: null });
  expect(dropPlacement(nodes, "X", "G", "inside")).toEqual({ parentId: "G", beforeId: null });
  // An item may become a child of another item.
  expect(dropPlacement(nodes, "X", "A", "inside")).toEqual({ parentId: "A", beforeId: null });
});

test("refuses what the tree rules refuse", () => {
  expect(dropPlacement(nodes, "G", "A", "inside")).toBeNull(); // folder under item
  expect(dropPlacement(nodes, "G", "C", "before")).toBeNull(); // folder beside a child item = under an item
  expect(dropPlacement(nodes, "F", "C", "before")).toBeNull();
  expect(dropPlacement(nodes, "B", "C", "inside")).toBeNull(); // under its own child
  expect(dropPlacement(nodes, "A", "A", "before")).toBeNull();
});

test("a drop that changes nothing is null", () => {
  expect(dropPlacement(nodes, "A", "B", "before")).toBeNull();
  expect(dropPlacement(nodes, "B", "A", "after")).toBeNull();
  expect(dropPlacement(nodes, "B", "A", "before")).toEqual({ parentId: "F", beforeId: "A" });
});
