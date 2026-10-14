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

export type Participant = { userId: string; role: "reviewer" | "approver"; signed: boolean };

/** Why a participant cannot be added to an open review, or null. A role change is a removal followed by an addition. */
export function addParticipantError(active: Participant[], userId: string): string | null {
  return active.some((p) => p.userId === userId) ? "This person already takes part in the review" : null;
}

/**
 * Why a participant cannot be removed from an open review, or null.
 * A signature stands for good, so an approver who signed stays; and a review never ends up with nobody in it.
 */
export function removeParticipantError(active: Participant[], userId: string): string | null {
  const person = active.find((p) => p.userId === userId);
  if (!person) return "This person does not take part in the review";
  if (person.signed) return "This approver has signed. Their signature stands, so they cannot be removed";
  if (active.length === 1) return "A review needs at least one reviewer or approver";
  return null;
}

/**
 * Whether an item is still what the review was about: every version saved since the baseline only changed Status.
 * `later` holds the versions after the reviewed one, oldest first.
 */
export function stillReviewed(later: { statusOnly: boolean }[]): boolean {
  return later.every((version) => version.statusOnly);
}

/** Opening a review shows it on the item: Status becomes "In review", unless the item is Approved or already there. */
export function opensAsInReview(current: unknown, options: string[] | null | undefined): boolean {
  return !!options?.includes("In review") && current !== "In review" && current !== "Approved";
}

/** True once there is at least one approver and every one of them has signed. */
export function allApproversSigned(approvers: { signed: boolean }[]): boolean {
  return approvers.length > 0 && approvers.every((a) => a.signed);
}

const CLOSED_AS: Record<Exclude<ReviewState, "open">, string> = {
  approved: "approved",
  rejected: "rejected",
  closed: "closed without a decision",
};

/** The one-line notification for a review that has just been closed. */
export function closingText(actor: string, review: string, state: Exclude<ReviewState, "open">): string {
  return `${actor} closed “${review}”: ${CLOSED_AS[state]}`;
}

export type RecordSignature = {
  name: string;
  meaning: "approval" | "rejection";
  signedAt: Date;
  valid: boolean;
};
export type RecordItem = { uid: string; name: string; revision: number; outcome: ItemOutcome };

/**
 * The closed review as table rows for the Word record: the signature block first, a blank row, then each item's
 * outcome. The first row of each block is its header. Rows are padded to one width.
 */
export function signedRecordRows(signatures: RecordSignature[], items: RecordItem[]): string[][] {
  const at = (date: Date) => date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const rows: string[][] = [
    ["Signed by", "Meaning", "Signed at", "Record"],
    ...signatures.map((s) => [
      s.name,
      s.meaning === "approval" ? "Approval" : "Rejection",
      at(s.signedAt),
      s.valid ? "Intact" : "Changed after signing",
    ]),
  ];
  if (signatures.length === 0) rows.push(["No signatures", "", "", ""]);
  rows.push(["", "", "", ""], ["Item", "Name", "Version", "Outcome"]);
  for (const item of items) rows.push([item.uid, item.name, String(item.revision), item.outcome]);
  return rows;
}
