import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AppContext } from "./app.ts";
import { itemRevisions, links, linkTypes, nodes, sets } from "./db/schema.ts";

const uuid = { type: "string", format: "uuid" } as const;

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
      const up = alias(nodes, "up");
      const down = alias(nodes, "down");
      // shortcut: returns every link of the project, query per set or per item when projects reach tens of thousands of links
      const rows = await db
        .select({
          id: links.id,
          typeId: links.linkTypeId,
          upstreamId: links.upstreamId,
          downstreamId: links.downstreamId,
        })
        .from(links)
        .innerJoin(up, eq(up.id, links.upstreamId))
        .innerJoin(down, eq(down.id, links.downstreamId))
        // A link to a deleted item is hidden, and comes back if the item is ever restored.
        .where(
          and(eq(links.projectId, projectId), isNull(links.deletedAt), isNull(up.deletedAt), isNull(down.deletedAt)),
        )
        .orderBy(links.createdAt);
      return { linkTypes: types, links: rows };
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
