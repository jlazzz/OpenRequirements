import { createHash } from "node:crypto";

/** What an audit row's hash covers. `at` is an ISO string with millisecond precision. */
export type ChainContent = {
  id: string;
  at: string;
  actorUserId: string | null;
  projectId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  data: { label?: string; mentions?: string[] } | null;
};

export type ChainRow = ChainContent & { seq: number; prevHash: string; hash: string };

/** Hash of the row before the first one in the chain. */
export const GENESIS = "";

/** Fixed field order and no whitespace, so the same content always gives the same hash. */
export function auditHash(prevHash: string, c: ChainContent): string {
  const body = JSON.stringify([
    c.id,
    c.at,
    c.actorUserId,
    c.projectId,
    c.action,
    c.entityType,
    c.entityId,
    c.data === null ? null : [c.data.label ?? null, c.data.mentions ?? null],
  ]);
  return createHash("sha256").update(prevHash).update("\n").update(body).digest("hex");
}

export type ChainBreak = { seq: number; id: string; reason: "sequence" | "link" | "content" };

/**
 * Checks rows in sequence order, continuing from `after` (the last verified seq and hash; the chain starts at seq 1).
 * Returns the first break: a gap or repeat in the sequence, a prevHash that is not the row before's hash, or a hash
 * that does not match the row's content.
 */
export function verifyRows(rows: ChainRow[], after: { seq: number; hash: string } = { seq: 0, hash: GENESIS }) {
  let seq = after.seq;
  let hash = after.hash;
  for (const row of rows) {
    if (row.seq !== seq + 1) return { broken: { seq: row.seq, id: row.id, reason: "sequence" } as ChainBreak };
    if (row.prevHash !== hash) return { broken: { seq: row.seq, id: row.id, reason: "link" } as ChainBreak };
    if (auditHash(row.prevHash, row) !== row.hash) {
      return { broken: { seq: row.seq, id: row.id, reason: "content" } as ChainBreak };
    }
    seq = row.seq;
    hash = row.hash;
  }
  return { broken: null, last: { seq, hash } };
}
