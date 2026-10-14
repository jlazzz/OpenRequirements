import { type Proposal, planStructure } from "@app/importers";
import { and, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import type { AppContext, Tx } from "./app.ts";
import { attributeDefinitions, itemTypes, linkTypes, nodes, sets } from "./db/schema.ts";

const uuid = { type: "string", format: "uuid" } as const;
const idParam = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;
const name = { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" } as const;
const options = {
  type: "array",
  minItems: 1,
  maxItems: 200,
  uniqueItems: true,
  items: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" },
} as const;
const FIELD_TYPES = ["text", "number", "enum", "multi_enum", "date", "boolean", "steps"];
const hasOptions = (type: string) => type === "enum" || type === "multi_enum";

/** True when a live row among `rows` already has this name, ignoring case and spaces at the ends. */
const taken = (rows: { id: string; name: string }[], wanted: string, except?: string) =>
  rows.some((row) => row.id !== except && row.name.trim().toLowerCase() === wanted.trim().toLowerCase());

/**
 * The project's structure, edited by a project admin: item types and their fields, sets, relationship types.
 * Remove is soft (`archivedAt`): old versions, baselines and links keep what they point at.
 */
export function typeRoutes({ app, db, requireUser, audit, access }: AppContext) {
  const liveTypes = (tx: Tx, projectId: string) =>
    tx
      .select({ id: itemTypes.id, name: itemTypes.name })
      .from(itemTypes)
      .where(and(eq(itemTypes.projectId, projectId), isNull(itemTypes.archivedAt)));
  const liveFields = (tx: Tx, itemTypeId: string) =>
    tx
      .select({ id: attributeDefinitions.id, name: attributeDefinitions.name })
      .from(attributeDefinitions)
      .where(and(eq(attributeDefinitions.itemTypeId, itemTypeId), isNull(attributeDefinitions.archivedAt)));
  const liveSets = (tx: Tx, projectId: string) =>
    tx
      .select({ id: sets.id, name: sets.name })
      .from(sets)
      .where(and(eq(sets.projectId, projectId), isNull(sets.archivedAt)));
  const liveLinkTypes = (tx: Tx, projectId: string) =>
    tx
      .select({ id: linkTypes.id, name: linkTypes.name })
      .from(linkTypes)
      .where(and(eq(linkTypes.projectId, projectId), isNull(linkTypes.archivedAt)));

  app.get(
    "/api/projects/:projectId/types",
    { onRequest: requireUser, schema: { params: idParam("projectId") } },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "viewer");
      if (!projectId) return reply;
      const types = await db
        .select({ id: itemTypes.id, name: itemTypes.name, role: itemTypes.role })
        .from(itemTypes)
        .where(and(eq(itemTypes.projectId, projectId), isNull(itemTypes.archivedAt)))
        .orderBy(itemTypes.name);
      const fields = await db
        .select({
          id: attributeDefinitions.id,
          itemTypeId: attributeDefinitions.itemTypeId,
          name: attributeDefinitions.name,
          type: attributeDefinitions.type,
          options: attributeDefinitions.options,
        })
        .from(attributeDefinitions)
        .innerJoin(itemTypes, eq(itemTypes.id, attributeDefinitions.itemTypeId))
        .where(and(eq(itemTypes.projectId, projectId), isNull(attributeDefinitions.archivedAt)))
        .orderBy(attributeDefinitions.position);
      return {
        itemTypes: types.map((type) => ({
          ...type,
          fields: fields.filter((f) => f.itemTypeId === type.id).map(({ itemTypeId: _, ...f }) => f),
        })),
        sets: await db
          .select({ id: sets.id, name: sets.name, uidPrefix: sets.uidPrefix, itemTypeId: sets.itemTypeId })
          .from(sets)
          .where(and(eq(sets.projectId, projectId), isNull(sets.archivedAt)))
          .orderBy(sets.position),
        linkTypes: await db
          .select({ id: linkTypes.id, name: linkTypes.name, role: linkTypes.role })
          .from(linkTypes)
          .where(and(eq(linkTypes.projectId, projectId), isNull(linkTypes.archivedAt)))
          .orderBy(linkTypes.position),
      };
    },
  );

  // Structure from an import file: adds the sets, item types, fields and relationship types a file implies, and
  // only adds. What exists is used as it is (see `planStructure`). `dryRun` says what would be added.
  app.post(
    "/api/projects/:projectId/structure",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["sets"],
          additionalProperties: false,
          properties: {
            sets: {
              type: "array",
              maxItems: 100,
              items: {
                type: "object",
                required: ["name", "uidPrefix", "fields"],
                additionalProperties: false,
                properties: {
                  name,
                  uidPrefix: { type: "string", pattern: "^[A-Z][A-Z0-9]{0,9}$" },
                  fields: {
                    type: "array",
                    maxItems: 200,
                    items: {
                      type: "object",
                      required: ["name", "type"],
                      additionalProperties: false,
                      properties: {
                        name,
                        type: { enum: FIELD_TYPES.filter((t) => t !== "steps") },
                        options,
                      },
                    },
                  },
                },
              },
            },
            linkTypes: { type: "array", maxItems: 100, items: name },
            dryRun: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "admin");
      if (!projectId) return reply;
      const body = req.body as Proposal & { dryRun?: boolean };
      const proposal: Proposal = { sets: body.sets, linkTypes: body.linkTypes ?? [] };
      for (const set of proposal.sets) {
        for (const field of set.fields) {
          if (hasOptions(field.type) !== Boolean(field.options)) {
            return reply.code(400).send({
              error: `${set.name} / ${field.name}: allowed values are for enum fields only, and needed there`,
            });
          }
        }
      }
      const userId = req.user?.id as string;
      const result = await db.transaction(async (tx) => {
        // The project row is locked, so two imports cannot create the same set twice.
        await tx.execute(sql`select 1 from projects where id = ${projectId} for update`);
        const types = await tx
          .select({ id: itemTypes.id, name: itemTypes.name })
          .from(itemTypes)
          .where(and(eq(itemTypes.projectId, projectId), isNull(itemTypes.archivedAt)));
        const typeIds = types.map((t) => t.id);
        const fields = await tx
          .select()
          .from(attributeDefinitions)
          .where(and(inArray(attributeDefinitions.itemTypeId, typeIds), isNull(attributeDefinitions.archivedAt)));
        const liveSetRows = await tx.select().from(sets).where(eq(sets.projectId, projectId));
        const liveLinks = await tx
          .select({ id: linkTypes.id, name: linkTypes.name })
          .from(linkTypes)
          .where(and(eq(linkTypes.projectId, projectId), isNull(linkTypes.archivedAt)));
        const plan = planStructure(proposal, {
          itemTypes: types.map((t) => ({
            ...t,
            fields: fields
              .filter((f) => f.itemTypeId === t.id)
              .map((f) => ({ id: f.id, name: f.name, type: f.type, options: f.options })),
          })),
          sets: liveSetRows
            .filter((s) => !s.archivedAt)
            .map((s) => ({ id: s.id, name: s.name, uidPrefix: s.uidPrefix, itemTypeId: s.itemTypeId })),
          linkTypes: liveLinks,
          // Removed sets count: their prefix stays taken.
          prefixes: liveSetRows.map((s) => s.uidPrefix),
        });
        const added: string[] = [];
        for (const set of plan.sets) {
          if (!set.itemType.id) added.push(`Item type "${set.itemType.name}"`);
          if (!set.id) added.push(`Set "${set.name}" (${set.uidPrefix})`);
          for (const f of set.fields) {
            if (!f.id) added.push(`Field "${f.name}" on ${set.itemType.name}`);
            else if (f.addOptions.length > 0) {
              added.push(
                `Values ${f.addOptions.map((o) => `"${o}"`).join(", ")} on "${f.name}" of ${set.itemType.name}`,
              );
            }
          }
        }
        for (const t of plan.linkTypes) if (!t.id) added.push(`Relationship type "${t.name}"`);
        if (body.dryRun) return { added, notes: plan.notes, sets: plan.sets, linkTypes: plan.linkTypes };

        const label = (action: string, kind: string, id: string, text: string) =>
          audit(tx, userId, action, kind, id, { projectId, label: text });
        for (const set of plan.sets) {
          let typeId = set.itemType.id;
          if (!typeId) {
            const [row] = await tx
              .insert(itemTypes)
              .values({ projectId, name: set.itemType.name })
              .returning({ id: itemTypes.id });
            if (!row) throw new Error("item type insert returned no row");
            typeId = row.id;
            set.itemType.id = typeId;
            await label("item_type.create", "item_type", typeId, set.itemType.name);
          }
          const [last] = await tx
            .select({ position: max(attributeDefinitions.position) })
            .from(attributeDefinitions)
            .where(eq(attributeDefinitions.itemTypeId, typeId));
          let position = (last?.position ?? -1) + 1;
          for (const f of set.fields) {
            if (f.id) {
              if (f.addOptions.length === 0) continue;
              const next = [...(f.options ?? []), ...f.addOptions];
              const [row] = await tx.select().from(attributeDefinitions).where(eq(attributeDefinitions.id, f.id));
              await tx
                .update(attributeDefinitions)
                .set({
                  options: next,
                  archivedOptions: (row?.archivedOptions ?? []).filter((o) => !next.includes(o)),
                })
                .where(eq(attributeDefinitions.id, f.id));
              await label("field.update", "field", f.id, f.name);
              continue;
            }
            const [row] = await tx
              .insert(attributeDefinitions)
              .values({ itemTypeId: typeId, name: f.name, type: f.type, options: f.options, position: position++ })
              .returning({ id: attributeDefinitions.id });
            if (!row) throw new Error("field insert returned no row");
            f.id = row.id;
            await label("field.create", "field", row.id, f.name);
          }
          if (!set.id) {
            const [lastSet] = await tx
              .select({ position: max(sets.position) })
              .from(sets)
              .where(eq(sets.projectId, projectId));
            const [row] = await tx
              .insert(sets)
              .values({
                projectId,
                itemTypeId: typeId,
                name: set.name,
                uidPrefix: set.uidPrefix,
                position: (lastSet?.position ?? -1) + 1,
              })
              .returning({ id: sets.id });
            if (!row) throw new Error("set insert returned no row");
            set.id = row.id;
            await label("set.create", "set", row.id, set.name);
          }
        }
        for (const t of plan.linkTypes) {
          if (t.id) continue;
          const [last] = await tx
            .select({ position: max(linkTypes.position) })
            .from(linkTypes)
            .where(eq(linkTypes.projectId, projectId));
          const [row] = await tx
            .insert(linkTypes)
            .values({ projectId, name: t.name, position: (last?.position ?? -1) + 1 })
            .returning({ id: linkTypes.id });
          if (!row) throw new Error("link type insert returned no row");
          t.id = row.id;
          await label("link_type.create", "link_type", row.id, t.name);
        }
        return { added, notes: plan.notes, sets: plan.sets, linkTypes: plan.linkTypes };
      });
      return reply.code(body.dryRun ? 200 : 201).send(result);
    },
  );

  // Item types

  const itemTypeRole = { enum: ["test", null] } as const;

  app.post(
    "/api/projects/:projectId/item-types",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name, role: itemTypeRole },
        },
      },
    },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "admin");
      if (!projectId) return reply;
      const body = req.body as { name: string; role?: "test" | null };
      const result = await db.transaction(async (tx) => {
        if (taken(await liveTypes(tx, projectId), body.name)) return null;
        const [row] = await tx
          .insert(itemTypes)
          .values({ projectId, name: body.name.trim(), role: body.role ?? null })
          .returning({ id: itemTypes.id });
        if (!row) throw new Error("item type insert returned no row");
        await audit(tx, req.user?.id as string, "item_type.create", "item_type", row.id, {
          projectId,
          label: body.name.trim(),
        });
        return row.id;
      });
      if (!result) return reply.code(409).send({ error: "An item type with this name exists" });
      return reply.code(201).send({ id: result });
    },
  );

  app.patch(
    "/api/item-types/:itemTypeId",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("itemTypeId"),
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: { name, role: itemTypeRole },
        },
      },
    },
    async (req, reply) => {
      const { itemTypeId } = req.params as { itemTypeId: string };
      const projectId = await access(req, reply, { itemTypeId }, "admin");
      if (!projectId) return reply;
      const body = req.body as { name?: string; role?: "test" | null };
      const error = await db.transaction(async (tx) => {
        if (body.name !== undefined && taken(await liveTypes(tx, projectId), body.name, itemTypeId)) {
          return "An item type with this name exists";
        }
        const [row] = await tx
          .update(itemTypes)
          .set({ name: body.name?.trim(), role: body.role })
          .where(and(eq(itemTypes.id, itemTypeId), isNull(itemTypes.archivedAt)))
          .returning({ name: itemTypes.name });
        if (!row) return "This item type was removed";
        await audit(tx, req.user?.id as string, "item_type.update", "item_type", itemTypeId, {
          projectId,
          label: row.name,
        });
        return null;
      });
      return error ? reply.code(409).send({ error }) : { ok: true };
    },
  );

  app.delete(
    "/api/item-types/:itemTypeId",
    { onRequest: requireUser, schema: { params: idParam("itemTypeId") } },
    async (req, reply) => {
      const { itemTypeId } = req.params as { itemTypeId: string };
      const projectId = await access(req, reply, { itemTypeId }, "admin");
      if (!projectId) return reply;
      const error = await db.transaction(async (tx) => {
        const [used] = await tx
          .select({ name: sets.name })
          .from(sets)
          .where(and(eq(sets.itemTypeId, itemTypeId), isNull(sets.archivedAt)));
        if (used) return `The set "${used.name}" holds this item type. Remove the set first.`;
        const [row] = await tx
          .update(itemTypes)
          .set({ archivedAt: new Date() })
          .where(and(eq(itemTypes.id, itemTypeId), isNull(itemTypes.archivedAt)))
          .returning({ name: itemTypes.name });
        if (!row) return "This item type was removed";
        await audit(tx, req.user?.id as string, "item_type.remove", "item_type", itemTypeId, {
          projectId,
          label: row.name,
        });
        return null;
      });
      return error ? reply.code(409).send({ error }) : { ok: true };
    },
  );

  // Fields

  app.post(
    "/api/item-types/:itemTypeId/fields",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("itemTypeId"),
        body: {
          type: "object",
          required: ["name", "type"],
          additionalProperties: false,
          properties: { name, type: { enum: FIELD_TYPES }, options },
        },
      },
    },
    async (req, reply) => {
      const { itemTypeId } = req.params as { itemTypeId: string };
      const projectId = await access(req, reply, { itemTypeId }, "admin");
      if (!projectId) return reply;
      const body = req.body as { name: string; type: string; options?: string[] };
      if (hasOptions(body.type) !== Boolean(body.options)) {
        return reply
          .code(400)
          .send({ error: "Allowed values are given for enum and multi_enum fields only, and needed there" });
      }
      const result = await db.transaction(async (tx) => {
        const [type] = await tx
          .select({ id: itemTypes.id })
          .from(itemTypes)
          .where(and(eq(itemTypes.id, itemTypeId), isNull(itemTypes.archivedAt)))
          .for("update");
        if (!type) return { error: "This item type was removed" };
        if (taken(await liveFields(tx, itemTypeId), body.name)) return { error: "A field with this name exists" };
        const [last] = await tx
          .select({ position: max(attributeDefinitions.position) })
          .from(attributeDefinitions)
          .where(eq(attributeDefinitions.itemTypeId, itemTypeId));
        const [row] = await tx
          .insert(attributeDefinitions)
          .values({
            itemTypeId,
            name: body.name.trim(),
            type: body.type,
            options: body.options?.map((o) => o.trim()) ?? null,
            position: (last?.position ?? -1) + 1,
          })
          .returning({ id: attributeDefinitions.id });
        if (!row) throw new Error("field insert returned no row");
        await audit(tx, req.user?.id as string, "field.create", "field", row.id, {
          projectId,
          label: body.name.trim(),
        });
        return { id: row.id };
      });
      if ("error" in result) return reply.code(409).send(result);
      return reply.code(201).send(result);
    },
  );

  // Renames a field or replaces its allowed values. Its type never changes: stored values would stop fitting it.
  app.patch(
    "/api/fields/:fieldId",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("fieldId"),
        body: { type: "object", minProperties: 1, additionalProperties: false, properties: { name, options } },
      },
    },
    async (req, reply) => {
      const { fieldId } = req.params as { fieldId: string };
      const projectId = await access(req, reply, { fieldId }, "admin");
      if (!projectId) return reply;
      const body = req.body as { name?: string; options?: string[] };
      const result = await db.transaction(async (tx) => {
        const [field] = await tx
          .select()
          .from(attributeDefinitions)
          .where(and(eq(attributeDefinitions.id, fieldId), isNull(attributeDefinitions.archivedAt)))
          .for("update");
        if (!field) return [409, "This field was removed"] as const;
        if (body.options && !hasOptions(field.type))
          return [400, "Only enum and multi_enum fields have allowed values"] as const;
        if (body.name !== undefined && taken(await liveFields(tx, field.itemTypeId), body.name, fieldId)) {
          return [409, "A field with this name exists"] as const;
        }
        const next = body.options?.map((o) => o.trim());
        // A value taken out of the list is kept aside: old versions may hold it. Put back, it is allowed again.
        const archivedOptions = next
          ? [...new Set([...field.archivedOptions, ...(field.options ?? [])])].filter((o) => !next.includes(o))
          : undefined;
        await tx
          .update(attributeDefinitions)
          .set({ name: body.name?.trim(), options: next, archivedOptions })
          .where(eq(attributeDefinitions.id, fieldId));
        await audit(tx, req.user?.id as string, "field.update", "field", fieldId, {
          projectId,
          label: body.name?.trim() ?? field.name,
        });
        return null;
      });
      return result ? reply.code(result[0]).send({ error: result[1] }) : { ok: true };
    },
  );

  app.delete(
    "/api/fields/:fieldId",
    { onRequest: requireUser, schema: { params: idParam("fieldId") } },
    async (req, reply) => {
      const { fieldId } = req.params as { fieldId: string };
      const projectId = await access(req, reply, { fieldId }, "admin");
      if (!projectId) return reply;
      const removed = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(attributeDefinitions)
          .set({ archivedAt: new Date() })
          .where(and(eq(attributeDefinitions.id, fieldId), isNull(attributeDefinitions.archivedAt)))
          .returning({ name: attributeDefinitions.name });
        if (row)
          await audit(tx, req.user?.id as string, "field.remove", "field", fieldId, { projectId, label: row.name });
        return Boolean(row);
      });
      return removed ? { ok: true } : reply.code(409).send({ error: "This field was removed" });
    },
  );

  // Sets

  app.post(
    "/api/projects/:projectId/sets",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["name", "uidPrefix", "itemTypeId"],
          additionalProperties: false,
          properties: { name, uidPrefix: { type: "string", pattern: "^[A-Z][A-Z0-9]{0,9}$" }, itemTypeId: uuid },
        },
      },
    },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "admin");
      if (!projectId) return reply;
      const body = req.body as { name: string; uidPrefix: string; itemTypeId: string };
      const result = await db.transaction(async (tx) => {
        const [type] = await tx
          .select({ id: itemTypes.id })
          .from(itemTypes)
          .where(
            and(eq(itemTypes.id, body.itemTypeId), eq(itemTypes.projectId, projectId), isNull(itemTypes.archivedAt)),
          );
        if (!type) return { error: "Unknown item type" };
        if (taken(await liveSets(tx, projectId), body.name)) return { error: "A set with this name exists" };
        // Removed sets count: their prefix stays taken, so UIDs are never reused.
        const [same] = await tx
          .select({ id: sets.id })
          .from(sets)
          .where(and(eq(sets.projectId, projectId), eq(sets.uidPrefix, body.uidPrefix)));
        if (same) return { error: "This UID prefix is or was used in the project" };
        const [last] = await tx
          .select({ position: max(sets.position) })
          .from(sets)
          .where(eq(sets.projectId, projectId));
        const [row] = await tx
          .insert(sets)
          .values({
            projectId,
            itemTypeId: body.itemTypeId,
            name: body.name.trim(),
            uidPrefix: body.uidPrefix,
            position: (last?.position ?? -1) + 1,
          })
          .returning({ id: sets.id });
        if (!row) throw new Error("set insert returned no row");
        await audit(tx, req.user?.id as string, "set.create", "set", row.id, { projectId, label: body.name.trim() });
        return { id: row.id };
      });
      if ("error" in result) return reply.code(409).send(result);
      return reply.code(201).send(result);
    },
  );

  // A set keeps its UID prefix: the UIDs it handed out already carry it.
  app.patch(
    "/api/sets/:setId",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("setId"),
        body: { type: "object", required: ["name"], additionalProperties: false, properties: { name } },
      },
    },
    async (req, reply) => {
      const { setId } = req.params as { setId: string };
      const projectId = await access(req, reply, { setId }, "admin");
      if (!projectId) return reply;
      const body = req.body as { name: string };
      const renamed = await db.transaction(async (tx) => {
        if (taken(await liveSets(tx, projectId), body.name, setId)) return false;
        await tx.update(sets).set({ name: body.name.trim() }).where(eq(sets.id, setId));
        await audit(tx, req.user?.id as string, "set.update", "set", setId, { projectId, label: body.name.trim() });
        return true;
      });
      return renamed ? { ok: true } : reply.code(409).send({ error: "A set with this name exists" });
    },
  );

  // Only an empty set is removed. Its deleted items stay in history and baselines but can no longer be restored.
  app.delete(
    "/api/sets/:setId",
    { onRequest: requireUser, schema: { params: idParam("setId") } },
    async (req, reply) => {
      const { setId } = req.params as { setId: string };
      const projectId = await access(req, reply, { setId }, "admin");
      if (!projectId) return reply;
      const error = await db.transaction(async (tx) => {
        const [set] = await tx.select({ name: sets.name }).from(sets).where(eq(sets.id, setId)).for("update");
        const [live] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(nodes)
          .where(and(eq(nodes.setId, setId), isNull(nodes.deletedAt)));
        if (live?.count) return "This set still holds items or folders. Delete or move them first.";
        await tx.update(sets).set({ archivedAt: new Date() }).where(eq(sets.id, setId));
        await audit(tx, req.user?.id as string, "set.remove", "set", setId, { projectId, label: set?.name });
        return null;
      });
      return error ? reply.code(409).send({ error }) : { ok: true };
    },
  );

  // Relationship types

  const linkRole = { enum: ["verifies", null] } as const;

  app.post(
    "/api/projects/:projectId/link-types",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name, role: linkRole },
        },
      },
    },
    async (req, reply) => {
      const projectId = await access(req, reply, req.params as { projectId: string }, "admin");
      if (!projectId) return reply;
      const body = req.body as { name: string; role?: "verifies" | null };
      const id = await db.transaction(async (tx) => {
        if (taken(await liveLinkTypes(tx, projectId), body.name)) return null;
        const [last] = await tx
          .select({ position: max(linkTypes.position) })
          .from(linkTypes)
          .where(eq(linkTypes.projectId, projectId));
        const [row] = await tx
          .insert(linkTypes)
          .values({ projectId, name: body.name.trim(), role: body.role ?? null, position: (last?.position ?? -1) + 1 })
          .returning({ id: linkTypes.id });
        if (!row) throw new Error("link type insert returned no row");
        await audit(tx, req.user?.id as string, "link_type.create", "link_type", row.id, {
          projectId,
          label: body.name.trim(),
        });
        return row.id;
      });
      if (!id) return reply.code(409).send({ error: "A relationship type with this name exists" });
      return reply.code(201).send({ id });
    },
  );

  app.patch(
    "/api/link-types/:linkTypeId",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("linkTypeId"),
        body: { type: "object", minProperties: 1, additionalProperties: false, properties: { name, role: linkRole } },
      },
    },
    async (req, reply) => {
      const { linkTypeId } = req.params as { linkTypeId: string };
      const projectId = await access(req, reply, { linkTypeId }, "admin");
      if (!projectId) return reply;
      const body = req.body as { name?: string; role?: "verifies" | null };
      const error = await db.transaction(async (tx) => {
        if (body.name !== undefined && taken(await liveLinkTypes(tx, projectId), body.name, linkTypeId)) {
          return "A relationship type with this name exists";
        }
        const [row] = await tx
          .update(linkTypes)
          .set({ name: body.name?.trim(), role: body.role })
          .where(and(eq(linkTypes.id, linkTypeId), isNull(linkTypes.archivedAt)))
          .returning({ name: linkTypes.name });
        if (!row) return "This relationship type was removed";
        await audit(tx, req.user?.id as string, "link_type.update", "link_type", linkTypeId, {
          projectId,
          label: row.name,
        });
        return null;
      });
      return error ? reply.code(409).send({ error }) : { ok: true };
    },
  );

  // Existing relationships keep a removed type; it is offered for no new one. One live type always stays.
  app.delete(
    "/api/link-types/:linkTypeId",
    { onRequest: requireUser, schema: { params: idParam("linkTypeId") } },
    async (req, reply) => {
      const { linkTypeId } = req.params as { linkTypeId: string };
      const projectId = await access(req, reply, { linkTypeId }, "admin");
      if (!projectId) return reply;
      const error = await db.transaction(async (tx) => {
        const others = await tx
          .select({ id: linkTypes.id })
          .from(linkTypes)
          .where(and(eq(linkTypes.projectId, projectId), isNull(linkTypes.archivedAt), ne(linkTypes.id, linkTypeId)))
          .for("update");
        if (others.length === 0) return "A project keeps at least one relationship type";
        const [row] = await tx
          .update(linkTypes)
          .set({ archivedAt: new Date() })
          .where(and(eq(linkTypes.id, linkTypeId), isNull(linkTypes.archivedAt)))
          .returning({ name: linkTypes.name });
        if (!row) return "This relationship type was removed";
        await audit(tx, req.user?.id as string, "link_type.remove", "link_type", linkTypeId, {
          projectId,
          label: row.name,
        });
        return null;
      });
      return error ? reply.code(409).send({ error }) : { ok: true };
    },
  );
}
