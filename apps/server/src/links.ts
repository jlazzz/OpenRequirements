import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import { describe } from "./access.ts";
import type { AppContext, Tx } from "./app.ts";
import type { Db } from "./db/client.ts";
import { itemRevisions, linkRevisions, links, linkTypes, nodes, sets } from "./db/schema.ts";
import { changedEnds } from "./domain/suspect.ts";
import { type MailConfig, type Notice, notify } from "./mail.ts";

const uuid = { type: "string", format: "uuid" } as const;
const revision = { type: "integer", minimum: 1 } as const;

/**
 * The live relationships of a project, or only those touching one set or having one of the given ids.
 * Each carries the revisions it was last confirmed against, the current ones, and which end changed since.
 */
export async function liveLinks(
  db: Pick<Db, "select">,
  projectId: string,
  only: { setId?: string; ids?: string[] } = {},
) {
  const up = alias(nodes, "up");
  const down = alias(nodes, "down");
  // A version that only changed Status is not a change to review, so it is skipped (ADR 0010).
  const current = (item: AnyPgColumn) =>
    sql<number>`(select max(r.number) from item_revisions r where r.item_id = ${item} and not r.status_only)`;
  // The latest confirmation, or the revisions stored on the link when it has never been confirmed.
  const confirmed = (end: "upstream_revision" | "downstream_revision", made: AnyPgColumn) =>
    sql<number>`coalesce((select ${sql.raw(`c.${end}`)} from link_revisions c where c.link_id = ${links.id} order by c.number desc limit 1), ${made})`;
  // shortcut: reads every link of the project, query per set or per item when projects reach tens of thousands of links
  const rows = await db
    .select({
      id: links.id,
      typeId: links.linkTypeId,
      upstreamId: links.upstreamId,
      downstreamId: links.downstreamId,
      confirmedUp: confirmed("upstream_revision", links.upstreamRevision),
      confirmedDown: confirmed("downstream_revision", links.downstreamRevision),
      currentUp: current(up.id),
      currentDown: current(down.id),
    })
    .from(links)
    .innerJoin(up, eq(up.id, links.upstreamId))
    .innerJoin(down, eq(down.id, links.downstreamId))
    // A link to a deleted item is hidden, and comes back if the item is ever restored.
    .where(
      and(
        eq(links.projectId, projectId),
        isNull(links.deletedAt),
        isNull(up.deletedAt),
        isNull(down.deletedAt),
        only.setId ? or(eq(up.setId, only.setId), eq(down.setId, only.setId)) : undefined,
        only.ids ? inArray(links.id, only.ids) : undefined,
      ),
    )
    .orderBy(links.createdAt);
  return rows.map(({ confirmedUp, confirmedDown, currentUp, currentDown, ...link }) => {
    const confirmed = { upstream: confirmedUp, downstream: confirmedDown };
    const current = { upstream: currentUp, downstream: currentDown };
    return { ...link, confirmed, current, changed: changedEnds(confirmed, current) };
  });
}

/**
 * Call in a transaction before new versions of `itemIds` are saved. The function it returns, called after the save,
 * notifies whoever saved the far end of each relationship that has just become suspect.
 */
export async function watchSuspect(
  tx: Tx,
  mail: MailConfig,
  projectId: string,
  itemIds: string[],
  actor: { id: string; name: string },
) {
  const touching = await tx
    .select({ id: links.id })
    .from(links)
    .where(and(isNull(links.deletedAt), or(inArray(links.upstreamId, itemIds), inArray(links.downstreamId, itemIds))));
  if (touching.length === 0) return async () => {};
  const ids = touching.map((link) => link.id);
  const wasSuspect = new Set(
    (await liveLinks(tx, projectId, { ids }))
      .filter((l) => l.changed.upstream || l.changed.downstream)
      .map((l) => l.id),
  );
  return async () => {
    const notices: Notice[] = [];
    for (const link of await liveLinks(tx, projectId, { ids })) {
      if (wasSuspect.has(link.id) || !(link.changed.upstream || link.changed.downstream)) continue;
      const ends = [
        [link.upstreamId, link.downstreamId],
        [link.downstreamId, link.upstreamId],
      ] as const;
      for (const [changed, other] of ends) {
        if (!itemIds.includes(changed)) continue;
        const [last] = await tx
          .select({ authorId: itemRevisions.authorId })
          .from(itemRevisions)
          .where(eq(itemRevisions.itemId, other))
          .orderBy(desc(itemRevisions.number))
          .limit(1);
        if (!last) continue;
        const changedLabel = (await describe(tx, "item", changed)).label;
        const otherLabel = (await describe(tx, "item", other)).label;
        notices.push({
          userId: last.authorId,
          projectId,
          kind: "suspect",
          text: `${actor.name} changed ${changedLabel}. Its relationship with ${otherLabel}, which you saved last, is now suspect.`,
          path: `/projects/${projectId}/items/${other}`,
          actorId: actor.id,
        });
      }
    }
    await notify(tx, mail, notices);
  };
}

