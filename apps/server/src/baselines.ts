import { and, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { baselineEntries, baselineLinks, baselines, itemRevisions, links, nodes, sets, users } from "./db/schema.ts";

const uuid = { type: "string", format: "uuid" } as const;
const idParam = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;

/** Baselines: named, frozen snapshots. There is no route to change or delete one. */
export function baselineRoutes({ app, db, requireUser, audit, access }: AppContext) {
  app.get(
    "/api/projects/:projectId/baselines",
    { onRequest: requireUser, schema: { params: idParam("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const rows = await db
        .select({
          id: baselines.id,
          name: baselines.name,
          setId: baselines.setId,
          createdAt: baselines.createdAt,
          author: users.name,
        })
        .from(baselines)
        .innerJoin(users, eq(users.id, baselines.createdBy))
        .where(eq(baselines.projectId, projectId))
        .orderBy(desc(baselines.createdAt));
      return { baselines: rows };
    },
  );

  // Freezes every live folder, item and relationship of a set, or of the whole project when no set is given.
  app.post(
    "/api/projects/:projectId/baselines",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" }, setId: uuid },
        },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "editor"))) return reply;
      const body = req.body as { name: string; setId?: string };
      const setId = body.setId ?? null;
      const name = body.name.trim();

      const id = await db.transaction(async (tx) => {
        if (setId) {
          const [set] = await tx
            .select({ id: sets.id })
            .from(sets)
            .where(and(eq(sets.id, setId), eq(sets.projectId, projectId)));
          if (!set) return null;
        }
        const [row] = await tx
          .insert(baselines)
          .values({ projectId, setId, name, createdBy: req.user?.id as string })
          .returning({ id: baselines.id });
        if (!row) throw new Error("baseline insert returned no row");
        // One statement each, so the snapshot is consistent and costs the same for 10 items or 10,000.
        await tx.execute(sql`
          insert into baseline_entries (baseline_id, node_id, revision_id, parent_id, position, name)
          select ${row.id}, n.id,
            (select r.id from item_revisions r where r.item_id = n.id order by r.number desc limit 1),
            n.parent_id, n.position, n.name
          from nodes n join sets s on s.id = n.set_id
          where s.project_id = ${projectId} and n.deleted_at is null
            and (${setId}::uuid is null or n.set_id = ${setId}::uuid)`);
        await tx.execute(sql`
          insert into baseline_links (baseline_id, link_id)
          select ${row.id}, l.id
          from links l join nodes u on u.id = l.upstream_id join nodes d on d.id = l.downstream_id
          where l.project_id = ${projectId} and l.deleted_at is null and u.deleted_at is null and d.deleted_at is null
            and (${setId}::uuid is null or u.set_id = ${setId}::uuid or d.set_id = ${setId}::uuid)`);
        await audit(tx, req.user?.id ?? null, "baseline.create", "baseline", row.id, { projectId, label: name });
        return row.id;
      });
      if (!id) return reply.code(400).send({ error: "Set not found in this project" });
      return reply.code(201).send({ id });
    },
  );

  // A baseline's content: its folders and items shaped like the project tree, each item with its frozen revision.
  app.get(
    "/api/baselines/:baselineId",
    { onRequest: requireUser, schema: { params: idParam("baselineId") } },
    async (req, reply) => {
      const { baselineId } = req.params as { baselineId: string };
      if (!(await access(req, reply, { baselineId }, "viewer"))) return reply;
      const [baseline] = await db
        .select({
          id: baselines.id,
          name: baselines.name,
          setId: baselines.setId,
          createdAt: baselines.createdAt,
          author: users.name,
        })
        .from(baselines)
        .innerJoin(users, eq(users.id, baselines.createdBy))
        .where(eq(baselines.id, baselineId));
      if (!baseline) return reply.code(404).send({ error: "Baseline not found" });
      const entries = await db
        .select({
          id: nodes.id,
          setId: nodes.setId,
          parentId: baselineEntries.parentId,
          kind: nodes.kind,
          name: sql<string>`coalesce(${itemRevisions.name}, ${baselineEntries.name}, '')`,
          uid: nodes.uid,
          revision: itemRevisions.number,
          description: itemRevisions.description,
          attributes: itemRevisions.attributes,
        })
        .from(baselineEntries)
        .innerJoin(nodes, eq(nodes.id, baselineEntries.nodeId))
        .leftJoin(itemRevisions, eq(itemRevisions.id, baselineEntries.revisionId))
        .where(eq(baselineEntries.baselineId, baselineId))
        .orderBy(baselineEntries.position);
      const frozenLinks = await db
        .select({
          id: links.id,
          typeId: links.linkTypeId,
          upstreamId: links.upstreamId,
          downstreamId: links.downstreamId,
        })
        .from(baselineLinks)
        .innerJoin(links, eq(links.id, baselineLinks.linkId))
        .where(eq(baselineLinks.baselineId, baselineId))
        .orderBy(links.createdAt);
      return { baseline, entries, links: frozenLinks };
    },
  );
}
