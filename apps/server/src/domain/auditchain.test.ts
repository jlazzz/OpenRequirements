import { expect, test } from "vitest";
import { auditHash, type ChainContent, type ChainRow, GENESIS, verifyRows } from "./auditchain.ts";

function build(n: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prev = GENESIS;
  for (let i = 1; i <= n; i++) {
    const c: ChainContent = {
      id: `id-${i}`,
      at: `2026-01-01T00:00:0${i}.000Z`,
      actorUserId: i % 2 ? "u1" : null,
      projectId: null,
      action: "item.update",
      entityType: "item",
      entityId: `e${i}`,
      data: i % 2 ? { label: `L${i}` } : null,
    };
    const hash = auditHash(prev, c);
    rows.push({ ...c, seq: i, prevHash: prev, hash });
    prev = hash;
  }
  return rows;
}

test("an untouched chain verifies and reports its last row", () => {
  const result = verifyRows(build(4));
  expect(result.broken).toBeNull();
  expect(result.last?.seq).toBe(4);
});

test("a changed field is reported at that row", () => {
  const rows = build(4);
  (rows[2] as ChainRow).action = "item.delete";
  expect(verifyRows(rows).broken).toEqual({ seq: 3, id: "id-3", reason: "content" });
});

test("a row rewritten together with its own hash breaks the next link", () => {
  const rows = build(4);
  const r = rows[1] as ChainRow;
  r.entityId = "forged";
  r.hash = auditHash(r.prevHash, r);
  expect(verifyRows(rows).broken).toEqual({ seq: 3, id: "id-3", reason: "link" });
});

test("a deleted row, or a missing start, is a sequence break", () => {
  const rows = build(4);
  expect(verifyRows([rows[0] as ChainRow, rows[2] as ChainRow]).broken?.reason).toBe("sequence");
  expect(verifyRows(rows.slice(1)).broken).toEqual({ seq: 2, id: "id-2", reason: "sequence" });
});

test("verification can continue from the last verified row", () => {
  const rows = build(5);
  const first = verifyRows(rows.slice(0, 3));
  expect(verifyRows(rows.slice(3), first.last).broken).toBeNull();
});
