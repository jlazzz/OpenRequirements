import { textToDoc } from "@app/shared";
import { expect, test } from "vitest";
import { closedState, itemOutcome, type Mark, onlyStatusChanged, type Signed, signatureDigest } from "./review.ts";

test("an item is approved only when every approver approved it, and one rejection rejects it", () => {
  expect(itemOutcome(["approved", "approved"])).toBe("approved");
  expect(itemOutcome(["approved", "rejected"])).toBe("rejected");
  expect(itemOutcome(["approved", undefined])).toBe("undecided");
  expect(itemOutcome(["approved", "cleared"])).toBe("undecided");
  expect(itemOutcome([])).toBe("undecided");
});

test("a review is decided only when every approver signed; then one rejected item rejects it", () => {
  const marks: Record<string, Mark> = { "a:ann": "approved", "b:ann": "approved", "a:bob": "approved" };
  const markOf = (itemId: string, userId: string) => marks[`${itemId}:${userId}`];
  const signed = (...names: string[]) => ["ann", "bob"].map((userId) => ({ userId, signed: names.includes(userId) }));

  expect(closedState(["a", "b"], [], markOf)).toBe("closed");
  expect(closedState(["a", "b"], signed("ann"), markOf)).toBe("closed");
  marks["b:bob"] = "rejected";
  expect(closedState(["a", "b"], signed("ann", "bob"), markOf)).toBe("rejected");
  marks["b:bob"] = "approved";
  expect(closedState(["a", "b"], signed("ann", "bob"), markOf)).toBe("approved");
});

test("a signature digest ignores the order of decisions and changes with anything it covers", () => {
  const signed: Signed = {
    review: "Design review",
    baseline: "1.0",
    signerEmail: "ann@example.com",
    signerName: "Ann",
    meaning: "approval",
    signedAt: new Date("2026-10-13T10:00:00Z"),
    decisions: [
      { uid: "SYS-001", revision: 2, mark: "approved" },
      { uid: "SYS-002", revision: 1, mark: "approved" },
    ],
  };
  const digest = signatureDigest(signed);
  expect(digest).toMatch(/^[0-9a-f]{64}$/);
  expect(signatureDigest({ ...signed, decisions: [...signed.decisions].reverse() })).toBe(digest);
  expect(signatureDigest({ ...signed, meaning: "rejection" })).not.toBe(digest);
  expect(signatureDigest({ ...signed, review: "Another review" })).not.toBe(digest);
  expect(signatureDigest({ ...signed, decisions: [{ uid: "SYS-001", revision: 3, mark: "approved" }] })).not.toBe(
    digest,
  );
});

test("a version that only changes Status is told apart from one that changes content", () => {
  const before = { name: "Supply", description: textToDoc("5 V"), attributes: { status: "Draft", priority: "High" } };
  const approved = { ...before, attributes: { priority: "High", status: "Approved" } };
  expect(onlyStatusChanged(before, approved, "status")).toBe(true);
  expect(onlyStatusChanged(before, { ...before, attributes: { priority: "High" } }, "status")).toBe(true);
  expect(onlyStatusChanged(before, { ...approved, name: "Supply voltage" }, "status")).toBe(false);
  expect(onlyStatusChanged(before, { ...approved, description: textToDoc("6 V") }, "status")).toBe(false);
  expect(
    onlyStatusChanged(before, { ...approved, attributes: { status: "Approved", priority: "Low" } }, "status"),
  ).toBe(false);
  // An item type with no Status field: only an identical version counts.
  expect(onlyStatusChanged(before, approved, undefined)).toBe(false);
});
