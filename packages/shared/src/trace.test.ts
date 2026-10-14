import { expect, test } from "vitest";
import { tracePaths } from "./trace.ts";

type Node = { id: string; children: Node[] };
const node = (id: string, ...children: Node[]): Node => ({ id, children });

test("a tree becomes one path per leaf, and shared beginnings are the same objects", () => {
  const tree = [node("A", node("B", node("D"), node("E")), node("C")), node("F")];
  const paths = tracePaths(tree);
  expect(paths.map((path) => path.map((n) => n.id).join(">"))).toEqual(["A>B>D", "A>B>E", "A>C", "F"]);
  expect(paths[0]?.[1]).toBe(paths[1]?.[1]);
  expect(tracePaths([])).toEqual([]);
});
