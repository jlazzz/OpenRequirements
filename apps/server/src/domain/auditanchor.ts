import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** A published copy of the audit chain's head (ADR 0024). Anchors are themselves chained and optionally signed. */
export type Anchor = {
  /** Audit chain position and hash being anchored. */
  seq: number;
  hash: string;
  /** ISO string, millisecond precision. */
  at: string;
  /** `anchorHash` of the anchor before this one, "" for the first. */
  prevAnchorHash: string;
  anchorHash: string;
  /** HMAC-SHA256 of `anchorHash` with the instance's anchor key, or null when no key is set. */
  signature: string | null;
};

export function anchorHash(prevAnchorHash: string, a: Pick<Anchor, "seq" | "hash" | "at">): string {
  const body = JSON.stringify([a.seq, a.hash, a.at]);
  return createHash("sha256").update(prevAnchorHash).update("\n").update(body).digest("hex");
}

export function sign(key: string, hash: string): string {
  return createHmac("sha256", key).update(hash).digest("hex");
}

export function makeAnchor(prev: Anchor | null, head: { seq: number; hash: string }, at: Date, key?: string): Anchor {
  const prevAnchorHash = prev?.anchorHash ?? "";
  const iso = at.toISOString();
  const h = anchorHash(prevAnchorHash, { seq: head.seq, hash: head.hash, at: iso });
  return {
    seq: head.seq,
    hash: head.hash,
    at: iso,
    prevAnchorHash,
    anchorHash: h,
    signature: key ? sign(key, h) : null,
  };
}

export type AnchorBreak = {
  seq: number;
  reason:
    | "anchor_chain" // the anchors do not follow from each other: one was changed, removed or reordered
    | "signature" // not signed by this instance's key
    | "truncated" // the live chain ends before the anchored row: the newest rows were deleted
    | "rewritten"; // the live row at that position has another hash than the one anchored
};

/**
 * Checks anchors (oldest first) against the live chain. `liveHash(seq)` gives the hash of the chain row at that
 * position, or null when there is none. Returns the first problem.
 */
export function checkAnchors(
  anchors: Anchor[],
  liveHash: (seq: number) => string | null,
  key?: string,
): AnchorBreak | null {
  let prev = "";
  for (const a of anchors) {
    if (a.prevAnchorHash !== prev || anchorHash(a.prevAnchorHash, a) !== a.anchorHash) {
      return { seq: a.seq, reason: "anchor_chain" };
    }
    if (key) {
      const expected = Buffer.from(sign(key, a.anchorHash));
      const got = Buffer.from(a.signature ?? "");
      if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { seq: a.seq, reason: "signature" };
    }
    const live = liveHash(a.seq);
    if (live === null) return { seq: a.seq, reason: "truncated" };
    if (live !== a.hash) return { seq: a.seq, reason: "rewritten" };
    prev = a.anchorHash;
  }
  return null;
}
