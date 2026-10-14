import { isDeepStrictEqual } from "node:util";
import { docError, docToText, emptyDoc, formatUid, type RichNode, type Step, stepText } from "@app/shared";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { AppContext, Tx } from "./app.ts";
import type { Db } from "./db/client.ts";
import { attributeDefinitions, itemDrafts, itemRevisions, nodes, sets, users } from "./db/schema.ts";
import { checkAttributes, type FieldDef } from "./domain/attributes.ts";
import { onlyStatusChanged } from "./domain/review.ts";
import { descendantIds, placeBefore, placementError } from "./domain/tree.ts";
import { watchSuspect } from "./links.ts";

const idParam = (name: string) =>
  ({ type: "object", required: [name], properties: { [name]: { type: "string", format: "uuid" } } }) as const;

/**
 * Every live folder and item of a project, in sibling order, with each item's current name and state.
 * An item's state is the value of its type's enum field named "Status", when the type has one.
 */
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
    .selectDistinctOn([itemRevisions.itemId], {
      itemId: itemRevisions.itemId,
      name: itemRevisions.name,
      status: sql<string | null>`${itemRevisions.attributes} ->> ${attributeDefinitions.id}::text`,
    })
    .from(itemRevisions)
    .innerJoin(nodes, eq(nodes.id, itemRevisions.itemId))
    .innerJoin(sets, eq(sets.id, nodes.setId))
    .leftJoin(
      attributeDefinitions,
      and(
        eq(attributeDefinitions.itemTypeId, sets.itemTypeId),
        eq(attributeDefinitions.name, "Status"),
        eq(attributeDefinitions.type, "enum"),
        isNull(attributeDefinitions.archivedAt),
      ),
    )
    .where(eq(sets.projectId, projectId))
    .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
  const current = new Map(latest.map((r) => [r.itemId, r]));
  return rows.map((n) => ({
    ...n,
    name: n.kind === "item" ? (current.get(n.id)?.name ?? "") : (n.name ?? ""),
    status: current.get(n.id)?.status ?? null,
  }));
}

/** An item type's field definitions, in display order. Removed fields are left out. */
export function fieldsOf(db: Pick<Db, "select">, itemTypeId: string) {
  return db
    .select({
      id: attributeDefinitions.id,
      name: attributeDefinitions.name,
      type: attributeDefinitions.type,
      options: attributeDefinitions.options,
    })
    .from(attributeDefinitions)
    .where(and(eq(attributeDefinitions.itemTypeId, itemTypeId), isNull(attributeDefinitions.archivedAt)))
    .orderBy(attributeDefinitions.position);
}

/** The field that holds an item's state: the enum field named "Status", when the item type has one. */
export const statusFieldOf = (fields: FieldDef[]) => fields.find((f) => f.name === "Status" && f.type === "enum");

/** What search matches for an item: its UID, name, description text and field values. */
export function searchTextOf(uid: string, name: string, description: RichNode, attributes: Record<string, unknown>) {
  // A test step is an object: its action and expected result are both searched, as text.
  const words = (value: unknown) =>
    typeof value === "object" && value !== null ? Object.values(value as Step).map(stepText) : [value];
  return [uid, name, docToText(description), ...Object.values(attributes).flat().flatMap(words).map(String)].join("\n");
}

const nullableId = { type: ["string", "null"], format: "uuid" } as const;

/**
 * Locks a live node's set and returns the node with every live node of that set, in sibling order.
 * The lock makes moves, deletes and creates in one set run one at a time.
 */
async function lockSetOf(tx: Tx, nodeId: string) {
  const [found] = await tx.select({ setId: nodes.setId }).from(nodes).where(eq(nodes.id, nodeId));
  if (!found) return null;
  await tx.select({ id: sets.id }).from(sets).where(eq(sets.id, found.setId)).for("update");
  const live = await tx
    .select({ id: nodes.id, parentId: nodes.parentId, kind: nodes.kind, position: nodes.position })
    .from(nodes)
    .where(and(eq(nodes.setId, found.setId), isNull(nodes.deletedAt)))
    .orderBy(nodes.position);
  const node = live.find((n) => n.id === nodeId);
  return node ? { node, live } : null;
}

