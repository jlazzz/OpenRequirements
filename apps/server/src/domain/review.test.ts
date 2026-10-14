import { textToDoc } from "@app/shared";
import { describe, expect, it, test } from "vitest";
import {
  addParticipantError,
  allApproversSigned,
  closedState,
  closingText,
  itemOutcome,
  type Mark,
  onlyStatusChanged,
  opensAsInReview,
  removeParticipantError,
  type Signed,
  signatureDigest,
  signedRecordRows,
  stillReviewed,
} from "./review.ts";

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

describe("participants", () => {
  const a = { userId: "a", role: "approver" as const, signed: false };
  const b = { userId: "b", role: "reviewer" as const, signed: false };
  it("refuses a second addition of the same person", () => {
    expect(addParticipantError([a], "a")).not.toBeNull();
    expect(addParticipantError([a], "b")).toBeNull();
  });
  it("keeps a signer and the last participant", () => {
    expect(removeParticipantError([a, b], "b")).toBeNull();
    expect(removeParticipantError([{ ...a, signed: true }, b], "a")).not.toBeNull();
    expect(removeParticipantError([a], "a")).not.toBeNull();
    expect(removeParticipantError([a], "x")).not.toBeNull();
  });
  it("a status-only version leaves an item as reviewed", () => {
    expect(stillReviewed([])).toBe(true);
    expect(stillReviewed([{ statusOnly: true }])).toBe(true);
    expect(stillReviewed([{ statusOnly: true }, { statusOnly: false }])).toBe(false);
  });
  it("opens as In review only from other statuses with that option", () => {
    expect(opensAsInReview("Draft", ["Draft", "In review"])).toBe(true);
    expect(opensAsInReview(undefined, ["In review"])).toBe(true);
    expect(opensAsInReview("Approved", ["In review", "Approved"])).toBe(false);
    expect(opensAsInReview("In review", ["In review"])).toBe(false);
    expect(opensAsInReview("Draft", ["Draft"])).toBe(false);
  });
});

describe("notifications and the signed record", () => {
  it("knows when every approver has signed", () => {
    expect(allApproversSigned([])).toBe(false);
    expect(allApproversSigned([{ signed: true }, { signed: false }])).toBe(false);
    expect(allApproversSigned([{ signed: true }, { signed: true }])).toBe(true);
  });

  it("words the closing", () => {
    expect(closingText("Ana", "R1", "approved")).toBe("Ana closed “R1”: approved");
    expect(closingText("Ana", "R1", "closed")).toContain("without a decision");
  });

  it("lays out signatures, a blank row, then items", () => {
    const rows = signedRecordRows(
      [{ name: "Ana", meaning: "approval", signedAt: new Date("2026-10-14T09:30:00Z"), valid: false }],
      [{ uid: "SRS-001", name: "Speed", revision: 2, outcome: "approved" }],
    );
    expect(rows[1]).toEqual(["Ana", "Approval", "2026-10-14 09:30 UTC", "Changed after signing"]);
    expect(rows[2]).toEqual(["", "", "", ""]);
    expect(rows[4]).toEqual(["SRS-001", "Speed", "2", "approved"]);
    expect(signedRecordRows([], [])[1]?.[0]).toBe("No signatures");
  });
});
