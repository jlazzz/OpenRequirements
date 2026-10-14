import { and, eq, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { baselineEntries, baselineLinks, baselines, itemTypes, links, nodes, sets } from "./db/schema.ts";
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
          // `target` is the set that counts as "tested". Left out, it is the first set of test cases.
          // `linkTypeId` follows one relationship type only. `baselineId` traces the relationships and items of a baseline.
          properties: {
            up: { ...levels, default: 1 },
            down: { ...levels, default: 2 },
            target: uuid,
            linkTypeId: uuid,
            baselineId: uuid,
          },
        },
      },
    },
    async (req, reply) => {
      const { setId } = req.params as { setId: string };
      const query = req.query as {
        up: number;
        down: number;
        target?: string;
        linkTypeId?: string;
        baselineId?: string;
      };
      const projectId = await access(req, reply, { setId }, "viewer");
      if (!projectId) return reply;

      const projectSets = await db
        .select({ id: sets.id, role: itemTypes.role })
        .from(sets)
        .innerJoin(itemTypes, eq(itemTypes.id, sets.itemTypeId))
        .where(eq(sets.projectId, projectId))
        .orderBy(sets.position);
      const target = query.target
        ? projectSets.find((s) => s.id === query.target)
        : projectSets.find((s) => s.role === "test");
      if (query.target && !target) return reply.code(400).send({ error: "The target set is not in this project" });

      let items = await liveItems(projectId);
      let traced: { id: string; typeId: string; upstreamId: string; downstreamId: string }[] = await liveLinks(
        db,
        projectId,
      );
      let suspectLinkIds: string[] | null = null;
      if (query.baselineId) {
        const [baseline] = await db.select().from(baselines).where(eq(baselines.id, query.baselineId));
        if (baseline?.projectId !== projectId)
          return reply.code(400).send({ error: "The baseline is not in this project" });
        const inBaseline = new Set(
          (
            await db
              .select({ id: baselineEntries.nodeId })
              .from(baselineEntries)
              .where(eq(baselineEntries.baselineId, baseline.id))
          ).map((e) => e.id),
        );
        items = items.filter((i) => inBaseline.has(i.id));
        // What the baseline froze, including relationships deleted since.
        const frozen = await db
          .select({
            id: links.id,
            typeId: links.linkTypeId,
            upstreamId: links.upstreamId,
            downstreamId: links.downstreamId,
            suspect: baselineLinks.suspect,
          })
          .from(baselineLinks)
          .innerJoin(links, eq(links.id, baselineLinks.linkId))
          .where(eq(baselineLinks.baselineId, baseline.id));
        suspectLinkIds = frozen.filter((l) => l.suspect).map((l) => l.id);
        traced = frozen.filter((l) => inBaseline.has(l.upstreamId) && inBaseline.has(l.downstreamId));
      }
      if (query.linkTypeId) traced = traced.filter((l) => l.typeId === query.linkTypeId);
      const targets = new Set(items.filter((i) => i.setId === target?.id).map((i) => i.id));
      const graph = traceGraph(traced);
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
        suspectLinkIds,
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