export function nodeRoutes({ app, db, requireUser, audit, access, mail }: AppContext) {
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
      if (!(await access(req, reply, { setId }, "editor"))) return reply;
      const body = req.body as { kind: "folder" | "item"; name: string; parentId?: string };
      const userId = req.user?.id as string;
      const name = body.name.trim();

      const result = await db.transaction(async (tx) => {
        // Locks the set row, so concurrent creates in one set run one at a time: UIDs and positions cannot collide.
        const [set] = await tx.select().from(sets).where(eq(sets.id, setId)).for("update");
        if (!set) return { error: [404, "Set not found"] } as const;

        if (body.parentId) {
          const parent = await tx
            .select({ id: nodes.id, parentId: nodes.parentId, kind: nodes.kind })
            .from(nodes)
            .where(and(eq(nodes.id, body.parentId), eq(nodes.setId, setId), isNull(nodes.deletedAt)));
          const problem = placementError(parent, null, body.kind, body.parentId);
          if (problem) return { error: [400, problem] } as const;
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
            searchText: uid ? searchTextOf(uid, name, emptyDoc, {}) : "",
            position: (last?.max ?? 0) + 1,
          })
          .returning({ id: nodes.id });
        if (!node) throw new Error("node insert returned no row");
        if (body.kind === "item")
          await tx
            .insert(itemRevisions)
            .values({ itemId: node.id, number: 1, name, description: emptyDoc, authorId: userId });
        await audit(tx, userId, `${body.kind}.create`, body.kind, node.id);
        return { node: { id: node.id, setId, parentId: body.parentId ?? null, kind: body.kind, name, uid } };
      });

      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  // Search: ids of the project's live items containing every word of the query, in the UID, name, description or a field.
  app.get(
    "/api/projects/:projectId/search",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        querystring: { type: "object", required: ["q"], properties: { q: { type: "string", maxLength: 200 } } },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const words = (req.query as { q: string }).q.split(/\s+/).filter(Boolean).slice(0, 10);
      if (words.length === 0) return { ids: [] };
      // shortcut: substring scan with no index, add a pg_trgm GIN index on nodes.search_text when search nears the 500 ms budget
      const rows = await db
        .select({ id: nodes.id })
        .from(nodes)
        .innerJoin(sets, eq(sets.id, nodes.setId))
        .where(
          and(
            eq(sets.projectId, projectId),
            eq(nodes.kind, "item"),
            isNull(nodes.deletedAt),
            // % _ and \\ are LIKE wildcards, so they are escaped to be searched literally.
            ...words.map((word) => ilike(nodes.searchText, `%${word.replace(/[\\%_]/g, "\\$&")}%`)),
          ),
        )
        .limit(200);
      return { ids: rows.map((r) => r.id) };
    },
  );

  // The data behind List view: the set's field definitions and the current revision of each of its items.
  app.get(
    "/api/sets/:setId/items",
    { onRequest: requireUser, schema: { params: idParam("setId") } },
    async (req, reply) => {
      const { setId } = req.params as { setId: string };
      if (!(await access(req, reply, { setId }, "viewer"))) return reply;
      const [set] = await db.select({ itemTypeId: sets.itemTypeId }).from(sets).where(eq(sets.id, setId));
      if (!set) return reply.code(404).send({ error: "Set not found" });
      const fields = await fieldsOf(db, set.itemTypeId);
      // shortcut: returns the whole set, add paging when a set reaches thousands of items
      const items = await db
        .selectDistinctOn([itemRevisions.itemId], {
          id: nodes.id,
          uid: nodes.uid,
          name: itemRevisions.name,
          description: itemRevisions.description,
          attributes: itemRevisions.attributes,
          revision: itemRevisions.number,
        })
        .from(itemRevisions)
        .innerJoin(nodes, eq(nodes.id, itemRevisions.itemId))
        .where(and(eq(nodes.setId, setId), isNull(nodes.deletedAt)))
        .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
      // The signed-in user's own drafts in this set, so List view can show and continue them.
      const drafts = await db
        .select({
          itemId: itemDrafts.itemId,
          baseRevision: itemDrafts.baseRevision,
          name: itemDrafts.name,
          description: itemDrafts.description,
          attributes: itemDrafts.attributes,
        })
        .from(itemDrafts)
        .innerJoin(nodes, eq(nodes.id, itemDrafts.itemId))
        .where(and(eq(nodes.setId, setId), eq(itemDrafts.authorId, req.user?.id as string)));
      return { fields, items, drafts };
    },
  );

  app.get(
    "/api/items/:itemId",
    { onRequest: requireUser, schema: { params: idParam("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!(await access(req, reply, { nodeId: itemId }, "viewer"))) return reply;
      const [item] = await db
        .select({
          id: nodes.id,
          setId: nodes.setId,
          itemTypeId: sets.itemTypeId,
          uid: nodes.uid,
          name: itemRevisions.name,
          description: itemRevisions.description,
          attributes: itemRevisions.attributes,
          revision: itemRevisions.number,
          revisedAt: itemRevisions.createdAt,
        })
        .from(nodes)
        .innerJoin(sets, eq(sets.id, nodes.setId))
        .innerJoin(itemRevisions, eq(itemRevisions.itemId, nodes.id))
        .where(and(eq(nodes.id, itemId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)))
        .orderBy(desc(itemRevisions.number))
        .limit(1);
      if (!item) return reply.code(404).send({ error: "Item not found" });
      const { itemTypeId, ...rest } = item;
      // Only the signed-in user's own draft: drafts are private.
      const [draft] = await db
        .select({
          baseRevision: itemDrafts.baseRevision,
          name: itemDrafts.name,
          description: itemDrafts.description,
          attributes: itemDrafts.attributes,
          updatedAt: itemDrafts.updatedAt,
        })
        .from(itemDrafts)
        .where(and(eq(itemDrafts.itemId, itemId), eq(itemDrafts.authorId, req.user?.id as string)));
      return { item: rest, fields: await fieldsOf(db, itemTypeId), draft: draft ?? null };
    },
  );

  // Polled by an open item page: the latest version, and who else has unsaved edits. Draft contents stay private.
  app.get(
    "/api/items/:itemId/editing",
    { onRequest: requireUser, schema: { params: idParam("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!(await access(req, reply, { nodeId: itemId }, "viewer"))) return reply;
      const [latest] = await db
        .select({ revision: itemRevisions.number, author: users.name })
        .from(itemRevisions)
        .innerJoin(users, eq(users.id, itemRevisions.authorId))
        .where(eq(itemRevisions.itemId, itemId))
        .orderBy(desc(itemRevisions.number))
        .limit(1);
      if (!latest) return reply.code(404).send({ error: "Item not found" });
      const editors = await db
        .select({ name: users.name, since: itemDrafts.updatedAt })
        .from(itemDrafts)
        .innerJoin(users, eq(users.id, itemDrafts.authorId))
        .where(and(eq(itemDrafts.itemId, itemId), ne(itemDrafts.authorId, req.user?.id as string)))
        .orderBy(desc(itemDrafts.updatedAt));
      return { ...latest, editors };
    },
  );

  // Version history of an item, newest first.
  app.get(
    "/api/items/:itemId/revisions",
    { onRequest: requireUser, schema: { params: idParam("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!(await access(req, reply, { nodeId: itemId }, "viewer"))) return reply;
      const revisions = await db
        .select({
          number: itemRevisions.number,
          name: itemRevisions.name,
          description: itemRevisions.description,
          attributes: itemRevisions.attributes,
          changeReason: itemRevisions.changeReason,
          createdAt: itemRevisions.createdAt,
          author: users.name,
        })
        .from(itemRevisions)
        .innerJoin(nodes, eq(nodes.id, itemRevisions.itemId))
        .innerJoin(users, eq(users.id, itemRevisions.authorId))
        .where(and(eq(nodes.id, itemId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)))
        .orderBy(desc(itemRevisions.number));
      if (revisions.length === 0) return reply.code(404).send({ error: "Item not found" });
      return { revisions };
    },
  );

  // Saving an item never changes a revision: it appends the next one.
  app.post(
    "/api/items/:itemId/revisions",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("itemId"),
        body: {
          type: "object",
          required: ["baseRevision", "name", "description", "attributes"],
          additionalProperties: false,
          properties: {
            // The revision the edit started from. Saving fails if someone else saved a newer one meanwhile.
            baseRevision: { type: "integer", minimum: 1 },
            name: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
            description: { type: "object" },
            attributes: { type: "object" },
            changeReason: { type: "string", maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const projectId = await access(req, reply, { nodeId: itemId }, "editor");
      if (!projectId) return reply;
      const body = req.body as {
        baseRevision: number;
        name: string;
        description: RichNode;
        attributes: Record<string, unknown>;
        changeReason?: string;
      };
      const userId = req.user?.id as string;
      const badText = docError(body.description);
      if (badText) return reply.code(400).send({ error: badText });

      const result = await db.transaction(async (tx) => {
        // Locks the item, so two saves of the same item cannot both pass the baseRevision check.
        const [item] = await tx
          .select({ itemTypeId: sets.itemTypeId, uid: nodes.uid })
          .from(nodes)
          .innerJoin(sets, eq(sets.id, nodes.setId))
          .where(and(eq(nodes.id, itemId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)))
          .for("update", { of: nodes });
        if (!item) return { error: [404, "Item not found"] } as const;

        const [current] = await tx
          .select({
            number: itemRevisions.number,
            name: itemRevisions.name,
            description: itemRevisions.description,
            attributes: itemRevisions.attributes,
          })
          .from(itemRevisions)
          .where(eq(itemRevisions.itemId, itemId))
          .orderBy(desc(itemRevisions.number))
          .limit(1);
        if (current?.number !== body.baseRevision) {
          return { error: [409, "Someone else saved a newer version of this item first."] } as const;
        }
        const fields = await fieldsOf(tx, item.itemTypeId);
        const checked = checkAttributes(fields, body.attributes, current.attributes);
        if ("error" in checked) return { error: [400, checked.error] } as const;

        const revision = current.number + 1;
        const next = { name: body.name.trim(), description: body.description, attributes: checked.attributes };
        const suspectNews = await watchSuspect(tx, mail, projectId, [itemId], req.user as { id: string; name: string });
        await tx.insert(itemRevisions).values({
          itemId,
          number: revision,
          ...next,
          statusOnly: onlyStatusChanged(current, next, statusFieldOf(fields)?.id),
          authorId: userId,
          changeReason: body.changeReason?.trim() || null,
        });
        const searchText = searchTextOf(item.uid ?? "", body.name.trim(), body.description, checked.attributes);
        await tx.update(nodes).set({ searchText }).where(eq(nodes.id, itemId));
        // The draft has become this revision.
        await tx.delete(itemDrafts).where(and(eq(itemDrafts.itemId, itemId), eq(itemDrafts.authorId, userId)));
        await audit(tx, userId, "item.revise", "item", itemId);
        await suspectNews();
        return { revision };
      });

      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  // Auto-save target. A draft may be incomplete (e.g. an empty name); it is fully checked when saved as a version.
  app.put(
    "/api/items/:itemId/draft",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("itemId"),
        body: {
          type: "object",
          required: ["baseRevision", "name", "description", "attributes"],
          additionalProperties: false,
          properties: {
            baseRevision: { type: "integer", minimum: 1 },
            name: { type: "string", maxLength: 200 },
            description: { type: "object" },
            attributes: { type: "object" },
          },
        },
      },
    },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!(await access(req, reply, { nodeId: itemId }, "editor"))) return reply;
      const body = req.body as {
        baseRevision: number;
        name: string;
        description: RichNode;
        attributes: Record<string, unknown>;
      };
      const userId = req.user?.id as string;
      const badText = docError(body.description);
      if (badText) return reply.code(400).send({ error: badText });

      const saved = await db.transaction(async (tx) => {
        const [item] = await tx
          .select({ id: nodes.id })
          .from(nodes)
          .where(and(eq(nodes.id, itemId), eq(nodes.kind, "item"), isNull(nodes.deletedAt)));
        if (!item) return false;
        const mine = and(eq(itemDrafts.itemId, itemId), eq(itemDrafts.authorId, userId));
        const [existing] = await tx.select({ itemId: itemDrafts.itemId }).from(itemDrafts).where(mine);
        await tx
          .insert(itemDrafts)
          .values({ itemId, authorId: userId, ...body })
          .onConflictDoUpdate({
            target: [itemDrafts.itemId, itemDrafts.authorId],
            set: { ...body, updatedAt: new Date() },
          });
        // Audited when a draft starts, not on every keystroke save. See hard rule 3 in CLAUDE.md.
        if (!existing) await audit(tx, userId, "draft.create", "item", itemId);
        return true;
      });
      if (!saved) return reply.code(404).send({ error: "Item not found" });
      return { ok: true };
    },
  );

  app.delete(
    "/api/items/:itemId/draft",
    { onRequest: requireUser, schema: { params: idParam("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!(await access(req, reply, { nodeId: itemId }, "editor"))) return reply;
      const userId = req.user?.id as string;
      await db.transaction(async (tx) => {
        const gone = await tx
          .delete(itemDrafts)
          .where(and(eq(itemDrafts.itemId, itemId), eq(itemDrafts.authorId, userId)))
          .returning({ itemId: itemDrafts.itemId });
        if (gone.length > 0) await audit(tx, userId, "draft.discard", "item", itemId);
      });
      return { ok: true };
    },
  );

  app.patch(
    "/api/nodes/:nodeId",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("nodeId"),
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" } },
        },
      },
    },
    async (req, reply) => {
      const { nodeId } = req.params as { nodeId: string };
      if (!(await access(req, reply, { nodeId }, "editor"))) return reply;
      const name = (req.body as { name: string }).name.trim();
      const renamed = await db.transaction(async (tx) => {
        // Folders only: an item's name is versioned, so it changes by saving a new revision.
        const rows = await tx
          .update(nodes)
          .set({ name })
          .where(and(eq(nodes.id, nodeId), eq(nodes.kind, "folder"), isNull(nodes.deletedAt)))
          .returning({ id: nodes.id });
        if (rows.length > 0) await audit(tx, req.user?.id ?? null, "folder.rename", "folder", nodeId);
        return rows.length > 0;
      });
      if (!renamed) return reply.code(404).send({ error: "Folder not found" });
      return { ok: true };
    },
  );

  // Moves a node to a parent in the same set (null = directly under the set), before a sibling or last.
  app.post(
    "/api/nodes/:nodeId/move",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("nodeId"),
        body: {
          type: "object",
          required: ["parentId", "beforeId"],
          additionalProperties: false,
          properties: { parentId: nullableId, beforeId: nullableId },
        },
      },
    },
    async (req, reply) => {
      const { nodeId } = req.params as { nodeId: string };
      if (!(await access(req, reply, { nodeId }, "editor"))) return reply;
      const { parentId, beforeId } = req.body as { parentId: string | null; beforeId: string | null };

      const result = await db.transaction(async (tx) => {
        const locked = await lockSetOf(tx, nodeId);
        if (!locked) return { error: [404, "Not found"] } as const;
        const { node, live } = locked;

        const problem = placementError(live, nodeId, node.kind, parentId);
        if (problem) return { error: [400, problem] } as const;
        const siblings = live.filter((n) => n.parentId === parentId);
        const order = placeBefore(
          siblings.map((n) => n.id),
          nodeId,
          beforeId,
        );
        if (!order) return { error: [400, "beforeId must be another node in the destination"] } as const;

        // Renumbers only the destination's children, and only those whose position changed.
        for (const [index, id] of order.entries()) {
          const position = index + 1;
          if (id === nodeId) await tx.update(nodes).set({ parentId, position }).where(eq(nodes.id, id));
          else if (siblings.find((n) => n.id === id)?.position !== position) {
            await tx.update(nodes).set({ position }).where(eq(nodes.id, id));
          }
        }
        await audit(tx, req.user?.id ?? null, `${node.kind}.move`, node.kind, nodeId);
        return { ok: true };
      });

      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // Bulk: deletes, moves or changes field values of many items of one set in one request, all or none.
  app.post(
    "/api/sets/:setId/bulk",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("setId"),
        body: {
          type: "object",
          required: ["action", "itemIds"],
          additionalProperties: false,
          properties: {
            action: { enum: ["delete", "move", "edit"] },
            // shortcut: 500 items per request, each written and audited on its own, batch the writes when larger selections are needed
            itemIds: { type: "array", minItems: 1, maxItems: 500, items: { type: "string", format: "uuid" } },
            // Move: the destination folder or item, or null for directly under the set.
            parentId: nullableId,
            // Edit: field id to new value. Only these fields change; null clears one.
            attributes: { type: "object", minProperties: 1 },
            changeReason: { type: "string", maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const { setId } = req.params as { setId: string };
      const projectId = await access(req, reply, { setId }, "editor");
      if (!projectId) return reply;
      const body = req.body as {
        action: "delete" | "move" | "edit";
        itemIds: string[];
        parentId?: string | null;
        attributes?: Record<string, unknown>;
        changeReason?: string;
      };
      const userId = req.user?.id as string;
      const ids = new Set(body.itemIds);

      const result = await db.transaction(async (tx) => {
        // The set is locked, as for every move, delete and create in it.
        const [set] = await tx.select().from(sets).where(eq(sets.id, setId)).for("update");
        if (!set) return { error: [404, "Set not found"] } as const;
        const live = await tx
          .select({
            id: nodes.id,
            parentId: nodes.parentId,
            kind: nodes.kind,
            uid: nodes.uid,
            position: nodes.position,
          })
          .from(nodes)
          .where(and(eq(nodes.setId, setId), isNull(nodes.deletedAt)))
          .orderBy(nodes.position);
        // In the order they have in the set, whatever order they were sent in.
        const items = live.filter((n) => ids.has(n.id) && n.kind === "item");
        if (items.length !== ids.size)
          return { error: [400, "Every selected item must be an item of this set"] } as const;
        const itemIds = items.map((item) => item.id);

        if (body.action === "delete") {
          await tx.update(nodes).set({ deletedAt: new Date() }).where(inArray(nodes.id, itemIds));
          for (const id of itemIds) await audit(tx, userId, "item.delete", "item", id);
          return { changed: items.length };
        }

        if (body.action === "move") {
          if (body.parentId === undefined) return { error: [400, "Say where to move the items: parentId"] } as const;
          const parentId = body.parentId;
          for (const item of items) {
            const problem = placementError(live, item.id, "item", parentId);
            if (problem) return { error: [400, problem] } as const;
          }
          // Items already there stay where they are. The others go last, keeping their order.
          const moving = items.filter((item) => item.parentId !== parentId);
          const last = Math.max(0, ...live.filter((n) => n.parentId === parentId).map((n) => n.position));
          for (const [index, item] of moving.entries()) {
            await tx
              .update(nodes)
              .set({ parentId, position: last + index + 1 })
              .where(eq(nodes.id, item.id));
            await audit(tx, userId, "item.move", "item", item.id);
          }
          return { changed: moving.length };
        }

        const patch = body.attributes;
        if (!patch) return { error: [400, "Say which fields to change: attributes"] } as const;
        // A draft is edits from a version this request is about to replace: it could not be saved afterwards.
        const drafts = await tx
          .select({ itemId: itemDrafts.itemId })
          .from(itemDrafts)
          .where(and(inArray(itemDrafts.itemId, itemIds), eq(itemDrafts.authorId, userId)));
        if (drafts.length > 0) {
          const uids = drafts.map((d) => items.find((item) => item.id === d.itemId)?.uid).join(", ");
          return { error: [409, `You have unsaved drafts of ${uids}. Save or discard them first.`] } as const;
        }
        const fields = await fieldsOf(tx, set.itemTypeId);
        const statusField = statusFieldOf(fields)?.id;
        const current = await tx
          .selectDistinctOn([itemRevisions.itemId], {
            itemId: itemRevisions.itemId,
            number: itemRevisions.number,
            name: itemRevisions.name,
            description: itemRevisions.description,
            attributes: itemRevisions.attributes,
          })
          .from(itemRevisions)
          .where(inArray(itemRevisions.itemId, itemIds))
          .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
        const suspectNews = await watchSuspect(tx, mail, projectId, itemIds, req.user as { id: string; name: string });
        let changed = 0;
        for (const now of current) {
          const uid = items.find((item) => item.id === now.itemId)?.uid ?? "";
          const checked = checkAttributes(fields, { ...now.attributes, ...patch }, now.attributes);
          if ("error" in checked) return { error: [400, `${uid}: ${checked.error}`] } as const;
          // An item that already has these values gets no new version.
          if (isDeepStrictEqual(checked.attributes, now.attributes)) continue;
          const next = { name: now.name, description: now.description, attributes: checked.attributes };
          await tx.insert(itemRevisions).values({
            itemId: now.itemId,
            number: now.number + 1,
            ...next,
            statusOnly: onlyStatusChanged(now, next, statusField),
            authorId: userId,
            changeReason: body.changeReason?.trim() || null,
          });
          await tx
            .update(nodes)
            .set({ searchText: searchTextOf(uid, now.name, now.description, checked.attributes) })
            .where(eq(nodes.id, now.itemId));
          await audit(tx, userId, "item.revise", "item", now.itemId);
          changed += 1;
        }
        await suspectNews();
        return { changed };
      });

      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // Deleted folders and items of a project, newest first, so they can be restored.
  app.get(
    "/api/projects/:projectId/trash",
    { onRequest: requireUser, schema: { params: idParam("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const rows = await db
        .select({
          id: nodes.id,
          kind: nodes.kind,
          uid: nodes.uid,
          folderName: nodes.name,
          itemName: sql<
            string | null
          >`(select r.name from item_revisions r where r.item_id = ${nodes.id} order by r.number desc limit 1)`,
          set: sets.name,
          deletedAt: nodes.deletedAt,
        })
        .from(nodes)
        .innerJoin(sets, eq(sets.id, nodes.setId))
        .where(and(eq(sets.projectId, projectId), isNotNull(nodes.deletedAt), isNull(sets.archivedAt)))
        .orderBy(desc(nodes.deletedAt), nodes.position)
        .limit(500);
      return {
        deleted: rows.map(({ folderName, itemName, ...row }) => ({ ...row, name: itemName ?? folderName ?? "" })),
      };
    },
  );

  // Undoes a delete: the node comes back with everything that was deleted together with it.
  app.post(
    "/api/nodes/:nodeId/restore",
    { onRequest: requireUser, schema: { params: idParam("nodeId") } },
    async (req, reply) => {
      const { nodeId } = req.params as { nodeId: string };
      if (!(await access(req, reply, { nodeId }, "editor"))) return reply;
      const restored = await db.transaction(async (tx) => {
        const [node] = await tx.select().from(nodes).where(eq(nodes.id, nodeId));
        if (!node?.deletedAt) return null;
        // Nothing comes back into a removed set.
        const [set] = await tx
          .select({ archivedAt: sets.archivedAt })
          .from(sets)
          .where(eq(sets.id, node.setId))
          .for("update");
        if (set?.archivedAt) return null;
        // One delete stamps the node and its contents with the same time, which is how the group is found again.
        const group = await tx
          .select({ id: nodes.id, parentId: nodes.parentId, kind: nodes.kind })
          .from(nodes)
          .where(and(eq(nodes.setId, node.setId), eq(nodes.deletedAt, node.deletedAt)));
        const back = [node, ...group.filter((n) => descendantIds(group, nodeId).has(n.id))];
        const [parent] = node.parentId
          ? await tx.select({ deletedAt: nodes.deletedAt }).from(nodes).where(eq(nodes.id, node.parentId))
          : [];
        // If its folder is still deleted, the node comes back directly under the set. It goes last among its siblings.
        const parentId = node.parentId && !parent?.deletedAt ? node.parentId : null;
        const [last] = await tx
          .select({ max: sql<number>`coalesce(max(${nodes.position}), 0)` })
          .from(nodes)
          .where(
            and(
              eq(nodes.setId, node.setId),
              isNull(nodes.deletedAt),
              parentId ? eq(nodes.parentId, parentId) : isNull(nodes.parentId),
            ),
          );
        await tx
          .update(nodes)
          .set({ deletedAt: null })
          .where(
            inArray(
              nodes.id,
              back.map((n) => n.id),
            ),
          );
        await tx
          .update(nodes)
          .set({ parentId, position: (last?.max ?? 0) + 1 })
          .where(eq(nodes.id, nodeId));
        for (const n of back) await audit(tx, req.user?.id ?? null, `${n.kind}.restore`, n.kind, n.id);
        return back.length;
      });
      if (restored === null) return reply.code(404).send({ error: "Nothing deleted with this id" });
      return { restored };
    },
  );

  // Soft delete: the node and everything inside it are hidden, never removed. History and UIDs are kept.
  app.delete(
    "/api/nodes/:nodeId",
    { onRequest: requireUser, schema: { params: idParam("nodeId") } },
    async (req, reply) => {
      const { nodeId } = req.params as { nodeId: string };
      if (!(await access(req, reply, { nodeId }, "editor"))) return reply;
      const deleted = await db.transaction(async (tx) => {
        const locked = await lockSetOf(tx, nodeId);
        if (!locked) return null;
        const doomed = [locked.node, ...locked.live.filter((n) => descendantIds(locked.live, nodeId).has(n.id))];
        await tx
          .update(nodes)
          .set({ deletedAt: new Date() })
          .where(
            inArray(
              nodes.id,
              doomed.map((n) => n.id),
            ),
          );
        for (const n of doomed) await audit(tx, req.user?.id ?? null, `${n.kind}.delete`, n.kind, n.id);
        return doomed.length;
      });
      if (deleted === null) return reply.code(404).send({ error: "Not found" });
      return { deleted };
    },
  );
}
