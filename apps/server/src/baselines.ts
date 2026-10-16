import { compareBaseline } from "@app/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import {
  baselineEntries,
  baselineLinks,
  baselines,
  baselineVerification,
  itemRevisions,
  links,
  nodes,
  reviews,
  sets,
  testCycles,
  users,
} from "./db/schema.ts";
import { liveLinks } from "./links.ts";
import { arr, date, id, int, nul, obj, res, rows, str, thing } from "./schemas.ts";
import { projectVerification } from "./verification.ts";

const uuid = { type: "string", format: "uuid" } as const;
const idParam = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;

/** Baselines: named, frozen snapshots. There is no route to change or delete one. */
export function baselineRoutes({ app, db, requireUser, audit, access }: AppContext) {
  app.get(
    "/api/projects/:projectId/baselines",
    {
      onRequest: requireUser,
      schema: {
        response: res(
          obj({
            baselines: arr(
              obj({
                id,
                name: str,
                setId: nul(id),
                createdAt: date,
                author: str,
                items: int,
                reviews: rows,
                cycles: rows,
              }),
            ),
          }),
        ),
        params: idParam("projectId"),
      },
    },
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
      const ids = rows.map((row) => row.id);
      const counts = ids.length
        ? await db
            .select({ baselineId: baselineEntries.baselineId, items: sql<number>`count(*)::int` })
            .from(baselineEntries)
            .innerJoin(nodes, eq(nodes.id, baselineEntries.nodeId))
            .where(and(inArray(baselineEntries.baselineId, ids), eq(nodes.kind, "item")))
            .groupBy(baselineEntries.baselineId)
        : [];
      const reviewRows = ids.length
        ? await db
            .select({ id: reviews.id, name: reviews.name, state: reviews.state, baselineId: reviews.baselineId })
            .from(reviews)
            .where(inArray(reviews.baselineId, ids))
            .orderBy(reviews.createdAt)
        : [];
      const cycleRows = ids.length
        ? await db
            .select({
              id: testCycles.id,
              name: testCycles.name,
              closedAt: testCycles.closedAt,
              baselineId: testCycles.baselineId,
            })
            .from(testCycles)
            .where(inArray(testCycles.baselineId, ids))
            .orderBy(testCycles.createdAt)
        : [];
      return {
        baselines: rows.map((row) => ({
          ...row,
          items: counts.find((c) => c.baselineId === row.id)?.items ?? 0,
          reviews: reviewRows.filter((r) => r.baselineId === row.id),
          cycles: cycleRows.filter((c) => c.baselineId === row.id),
        })),
      };
    },
  );

  // Freezes every live folder, item and relationship of a set, or of the whole project when no set is given.
  app.post(
    "/api/projects/:projectId/baselines",
    {
      onRequest: requireUser,
      schema: {
        response: res(obj({ id }), 201),
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
        const frozen = await liveLinks(tx, projectId, setId ? { setId } : {});
        for (let i = 0; i < frozen.length; i += 500) {
          await tx.insert(baselineLinks).values(
            frozen.slice(i, i + 500).map((link) => ({
              baselineId: row.id,
              linkId: link.id,
              suspect: link.changed.upstream || link.changed.downstream,
            })),
          );
        }
        // The verification status of each frozen item that is not a test case, as it is now. Status is computed, so
        // without this copy a baseline could not say what had been verified when it was made.
        const { requirements } = await projectVerification(tx, projectId);
        const inBaseline = await tx
          .select({ id: baselineEntries.nodeId })
          .from(baselineEntries)
          .where(eq(baselineEntries.baselineId, row.id));
        const statuses = inBaseline.flatMap(({ id }) => {
          const entry = requirements[id];
          return entry ? [{ baselineId: row.id, itemId: id, status: entry.status, outOfDate: entry.outOfDate }] : [];
        });
        for (let i = 0; i < statuses.length; i += 500) {
          await tx.insert(baselineVerification).values(statuses.slice(i, i + 500));
        }
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
    {
      onRequest: requireUser,
      schema: {
        response: res(obj({ baseline: thing, entries: rows, links: rows, verification: thing })),
        params: idParam("baselineId"),
      },
    },
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
          suspect: baselineLinks.suspect,
        })
        .from(baselineLinks)
        .innerJoin(links, eq(links.id, baselineLinks.linkId))
        .where(eq(baselineLinks.baselineId, baselineId))
        .orderBy(links.createdAt);
      const statuses = await db
        .select({
          itemId: baselineVerification.itemId,
          status: baselineVerification.status,
          outOfDate: baselineVerification.outOfDate,
        })
        .from(baselineVerification)
        .where(eq(baselineVerification.baselineId, baselineId));
      return {
        baseline,
        entries,
        links: frozenLinks,
        // By item id. Empty for a baseline made before status was frozen.
        verification: Object.fromEntries(statuses.map(({ itemId, ...status }) => [itemId, status])),
      };
    },
  );

  // Two baselines of one project: what differs in items, relationships (including suspect) and frozen verification.
  // `from` is the older side by convention: "added" is in `with` only, "removed" in the path baseline only.
  app.get(
    "/api/baselines/:baselineId/compare",
    {
      onRequest: requireUser,
      schema: {
        response: res(
          obj({
            from: obj({ id, name: str }),
            to: obj({ id, name: str }),
            items: rows,
            links: rows,
            verification: rows,
          }),
        ),
        params: idParam("baselineId"),
        querystring: { type: "object", required: ["with"], properties: { with: uuid } },
      },
    },
    async (req, reply) => {
      const { baselineId } = req.params as { baselineId: string };
      const other = (req.query as { with: string }).with;
      if (!(await access(req, reply, { baselineId }, "viewer"))) return reply;
      const found = await db
        .select({ id: baselines.id, name: baselines.name, projectId: baselines.projectId })
        .from(baselines)
        .where(inArray(baselines.id, [baselineId, other]));
      const from = found.find((b) => b.id === baselineId);
      const to = found.find((b) => b.id === other);
      // A baseline of another project answers like a missing one, so its existence is not revealed.
      if (!from || !to || from.projectId !== to.projectId) return reply.code(404).send({ error: "Baseline not found" });

      const side = async (id: string) => {
        const items = await db
          .select({
            id: nodes.id,
            uid: nodes.uid,
            name: sql<string>`coalesce(${itemRevisions.name}, ${baselineEntries.name}, '')`,
            revision: itemRevisions.number,
          })
          .from(baselineEntries)
          .innerJoin(nodes, eq(nodes.id, baselineEntries.nodeId))
          .leftJoin(itemRevisions, eq(itemRevisions.id, baselineEntries.revisionId))
          .where(and(eq(baselineEntries.baselineId, id), eq(nodes.kind, "item")));
        const frozenLinks = await db
          .select({
            id: baselineLinks.linkId,
            upstreamId: links.upstreamId,
            downstreamId: links.downstreamId,
            suspect: baselineLinks.suspect,
          })
          .from(baselineLinks)
          .innerJoin(links, eq(links.id, baselineLinks.linkId))
          .where(eq(baselineLinks.baselineId, id));
        const statuses = await db
          .select({
            itemId: baselineVerification.itemId,
            status: baselineVerification.status,
            outOfDate: baselineVerification.outOfDate,
          })
          .from(baselineVerification)
          .where(eq(baselineVerification.baselineId, id));
        return { items, links: frozenLinks, verification: new Map(statuses.map((s) => [s.itemId, s])) };
      };
      const [a, b] = [await side(from.id), await side(to.id)];

      const itemById = new Map([...a.items, ...b.items].map((i) => [i.id, i]));
      const changes = compareBaseline(
        a.items.map((i) => ({ id: i.id, revision: i.revision ?? 0 })),
        b.items.map((i) => ({ id: i.id, revision: i.revision ?? 0 })),
      );
      const revisionOf = (side_: typeof a, id: string) => side_.items.find((i) => i.id === id)?.revision ?? null;
      const itemChanges = [...changes].map(([id, change]) => ({
        id,
        uid: itemById.get(id)?.uid ?? "",
        // The newer name when the item is in `with`, else the one it had in `from`.
        name: (b.items.find((i) => i.id === id) ?? itemById.get(id))?.name ?? "",
        change,
        fromRevision: revisionOf(a, id),
        toRevision: revisionOf(b, id),
      }));

      const uid = (id: string) => itemById.get(id)?.uid ?? "?";
      const inA = new Map(a.links.map((l) => [l.id, l]));
      const inB = new Map(b.links.map((l) => [l.id, l]));
      const linkChanges = [
        ...b.links.flatMap((l): (typeof l & { change: "added" | "suspect" | "unsuspect" })[] => {
          const was = inA.get(l.id);
          if (!was) return [{ ...l, change: "added" }];
          // `suspect` is null for a baseline made before it was recorded: nothing to compare.
          if (was.suspect !== null && l.suspect !== null && was.suspect !== l.suspect)
            return [{ ...l, change: l.suspect ? "suspect" : "unsuspect" }];
          return [];
        }),
        ...a.links.filter((l) => !inB.has(l.id)).map((l) => ({ ...l, change: "removed" as const })),
      ].map((l) => ({
        id: l.id,
        upstreamUid: uid(l.upstreamId),
        downstreamUid: uid(l.downstreamId),
        change: l.change,
      }));

      const verification = [...a.verification].flatMap(([id, was]) => {
        const now = b.verification.get(id);
        if (!now || (was.status === now.status && was.outOfDate === now.outOfDate)) return [];
        return [
          {
            id,
            uid: uid(id),
            name: itemById.get(id)?.name ?? "",
            from: { status: was.status, outOfDate: was.outOfDate },
            to: { status: now.status, outOfDate: now.outOfDate },
          },
        ];
      });
      return {
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        items: itemChanges,
        links: linkChanges,
        verification,
      };
    },
  );
}
