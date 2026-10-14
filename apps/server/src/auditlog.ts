import { appendFile } from "node:fs/promises";
import { asc, count, desc, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { audit } from "./access.ts";
import type { AppContext } from "./app.ts";
import type { Db } from "./db/client.ts";
import { auditAnchors, auditEvents } from "./db/schema.ts";
import { type Anchor, type AnchorBreak, checkAnchors, makeAnchor } from "./domain/auditanchor.ts";
import { type ChainBreak, type ChainRow, verifyRows } from "./domain/auditchain.ts";

const PAGE = 1000;
const ANCHOR_LOCK = 7_104_002;

export type AnchorOptions = {
  /** Signs each anchor (HMAC-SHA256). Keep it outside the database. */
  key?: string;
  /** Each new anchor is also appended here as one JSON line, ideally on another volume. */
  file?: string;
};

const toAnchor = (row: typeof auditAnchors.$inferSelect): Anchor => ({
  seq: row.seq,
  hash: row.hash,
  at: row.at.toISOString(),
  prevAnchorHash: row.prevAnchorHash,
  anchorHash: row.anchorHash,
  signature: row.signature,
});

/**
 * Saves the chain's current head as an anchor. Returns null when the chain is empty or already anchored at its
 * head. Serialised by its own lock, so anchors form one line; the audit lock is not held, so writes are not slowed.
 */
export async function createAnchor(db: Db, opts: AnchorOptions, actorUserId: string | null): Promise<Anchor | null> {
  const anchor = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ANCHOR_LOCK})`);
    const [head] = await tx
      .select({ seq: auditEvents.seq, hash: auditEvents.hash })
      .from(auditEvents)
      .where(isNotNull(auditEvents.seq))
      .orderBy(desc(auditEvents.seq))
      .limit(1);
    if (!head) return null;
    const [last] = await tx.select().from(auditAnchors).orderBy(desc(auditAnchors.seq)).limit(1);
    if (last && last.seq >= (head.seq as number)) return null;
    const made = makeAnchor(
      last ? toAnchor(last) : null,
      { seq: head.seq as number, hash: head.hash as string },
      new Date(),
      opts.key,
    );
    const [row] = await tx
      .insert(auditAnchors)
      .values({ ...made, at: new Date(made.at), createdBy: actorUserId })
      .returning();
    await audit(tx, actorUserId, "audit.anchor", "audit", (row as { id: string }).id, {
      label: `Anchored audit log at event ${made.seq}`,
    });
    return made;
  });
  if (anchor && opts.file) await appendFile(opts.file, `${JSON.stringify(anchor)}\n`);
  return anchor;
}

/** Latest anchor's time, for the scheduled job. */
export async function lastAnchorAt(db: Db): Promise<Date | null> {
  const [last] = await db.select({ at: auditAnchors.at }).from(auditAnchors).orderBy(desc(auditAnchors.seq)).limit(1);
  return last?.at ?? null;
}

async function liveHashes(db: Db, seqs: number[]) {
  const out = new Map<number, string>();
  if (seqs.length === 0) return out;
  const rows = await db
    .select({ seq: auditEvents.seq, hash: auditEvents.hash })
    .from(auditEvents)
    .where(inArray(auditEvents.seq, seqs));
  for (const r of rows) out.set(r.seq as number, r.hash as string);
  return out;
}

async function anchorCheck(
  db: Db,
  anchors: Anchor[],
  key?: string,
): Promise<{ checked: number; firstBad: AnchorBreak | null }> {
  const live = await liveHashes(
    db,
    anchors.map((a) => a.seq),
  );
  return { checked: anchors.length, firstBad: checkAnchors(anchors, (s) => live.get(s) ?? null, key) };
}

/** Tamper evidence for the audit log (ADR 0020). Administrators only. */
export function auditLogRoutes({ app, db, requireUser, requireAdmin }: AppContext, anchorOpts: AnchorOptions = {}) {
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
    const stored = (await db.select().from(auditAnchors).orderBy(asc(auditAnchors.seq))).map(toAnchor);
    const anchors = await anchorCheck(db, stored, anchorOpts.key);
    return {
      ok: broken === null && anchors.firstBad === null,
      checked,
      lastSeq: after.seq,
      unchained: unchained?.n ?? 0,
      firstBroken: broken,
      anchors: { ...anchors, signed: Boolean(anchorOpts.key) },
    };
  });

  // The anchors, to be kept somewhere the database cannot change. Oldest first.
  app.get("/api/audit/anchors", { onRequest: [requireUser, requireAdmin] }, async () => ({
    anchors: (await db.select().from(auditAnchors).orderBy(asc(auditAnchors.seq))).map(toAnchor),
  }));

  app.post("/api/audit/anchors", { onRequest: [requireUser, requireAdmin] }, async (req) => {
    const anchor = await createAnchor(db, anchorOpts, req.user?.id ?? null);
    return { created: anchor !== null, anchor };
  });

  // Checks a saved copy of the anchors, which the database cannot have altered, against the live chain.
  // `missing` lists anchors in the copy that this database no longer holds.
  app.post(
    "/api/audit/anchors/verify",
    {
      onRequest: [requireUser, requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["anchors"],
          properties: {
            anchors: {
              type: "array",
              maxItems: 100000,
              items: {
                type: "object",
                required: ["seq", "hash", "at", "prevAnchorHash", "anchorHash"],
                properties: {
                  seq: { type: "integer" },
                  hash: { type: "string" },
                  at: { type: "string" },
                  prevAnchorHash: { type: "string" },
                  anchorHash: { type: "string" },
                  signature: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const copy = [...(req.body as { anchors: Anchor[] }).anchors].sort((a, b) => a.seq - b.seq);
      const check = await anchorCheck(db, copy, anchorOpts.key);
      const held = await db
        .select({ anchorHash: auditAnchors.anchorHash })
        .from(auditAnchors)
        .where(
          inArray(
            auditAnchors.seq,
            copy.map((a) => a.seq),
          ),
        );
      const heldHashes = new Set(held.map((h) => h.anchorHash));
      const missing = copy.filter((a) => !heldHashes.has(a.anchorHash)).map((a) => a.seq);
      return { ok: check.firstBad === null && missing.length === 0, ...check, missing };
    },
  );
}
