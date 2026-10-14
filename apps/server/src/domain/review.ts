import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { RichNode } from "@app/shared";

/** What a participant can record on one item. An approver's "approved" or "rejected" is their decision; "cleared" takes a mark back. */
export const MARKS = ["reviewed", "approved", "rejected", "cleared"] as const;
export type Mark = (typeof MARKS)[number];
export type ReviewState = "open" | "closed" | "approved" | "rejected";
export type ItemOutcome = "approved" | "rejected" | "undecided";

/** One item's outcome: rejected if any approver rejected it, approved when every approver approved it. */
export function itemOutcome(marks: (Mark | undefined)[]): ItemOutcome {
  if (marks.includes("rejected")) return "rejected";
  return marks.length > 0 && marks.every((mark) => mark === "approved") ? "approved" : "undecided";
}

/**
 * The state a review gets when it is closed. `markOf` is an approver's latest mark on an item.
 * It is a decision only when there are approvers and every one of them signed; otherwise the review is just closed.
 * Then it is approved when every item is approved, and rejected otherwise.
 */
export function closedState(
  itemIds: string[],
  approvers: { userId: string; signed: boolean }[],
  markOf: (itemId: string, userId: string) => Mark | undefined,
): Exclude<ReviewState, "open"> {
  if (approvers.length === 0 || !approvers.every((approver) => approver.signed)) return "closed";
  const outcomes = itemIds.map((itemId) => itemOutcome(approvers.map(({ userId }) => markOf(itemId, userId))));
  return outcomes.every((outcome) => outcome === "approved") ? "approved" : "rejected";
}

/** What an electronic signature covers. Names and UIDs, not database ids, so it still checks out after a backup is restored. */
export type Signed = {
  review: string;
  baseline: string;
  signerEmail: string;
  signerName: string;
  meaning: "approval" | "rejection";
  signedAt: Date;
  decisions: { uid: string; revision: number; mark: Mark }[];
};

/**
 * SHA-256 over everything a signature covers. Stored with the signature and worked out again when the review is read:
 * a mismatch means the signed record was altered afterwards, or the signature was moved to another record.
 */
export function signatureDigest(signed: Signed): string {
  const decisions = signed.decisions
    .map(({ uid, revision, mark }) => [uid, revision, mark] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const text = JSON.stringify([
    signed.review,
    signed.baseline,
    signed.signerEmail,
    signed.signerName,
    signed.meaning,
    signed.signedAt.toISOString(),
    decisions,
  ]);
  return createHash("sha256").update(text).digest("hex");
}

type Content = { name: string; description: RichNode; attributes: Record<string, unknown> };

/**
 * Whether a new version says the same as the one before it, apart from the Status field.
 * Such a version does not make relationships suspect or test results out of date: nothing a reader relies on changed.
 */
export function onlyStatusChanged(before: Content, after: Content, statusFieldId: string | undefined): boolean {
  const rest = ({ [statusFieldId ?? ""]: _, ...attributes }: Record<string, unknown>) => attributes;
  return (
    before.name === after.name &&
    isDeepStrictEqual(before.description, after.description) &&
    isDeepStrictEqual(rest(before.attributes), rest(after.attributes))
  );
}
