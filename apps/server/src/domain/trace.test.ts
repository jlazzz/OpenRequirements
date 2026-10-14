import { expect, test } from "vitest";
import { type TraceNode, traceGraph } from "./trace.ts";

/** Links written as "A>B": A is upstream of B. The link id is the same text. */
const graph = (...pairs: string[]) =>
  traceGraph(
    pairs.map((pair) => {
      const [upstreamId = "", downstreamId = ""] = pair.split(">");
      return { id: pair, upstreamId, downstreamId };
    }),
  );
/** A tree as nested text, e.g. "B(D) C(D!repeat)". */
const show = (nodes: TraceNode[]): string =>
  nodes
    .map((n) => `${n.itemId}${n.stop ? `!${n.stop}` : ""}${n.children.length ? `(${show(n.children)})` : ""}`)
    .join(" ");

test("a chain is walked to any depth, in both directions", () => {
  const g = graph("N>R", "R>T");
  expect(show(g.walk("N", "downstream"))).toBe("R(T)");
  expect(show(g.walk("T", "upstream"))).toBe("R(N)");
  expect(g.walk("N", "upstream")).toEqual([]);
  expect(g.walk("N", "downstream")[0]).toMatchObject({ itemId: "R", linkId: "N>R" });
});

test("branches come back in link order", () => {
  expect(show(graph("N>R1", "N>R2", "R2>T1", "R2>T2").walk("N", "downstream"))).toBe("R1 R2(T1 T2)");
});

test("the depth limit cuts the tree", () => {
  const g = graph("A>B", "B>C", "C>D");
  expect(show(g.walk("A", "downstream", { maxDepth: 2 }))).toBe("B(C)");
  expect(g.walk("A", "downstream", { maxDepth: 0 })).toEqual([]);
});

test("a loop ends the branch where it would pass through an item again", () => {
  expect(show(graph("A>B", "B>A").walk("A", "downstream"))).toBe("B(A!loop)");
  expect(show(graph("A>B", "B>C", "C>A").walk("B", "downstream"))).toBe("C(A(B!loop))");
  expect(show(graph("A>B", "B>C", "C>B").walk("A", "downstream"))).toBe("B(C(B!loop))");
  expect(show(graph("A>B", "B>C", "C>A").walk("A", "upstream", { once: true }))).toBe("C(B(A!loop))");
});

test("an item reached by two routes is repeated in full, or expanded once when asked", () => {
  const g = graph("A>B", "A>C", "B>D", "C>D", "D>E");
  expect(show(g.walk("A", "downstream"))).toBe("B(D(E)) C(D(E))");
  expect(show(g.walk("A", "downstream", { once: true }))).toBe("B(D(E)) C(D!repeat)");
});

test("expanding once keeps a densely linked project small", () => {
  // 20 layers of 2 items, each linked to both items of the next layer: over a million paths.
  const pairs = Array.from({ length: 19 }, (_, i) =>
    [0, 1].flatMap((a) => [0, 1].map((b) => `${i}.${a}>${i + 1}.${b}`)),
  ).flat();
  const count = (nodes: TraceNode[]): number => nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
  expect(count(graph(...pairs).walk("0.0", "downstream", { once: true }))).toBe(pairs.length - 2);
});

test("reaching a target looks downstream at any depth and survives loops", () => {
  const g = graph("N>R", "R>T", "R>N", "X>Y", "Y>X");
  const tests = new Set(["T"]);
  expect(g.reaches("N", tests)).toBe(true);
  expect(g.reaches("R", tests)).toBe(true);
  expect(g.reaches("T", tests), "the start itself does not count").toBe(false);
  expect(g.reaches("X", tests)).toBe(false);
  expect(g.reaches("unknown", tests)).toBe(false);
});
