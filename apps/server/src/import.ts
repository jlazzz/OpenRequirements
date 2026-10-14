import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { docError, emptyDoc, formatUid, type RichNode } from "@app/shared";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { itemDrafts, itemRevisions, links, linkTypes, nodes, sets } from "./db/schema.ts";
import { checkAttributes, type FieldDef } from "./domain/attributes.ts";
import { onlyStatusChanged } from "./domain/review.ts";
import { watchSuspect } from "./links.ts";
import { fieldsOf, searchTextOf, statusFieldOf } from "./nodes.ts";

const uuid = { type: "string", format: "uuid" } as const;
const MAX_NODES = 5000;
const MAX_DEPTH = 30;

type ImportNode = {
  ref?: string;
  kind: "folder" | "item";
  id?: string;
  uid?: string;
  externalId?: string;
  name: string;
  description?: RichNode;
  attributes?: Record<string, unknown>;
  children?: ImportNode[];
};
type Body = {
  sets: { setId: string; parentId?: string; nodes: ImportNode[] }[];
  links?: { typeId: string; upstream: string; downstream: string }[];
  dryRun?: boolean;
};
type Status = "added" | "changed" | "unchanged";

export function importRoutes({ app, db, requireUser, audit, access, mail }: AppContext) {
  // Structured import: creates trees of folders and items in one or more sets, updates the items it names, and adds
  // relationships between them, all or none. The web app reads the file (spreadsheet, ReqIF, Word) and maps it first.
  app.post(
    "/api/projects/:projectId/import",
    {
      onRequest: requireUser,
      // Room for 5,000 items with long descriptions.
      bodyLimit: 50 * 1024 * 1024,
      schema: {
        params: { type: "object", required: ["projectId"], properties: { projectId: uuid } },
        body: {
          type: "object",
          required: ["sets"],
          additionalProperties: false,
          definitions: {
            node: {
              type: "object",
              required: ["kind", "name"],
              additionalProperties: false,
              properties: {
                // A name for an item, unique in the request, that relationships below point at.
                ref: { type: "string", minLength: 1, maxLength: 200 },
                kind: { enum: ["folder", "item"] },
                // An existing folder or item of the set: a folder is reused, an item gets a new version if it differs.
                id: uuid,
                // An existing item of the set, by UID, as for `id`.
                uid: { type: "string", minLength: 1, maxLength: 50 },
                // The node's identifier in the source file. A node of the set imported with it before, or whose own
                // id it is, is matched as for `id`; otherwise the new node keeps it for the next import.
                externalId: { type: "string", minLength: 1, maxLength: 200 },
                name: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
                description: { type: "object" },
                attributes: { type: "object" },
                children: { type: "array", items: { $ref: "#/definitions/node" } },
              },
            },
          },
          properties: {
            sets: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: {
                type: "object",
                required: ["setId", "nodes"],
                additionalProperties: false,
                properties: {
                  setId: uuid,
                  parentId: uuid,
                  nodes: { type: "array", minItems: 1, items: { $ref: "#/definitions/node" } },
                },
              },
            },
            links: {
              type: "array",
              maxItems: 20_000,
              items: {
                type: "object",
                required: ["typeId", "upstream", "downstream"],
                additionalProperties: false,
                properties: { typeId: uuid, upstream: { type: "string" }, downstream: { type: "string" } },
              },
            },
            // Work out what would change and say so, without writing anything.
            dryRun: { type: "boolean" },
          },
        },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "editor"))) return reply;
      const body = req.body as Body;
      const user = req.user as { id: string; name: string };
      const setIds = body.sets.map((s) => s.setId);
      if (new Set(setIds).size !== setIds.length) return reply.code(400).send({ error: "A set is listed twice" });

      const result = await db.transaction(async (tx) => {
        // Locks the sets in a fixed order: concurrent creates cannot collide on UIDs, and two imports cannot deadlock.
        const locked = await tx
          .select()
          .from(sets)
          .where(and(inArray(sets.id, setIds), eq(sets.projectId, projectId)))
          .orderBy(sets.id)
          .for("update");
        if (locked.length !== setIds.length) return { error: [400, "Set not found in this project"] } as const;

        const nodeRows: (typeof nodes.$inferInsert)[] = [];
        const revisionRows: (typeof itemRevisions.$inferInsert)[] = [];
        // Existing items the import names, with what it says about them.
        const matched: { id: string; uid: string; setId: string; node: ImportNode; at: number }[] = [];
        const refs = new Map<string, string>();
        const rows: { uid: string; name: string; status: Status }[] = [];
        const counts: {
          setId: string;
          name: string;
          items: number;
          folders: number;
          changed: number;
          counter: number;
          fields: FieldDef[];
        }[] = [];

        for (const part of body.sets) {
          const set = locked.find((s) => s.id === part.setId);
          if (!set) throw new Error("locked set missing");
          const live = await tx
            .select({
              id: nodes.id,
              parentId: nodes.parentId,
              kind: nodes.kind,
              uid: nodes.uid,
              externalId: nodes.externalId,
              position: nodes.position,
            })
            .from(nodes)
            .where(and(eq(nodes.setId, set.id), isNull(nodes.deletedAt)));
          const parentId = part.parentId ?? null;
          if (parentId && live.find((n) => n.id === parentId)?.kind !== "folder") {
            return { error: [400, "Parent must be a folder in the same set"] } as const;
          }
          const fields = await fieldsOf(tx, set.itemTypeId);
          // New nodes go after the ones already in a folder.
          const after = (under: string | null) =>
            Math.max(0, ...live.filter((n) => n.parentId === under).map((n) => n.position)) + 1;
          const used = new Set<string>();
          let counter = set.uidCounter;
          const count = { setId: set.id, name: set.name, items: 0, folders: 0, changed: 0, fields };

          const match = (node: ImportNode, name: string): { id: string; uid: string } | string | null => {
            const what = node.kind === "folder" ? "Folder" : "Item";
            const found = node.id
              ? live.find((n) => n.id === node.id)
              : node.uid
                ? live.find((n) => n.uid === node.uid)
                : node.externalId
                  ? live.find((n) => n.externalId === node.externalId || n.id === node.externalId)
                  : undefined;
            if (!found) {
              if (node.id || node.uid) return `${what} "${name}": ${node.uid ?? "it"} is not in this set`;
              return null;
            }
            if (found.kind !== node.kind) return `${what} "${name}" matches a ${found.kind} of the set`;
            if (used.has(found.id)) return `${what} "${name}": the import names it twice`;
            used.add(found.id);
            return { id: found.id, uid: found.uid ?? "" };
          };

          // Parents are added before their children, so the rows can be inserted in this order.
          const place = (list: ImportNode[], under: string | null, depth: number): string | null => {
            let position = after(under);
            for (const node of list) {
              if (nodeRows.length + matched.length >= MAX_NODES) {
                return `An import can hold at most ${MAX_NODES} folders and items`;
              }
              const name = node.name.trim();
              const existing = match(node, name);
              if (typeof existing === "string") return existing;
              if (node.kind === "folder") {
                if (depth >= MAX_DEPTH) return "Folders are nested too deeply";
                if (node.ref || node.uid || node.description || node.attributes) {
                  return `Folder "${name}": a folder has only a name and children`;
                }
                const id = existing?.id ?? randomUUID();
                if (!existing) {
                  const externalId = node.externalId ?? null;
                  nodeRows.push({
                    id,
                    setId: set.id,
                    parentId: under,
                    position: position++,
                    kind: "folder",
                    name,
                    externalId,
                  });
                  count.folders++;
                }
                const problem = place(node.children ?? [], id, depth + 1);
                if (problem) return problem;
                continue;
              }
              if (node.children?.length) return `Item "${name}": items cannot hold other items`;
              const problem = node.description && docError(node.description);
              if (problem) return `Item "${name}": ${problem}`;
              const id = existing?.id ?? randomUUID();
              if (node.ref) {
                if (refs.has(node.ref)) return `The reference "${node.ref}" is used twice`;
                refs.set(node.ref, id);
              }
              if (existing) {
                // Checked and compared once the current versions are read, below.
                matched.push({ ...existing, setId: set.id, node, at: rows.length });
                rows.push({ uid: existing.uid, name, status: "unchanged" });
                continue;
              }
              const checked = checkAttributes(fields, node.attributes ?? {});
              if ("error" in checked) return `Item "${name}": ${checked.error}`;
              const description = node.description ?? emptyDoc;
              const uid = formatUid(set.uidPrefix, ++counter);
              const searchText = searchTextOf(uid, name, description, checked.attributes);
              const externalId = node.externalId ?? null;
              nodeRows.push({
                id,
                setId: set.id,
                parentId: under,
                position: position++,
                kind: "item",
                uid,
                searchText,
                externalId,
              });
              revisionRows.push({
                itemId: id,
                number: 1,
                name,
                description,
                attributes: checked.attributes,
                authorId: user.id,
                changeReason: "Imported",
              });
              rows.push({ uid, name, status: "added" });
              count.items++;
            }
            return null;
          };
          const problem = place(part.nodes, parentId, 0);
          if (problem) return { error: [400, problem] } as const;
          counts.push({ ...count, counter });
        }

        // An existing item gets a new version when the import changes it. What the import leaves out stays as it is.
        const revisionOf = new Map<string, number>();
        const changed: {
          id: string;
          uid: string;
          name: string;
          description: RichNode;
          attributes: Record<string, unknown>;
        }[] = [];
        const matchedIds = matched.map((m) => m.id);
        const current =
          matchedIds.length === 0
            ? []
            : await tx
                .selectDistinctOn([itemRevisions.itemId], {
                  itemId: itemRevisions.itemId,
                  number: itemRevisions.number,
                  name: itemRevisions.name,
                  description: itemRevisions.description,
                  attributes: itemRevisions.attributes,
                })
                .from(itemRevisions)
                .where(inArray(itemRevisions.itemId, matchedIds))
                .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
        for (const { id, uid, setId, node, at } of matched) {
          const now = current.find((r) => r.itemId === id);
          const count = counts.find((c) => c.setId === setId);
          if (!now || !count) throw new Error("matched item has no revision");
          const name = node.name.trim();
          const checked = checkAttributes(count.fields, { ...now.attributes, ...node.attributes });
          if ("error" in checked) return { error: [400, `Item "${name}" (${uid}): ${checked.error}`] } as const;
          const next = { name, description: node.description ?? now.description, attributes: checked.attributes };
          revisionOf.set(id, now.number);
          if (isDeepStrictEqual(next, { name: now.name, description: now.description, attributes: now.attributes })) {
            continue;
          }
          revisionOf.set(id, now.number + 1);
          (rows[at] as (typeof rows)[number]).status = "changed";
          count.changed++;
          changed.push({ id, uid, ...next });
          revisionRows.push({
            itemId: id,
            number: now.number + 1,
            ...next,
            statusOnly: onlyStatusChanged(now, next, statusFieldOf(count.fields)?.id),
            authorId: user.id,
            changeReason: "Imported",
          });
        }

        const changedIds = changed.map((c) => c.id);
        // A draft is edits from a version this import is about to replace: it could not be saved afterwards.
        const drafts =
          changedIds.length === 0
            ? []
            : await tx
                .select({ itemId: itemDrafts.itemId })
                .from(itemDrafts)
                .where(and(inArray(itemDrafts.itemId, changedIds), eq(itemDrafts.authorId, user.id)));
        if (drafts.length > 0) {
          const uids = drafts.map((d) => changed.find((c) => c.id === d.itemId)?.uid).join(", ");
          return { error: [409, `You have unsaved drafts of ${uids}. Save or discard them first.`] } as const;
        }

        const types = await tx.select({ id: linkTypes.id }).from(linkTypes).where(eq(linkTypes.projectId, projectId));
        // Relationships that already exist between matched items are left as they are.
        const existing =
          matchedIds.length < 2
            ? []
            : await tx
                .select({ upstreamId: links.upstreamId, downstreamId: links.downstreamId })
                .from(links)
                .where(
                  and(
                    isNull(links.deletedAt),
                    inArray(links.upstreamId, matchedIds),
                    inArray(links.downstreamId, matchedIds),
                  ),
                );
        const linked = new Set(existing.map((l) => [l.upstreamId, l.downstreamId].sort().join()));
        const pairs = new Set<string>();
        const linkRows: (typeof links.$inferInsert)[] = [];
        for (const link of body.links ?? []) {
          const upstreamId = refs.get(link.upstream);
          const downstreamId = refs.get(link.downstream);
          if (!upstreamId || !downstreamId)
            return { error: [400, "A relationship names an item that is not in this import"] } as const;
          if (!types.some((t) => t.id === link.typeId)) return { error: [400, "Unknown relationship type"] } as const;
          const pair = [upstreamId, downstreamId].sort().join();
          if (upstreamId === downstreamId || pairs.has(pair)) {
            return { error: [400, "Two items can be linked once, and an item cannot be linked to itself"] } as const;
          }
          pairs.add(pair);
          if (linked.has(pair)) continue;
          linkRows.push({
            projectId,
            linkTypeId: link.typeId,
            upstreamId,
            downstreamId,
            // A new item is at its first revision.
            upstreamRevision: revisionOf.get(upstreamId) ?? 1,
            downstreamRevision: revisionOf.get(downstreamId) ?? 1,
            createdBy: user.id,
          });
        }

        const created = {
          items: rows.filter((r) => r.status === "added").length,
          folders: nodeRows.length - rows.filter((r) => r.status === "added").length,
          links: linkRows.length,
        };
        const summary = {
          created,
          changed: changed.length,
          unchanged: rows.filter((r) => r.status === "unchanged").length,
          items: rows,
        };
        // Nothing is written above this line: a refusal returns without throwing, which would commit what was written.
        if (body.dryRun) return summary;

        for (const { setId, counter } of counts) {
          await tx.update(sets).set({ uidCounter: counter }).where(eq(sets.id, setId));
        }
        const suspectNews = changedIds.length > 0 ? await watchSuspect(tx, mail, projectId, changedIds, user) : null;
        // Inserted in chunks: Postgres allows 65,535 values per statement.
        for (let i = 0; i < nodeRows.length; i += 500) await tx.insert(nodes).values(nodeRows.slice(i, i + 500));
        for (let i = 0; i < revisionRows.length; i += 500) {
          await tx.insert(itemRevisions).values(revisionRows.slice(i, i + 500));
        }
        for (const item of changed) {
          await tx
            .update(nodes)
            .set({ searchText: searchTextOf(item.uid, item.name, item.description, item.attributes) })
            .where(eq(nodes.id, item.id));
        }
        for (let i = 0; i < linkRows.length; i += 500) await tx.insert(links).values(linkRows.slice(i, i + 500));
        await suspectNews?.();

        // One audit event per set and one for the relationships, so the activity stream is not flooded.
        const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
        for (const count of counts) {
          const added = [
            ...(count.items ? [plural(count.items, "item")] : []),
            ...(count.folders ? [plural(count.folders, "folder")] : []),
          ].join(" and ");
          if (!added && !count.changed) continue;
          const label = count.changed
            ? `${added ? `${added} added, ` : ""}${plural(count.changed, "item")} changed in ${count.name}`
            : `${added} into ${count.name}`;
          await audit(tx, user.id, "item.import", "set", count.setId, { projectId, label });
        }
        if (linkRows.length > 0) {
          await audit(tx, user.id, "link.import", "project", projectId, {
            label: plural(linkRows.length, "relationship"),
          });
        }
        return summary;
      });

      if ("error" in result) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(body.dryRun ? 200 : 201).send(result);
    },
  );
}
