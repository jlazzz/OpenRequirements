import { asc, count, gt, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { auditEvents } from "./db/schema.ts";
import { type ChainBreak, type ChainRow, verifyRows } from "./domain/auditchain.ts";

const PAGE = 1000;

/** Tamper evidence for the audit log (ADR 0020). Administrators only. */
export function auditLogRoutes({ app, db, requireUser, requireAdmin }: AppContext) {
  // Reads the whole chain in order, a page at a time, and reports the first row that does not fit.
  app.get("/api/audit/verify", { onRequest: [requireUser, requireAdmin] }, async () => {
    let after = { seq: 0, hash: "" };
    let checked = 0;
    let broken: ChainBreak | null = null;
    for (;;) {
      const rows = await db
        .select()
        .from(auditEvents)
        .where(gt(auditEvents.seq, after.seq))
        .orderBy(asc(auditEvents.seq))
        .limit(PAGE);
      if (rows.length === 0) break;
      const chain: ChainRow[] = rows.map((row) => ({
        id: row.id,
        at: row.at.toISOString(),
        actorUserId: row.actorUserId,
        projectId: row.projectId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        data: row.data,
        seq: row.seq as number,
        prevHash: row.prevHash ?? "",
        hash: row.hash ?? "",
      }));
      const result = verifyRows(chain, after);
      if (result.broken) {
        broken = result.broken;
        break;
      }
      checked += chain.length;
      after = result.last as { seq: number; hash: string };
    }
    const [unchained] = await db.select({ n: count() }).from(auditEvents).where(isNull(auditEvents.seq));
    return { ok: broken === null, checked, lastSeq: after.seq, unchained: unchained?.n ?? 0, firstBroken: broken };
  });
}