export function linkRoutes({ app, db, requireUser, audit, access }: AppContext) {
  // Every live relationship of a project. The item side panel, the matrix and the coverage filter all read this.
  app.get(
    "/api/projects/:projectId/links",
    {
      onRequest: requireUser,
      schema: { params: { type: "object", required: ["projectId"], properties: { projectId: uuid } } },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const types = await db
        .select({ id: linkTypes.id, name: linkTypes.name })
        .from(linkTypes)
        .where(eq(linkTypes.projectId, projectId))
        .orderBy(linkTypes.position);
      return { linkTypes: types, links: await liveLinks(db, projectId) };
    },
  );

  app.post(
    "/api/links",
    {
      onRequest: requireUser,
      schema: {
        body: {
          type: "object",
          required: ["upstreamId", "downstreamId", "typeId"],
          additionalProperties: false,
          properties: { upstreamId: uuid, downstreamId: uuid, typeId: uuid },
        },
      },
    },
    async (req, reply) => {
      const { upstreamId, downstreamId, typeId } = req.body as {
        upstreamId: string;
        downstreamId: string;
        typeId: string;
      };
      const userId = req.user?.id as string;
      if (!(await access(req, reply, { nodeId: upstreamId }, "editor"))) return reply;
      if (upstreamId === downstreamId) return reply.code(400).send({ error: "An item cannot be linked to itself" });

      const result = await db.transaction(async (tx) => {
        // Locks both items in a fixed order, so two requests linking the same pair cannot both pass the duplicate check.
        const ends = await tx
          .select({ id: nodes.id, projectId: sets.projectId })
          .from(nodes)
          .innerJoin(sets, eq(sets.id, nodes.setId))
          .where(and(inArray(nodes.id, [upstreamId, downstreamId]), eq(nodes.kind, "item"), isNull(nodes.deletedAt)))
          .orderBy(nodes.id)
          .for("update", { of: nodes });
        const projectId = ends[0]?.projectId;
        if (ends.length !== 2 || !projectId) return { error: [404, "Item not found"] } as const;
        if (ends[1]?.projectId !== projectId)
          return { error: [400, "Both items must be in the same project"] } as const;
        const [type] = await tx
          .select({ id: linkTypes.id })
          .from(linkTypes)
          .where(and(eq(linkTypes.id, typeId), eq(linkTypes.projectId, projectId)));
        if (!type) return { error: [400, "Unknown relationship type"] } as const;

        const [existing] = await tx
          .select({ id: links.id })
          .from(links)
          .where(
            and(
              isNull(links.deletedAt),
              or(
                and(eq(links.upstreamId, upstreamId), eq(links.downstreamId, downstreamId)),
                and(eq(links.upstreamId, downstreamId), eq(links.downstreamId, upstreamId)),
              ),
            ),
          );
        if (existing) return { error: [409, "These two items are already linked"] } as const;

        const revisionOf = async (itemId: string) => {
          const [latest] = await tx
            .select({ number: itemRevisions.number })
            .from(itemRevisions)
            .where(eq(itemRevisions.itemId, itemId))
            .orderBy(desc(itemRevisions.number))
            .limit(1);
          if (!latest) throw new Error(`item ${itemId} has no revision`);
          return latest.number;
        };
        const [link] = await tx
          .insert(links)
          .values({
            projectId,
            linkTypeId: typeId,
            upstreamId,
            downstreamId,
            upstreamRevision: await revisionOf(upstreamId),
            downstreamRevision: await revisionOf(downstreamId),
            createdBy: userId,
          })
          .returning({ id: links.id });
        if (!link) throw new Error("link insert returned no row");
        await audit(tx, userId, "link.create", "link", link.id);
        return { link: { id: link.id, typeId, upstreamId, downstreamId } };
      });

      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  // Confirms suspect relationships: each gets a new link revision holding the current revisions of both ends.
  // One request covers "Confirm" and "Confirm all for this item"; all of it succeeds or none.
  app.post(
    "/api/projects/:projectId/links/confirm",
    {
      onRequest: requireUser,
      schema: {
        params: { type: "object", required: ["projectId"], properties: { projectId: uuid } },
        body: {
          type: "object",
          required: ["links"],
          additionalProperties: false,
          properties: {
            links: {
              type: "array",
              minItems: 1,
              maxItems: 500,
              items: {
                type: "object",
                required: ["id", "upstreamRevision", "downstreamRevision"],
                additionalProperties: false,
                // The revisions the person was looking at, so nobody confirms a version they have not seen.
                properties: { id: uuid, upstreamRevision: revision, downstreamRevision: revision },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "editor"))) return reply;
      const userId = req.user?.id as string;
      const { links: asked } = req.body as {
        links: { id: string; upstreamRevision: number; downstreamRevision: number }[];
      };
      const seen = new Map(asked.map((link) => [link.id, link]));
      const ids = [...seen.keys()];

      const result = await db.transaction(async (tx) => {
        // Locks the links, so two people confirming one link cannot both take the same revision number.
        await tx.select({ id: links.id }).from(links).where(inArray(links.id, ids)).orderBy(links.id).for("update");
        const live = await liveLinks(tx, projectId, { ids });
        if (live.length !== ids.length) return { error: [404, "Relationship not found"] } as const;
        const stale = live.some((link) => {
          const sent = seen.get(link.id);
          return (
            sent?.upstreamRevision !== link.current.upstream || sent.downstreamRevision !== link.current.downstream
          );
        });
        if (stale) return { error: [409, "An item changed again. Reload and review it before confirming."] } as const;

        const suspect = live.filter((link) => link.changed.upstream || link.changed.downstream);
        if (suspect.length === 0) return { confirmed: 0 };
        const last = await tx
          .select({ linkId: linkRevisions.linkId, number: sql<number>`max(${linkRevisions.number})` })
          .from(linkRevisions)
          .where(inArray(linkRevisions.linkId, ids))
          .groupBy(linkRevisions.linkId);
        const lastOf = new Map(last.map((row) => [row.linkId, row.number]));
        await tx.insert(linkRevisions).values(
          suspect.map((link) => ({
            linkId: link.id,
            number: (lastOf.get(link.id) ?? 0) + 1,
            upstreamRevision: link.current.upstream,
            downstreamRevision: link.current.downstream,
            confirmedBy: userId,
          })),
        );
        for (const link of suspect) await audit(tx, userId, "link.confirm", "link", link.id);
        return { confirmed: suspect.length };
      });

      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // Soft delete: the row stays, so history and later baselines can still refer to it.
  app.delete(
    "/api/links/:linkId",
    {
      onRequest: requireUser,
      schema: { params: { type: "object", required: ["linkId"], properties: { linkId: uuid } } },
    },
    async (req, reply) => {
      const { linkId } = req.params as { linkId: string };
      if (!(await access(req, reply, { linkId }, "editor"))) return reply;
      const removed = await db.transaction(async (tx) => {
        const rows = await tx
          .update(links)
          .set({ deletedAt: new Date() })
          .where(and(eq(links.id, linkId), isNull(links.deletedAt)))
          .returning({ id: links.id });
        if (rows.length > 0) await audit(tx, req.user?.id ?? null, "link.delete", "link", linkId);
        return rows.length > 0;
      });
      if (!removed) return reply.code(404).send({ error: "Relationship not found" });
      return { ok: true };
    },
  );
}
