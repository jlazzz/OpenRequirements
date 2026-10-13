import { formatUid } from "@app/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import type { Db } from "./db/client.ts";
import { itemRevisions, nodes, sets } from "./db/schema.ts";

const idParam = (name: string) =>
  ({ type: "object", required: [name], properties: { [name]: { type: "string", format: "uuid" } } }) as const;

/** Every live folder and item of a project, in sibling order, with each item's current name. */
export async function projectNodes(db: Db, projectId: string) {
  // shortcut: loads every node of the project at once, switch to loading per folder when projects reach tens of thousands of items
  const rows = await db
    .select({
      id: nodes.id,
      setId: nodes.setId,
      parentId: nodes.parentId,
      kind: nodes.kind,
      name: nodes.name,
      uid: nodes.uid,
    })
    .from(nodes)
    .innerJoin(sets, eq(sets.id, nodes.setId))
    .where(and(eq(sets.projectId, projectId), isNull(nodes.deletedAt)))
    .orderBy(nodes.position);
  const latest = await db
    .selectDistinctOn([itemRevisions.itemId], { itemId: itemRevisions.itemId, name: itemRevisions.name })
    .from(itemRevisions)
    .innerJoin(nodes, eq(nodes.id, itemRevisions.itemId))
    .innerJoin(sets, eq(sets.id, nodes.setId))
    .where(eq(sets.projectId, projectId))
    .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
  const itemNames = new Map(latest.map((r) => [r.itemId, r.name]));
  return rows.map((n) => ({ ...n, name: n.kind === "item" ? (itemNames.get(n.id) ?? "") : (n.name ?? "") }));
}

export function nodeRoutes({ app, db, requireUser, audit }: AppContext) {
  app.post(
    "/api/sets/:setId/nodes",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("setId"),
        body: {
          type: "object",
          required: ["kind", "name"],
          additionalProperties: false,
          properties: {
            kind: { enum: ["folder", "item"] },
            name: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
            parentId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (req, reply) => {
      const { setId } = req.params as { setId: string };
      const body = req.body as { kind: "folder" | "item"; name: string; parentId?: string };
      const userId = req.user?.id as string;
      const name = body.name.trim();

      const result = await db.transaction(async (tx) => {
        // Locks the set row, so concurrent creates in one set run one at a time: UIDs and positions cannot collide.
        const [set] = await tx.select().from(sets).where(eq(sets.id, setId)).for("update");
        if (!set) return { error: [404, "Set not found"] } as const;

        if (body.parentId) {
          const [parent] = await tx
            .select({ kind: nodes.kind })
            .from(nodes)
            .where(and(eq(nodes.id, body.parentId), eq(nodes.setId, setId), isNull(nodes.deletedAt)));
          if (parent?.kind !== "folder") return { error: [400, "Parent must be a folder in the same set"] } as const;
        }

        let uid: string | null = null;
        if (body.kind === "item") {
          const counter = set.uidCounter + 1;
          await tx.update(sets).set({ uidCounter: counter }).where(eq(sets.id, setId));
          uid = formatUid(set.uidPrefix, counter);
        }
        const siblings = and(
          eq(nodes.setId, setId),
          body.parentId ? eq(nodes.parentId, body.parentId) : isNull(nodes.parentId),
        );
        const [last] = await tx
          .select({ max: sql<number>`coalesce(max(${nodes.position}), 0)` })
          .from(nodes)
          .where(siblings);

        const [node] = await tx
          .insert(nodes)
          .values({
            setId,
            parentId: body.parentId ?? null,
            kind: body.kind,
            name: body.kind === "folder" ? name : null,
            uid,
            position: (last?.max ?? 0) + 1,
          })
          .returning({ id: nodes.id });
        if (!node) throw new Error("node insert returned no row");
        if (body.kind === "item")
          await tx.insert(itemRevisions).values({ itemId: node.id, number: 1, name, authorId: userId });
        await audit(tx, userId, `${body.kind}.create`, body.kind, node.id);
        return { node: { id: node.id, setId, parentId: body.parentId ?? null, kind: body.kind, name, uid } };
      });

      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/api/items/:itemId",
    { onRequest: requireUser, schema: { params: idParam("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const [item] = await db
        .select({
          id: nodes.id,
          setId: nodes.setId,
          uid: nodes.uid,
          name: itemRevisions.name,
          description: itemRevisions.description,
          attributes: itemRevisions.attributes,
          revision: itemRevisions.number,
          revisedAt: itemRevisions.createdAt,
        })
        .from(nodes)
        .innerJoin(itemRevisions, eq(itemRevisions.itemId, nodes.id))
        .where(and(eq(nodes.id, itemId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)))
        .orderBy(desc(itemRevisions.number))
        .limit(1);
      if (!item) return reply.code(404).send({ error: "Item not found" });
      return { item };
    },
  );
}
