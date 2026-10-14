import { and, eq, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { itemTypes, nodes, sets } from "./db/schema.ts";
import { traceGraph } from "./domain/trace.ts";
import { liveLinks } from "./links.ts";

const uuid = { type: "string", format: "uuid" } as const;
const levels = { type: "integer", minimum: 0, maximum: 4 } as const;

export function traceRoutes({ app, db, requireUser, access }: AppContext) {
  /** The live items of a project and the set each is in. */
  const liveItems = (projectId: string) =>
    db
      .select({ id: nodes.id, setId: nodes.setId })
      .from(nodes)
      .innerJoin(sets, eq(sets.id, nodes.setId))
      .where(and(eq(sets.projectId, projectId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)));

  // Trace view of a set: for each item, the items upstream and downstream of it, a few levels deep, as trees.
  // Coverage counts the items with nothing downstream and those that reach an item of the target set at any depth.
  app.get(
    "/api/sets/:setId/trace",
    {
      onRequest: requireUser,
      schema: {
        params: { type: "object", required: ["setId"], properties: { setId: uuid } },
        querystring: {
          type: "object",
          additionalProperties: false,
          // `target` is the set that counts as "tested". Left out, it is the first set whose item type is named like a test.
          properties: { up: { ...levels, default: 1 }, down: { ...levels, default: 2 }, target: uuid },
        },
      },
    },
    async (req, reply) => {
      const { setId } = req.params as { setId: string };
      const query = req.query as { up: number; down: number; target?: string };
      const projectId = await access(req, reply, { setId }, "viewer");
      if (!projectId) return reply;

      const projectSets = await db
        .select({ id: sets.id, itemType: itemTypes.name })
        .from(sets)
        .innerJoin(itemTypes, eq(itemTypes.id, sets.itemTypeId))
        .where(eq(sets.projectId, projectId))
        .orderBy(sets.position);
      const target = query.target
        ? projectSets.find((s) => s.id === query.target)
        : projectSets.find((s) => /test/i.test(s.itemType));
      if (query.target && !target) return reply.code(400).send({ error: "The target set is not in this project" });

      const items = await liveItems(projectId);
      const targets = new Set(items.filter((i) => i.setId === target?.id).map((i) => i.id));
      const graph = traceGraph(await liveLinks(db, projectId));
      // shortcut: every route to an item is listed in full, which is fine for 4 levels; cap the rows if a set is linked densely enough to matter
      const rows = items
        .filter((i) => i.setId === setId)
        .map(({ id }) => ({
          itemId: id,
          upstream: graph.walk(id, "upstream", { maxDepth: query.up }),
          downstream: graph.walk(id, "downstream", { maxDepth: query.down }),
          hasDownstream: graph.walk(id, "downstream", { maxDepth: 1 }).length > 0,
          reachesTarget: graph.reaches(id, targets),
        }));
      return {
        targetSetId: target?.id ?? null,
        coverage: {
          items: rows.length,
          noDownstream: rows.filter((r) => !r.hasDownstream).length,
          reachTarget: rows.filter((r) => r.reachesTarget).length,
        },
        rows,
      };
    },
  );

  // Impact analysis: everything downstream of an item, and everything upstream, at any depth.
  // An item reached by several routes is expanded once; a loop of relationships ends its branch.
  app.get(
    "/api/items/:itemId/impact",
    {
      onRequest: requireUser,
      schema: { params: { type: "object", required: ["itemId"], properties: { itemId: uuid } } },
    },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const projectId = await access(req, reply, { nodeId: itemId }, "viewer");
      if (!projectId) return reply;
      if (!(await liveItems(projectId)).some((i) => i.id === itemId))
        return reply.code(404).send({ error: "Item not found" });
      const graph = traceGraph(await liveLinks(db, projectId));
      return {
        downstream: graph.walk(itemId, "downstream", { once: true }),
        upstream: graph.walk(itemId, "upstream", { once: true }),
      };
    },
  );
}
