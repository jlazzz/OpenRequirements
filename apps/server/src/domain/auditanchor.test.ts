import { expect, test } from "vitest";
import { type Anchor, checkAnchors, makeAnchor } from "./auditanchor.ts";

const KEY = "k";
const live = new Map([
  [5, "h5"],
  [9, "h9"],
]);
const lookup = (seq: number) => live.get(seq) ?? null;
function two(key?: string): Anchor[] {
  const a = makeAnchor(null, { seq: 5, hash: "h5" }, new Date(1000), key);
  return [a, makeAnchor(a, { seq: 9, hash: "h9" }, new Date(2000), key)];
}

test("intact anchors pass, signed or not", () => {
  expect(checkAnchors(two(), lookup)).toBeNull();
  expect(checkAnchors(two(KEY), lookup, KEY)).toBeNull();
});

test("a rewritten chain row and a truncated tail are told apart", () => {
  expect(checkAnchors(two(), (s) => (s === 9 ? "other" : lookup(s)))).toEqual({ seq: 9, reason: "rewritten" });
  expect(checkAnchors(two(), (s) => (s === 9 ? null : lookup(s)))).toEqual({ seq: 9, reason: "truncated" });
});

test("a removed or edited anchor breaks the anchor chain", () => {
  const [a, b] = two();
  expect(checkAnchors([b as Anchor], lookup)).toEqual({ seq: 9, reason: "anchor_chain" });
  expect(checkAnchors([{ ...(a as Anchor), hash: "x" }, b as Anchor], lookup)).toEqual({
    seq: 5,
    reason: "anchor_chain",
  });
});

test("with a key, an unsigned or wrongly signed anchor is refused", () => {
  expect(checkAnchors(two(), lookup, KEY)).toEqual({ seq: 5, reason: "signature" });
  expect(checkAnchors(two("other"), lookup, KEY)).toEqual({ seq: 5, reason: "signature" });
});
