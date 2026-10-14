import { randomUUID } from "node:crypto";
import { docError, emptyDoc, formatUid, type RichNode } from "@app/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { itemRevisions, links, linkTypes, nodes, sets } from "./db/schema.ts";
import { checkAttributes } from "./domain/attributes.ts";
import { fieldsOf, searchTextOf } from "./nodes.ts";

const uuid = { type: "string", format: "uuid" } as const;
const MAX_NODES = 5000;
const MAX_DEPTH = 30;

type ImportNode = {
  ref?: string;
  kind: "folder" | "item";
  name: string;
  description?: RichNode;
  attributes?: Record<string, unknown>;
  children?: ImportNode[];
};
type Body = {
  sets: { setId: string; parentId?: string; nodes: ImportNode[] }[];
  links?: { typeId: string; upstream: string; downstream: string }[];
};

export function importRoutes({ app, db, requireUser, audit, access }: AppContext) {
  // Structured import: creates trees of folders and items in one or more sets, and relationships between the new
  // items, all or none. The web app reads the file (ReqIF, Word) and maps it before calling this.
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
          },
        },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "editor"))) return reply;
      const body = req.body as Body;
      const userId = req.user?.id as string;
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
        const refs = new Map<string, string>();
        const counts: { setId: string; name: string; items: number; folders: number; counter: number }[] = [];

        for (const part of body.sets) {
          const set = locked.find((s) => s.id === part.setId);
          if (!set) throw new Error("locked set missing");
          const parentId = part.parentId ?? null;
          if (parentId) {
            const [parent] = await tx
              .select({ kind: nodes.kind })
              .from(nodes)
              .where(and(eq(nodes.id, parentId), eq(nodes.setId, set.id), isNull(nodes.deletedAt)));
            if (parent?.kind !== "folder") return { error: [400, "Parent must be a folder in the same set"] } as const;
          }
          const fields = await fieldsOf(tx, set.itemTypeId);
          const [last] = await tx
            .select({ max: sql<number>`coalesce(max(${nodes.position}), 0)` })
            .from(nodes)
            .where(and(eq(nodes.setId, set.id), parentId ? eq(nodes.parentId, parentId) : isNull(nodes.parentId)));
          let counter = set.uidCounter;
          const count = { setId: set.id, name: set.name, items: 0, folders: 0 };

          // Parents are added before their children, so the rows can be inserted in this order.
          const place = (list: ImportNode[], under: string | null, first: number, depth: number): string | null => {
            for (const [index, node] of list.entries()) {
              if (nodeRows.length >= MAX_NODES) return `An import can hold at most ${MAX_NODES} folders and items`;
              const name = node.name.trim();
              const id = randomUUID();
              const row = { id, setId: set.id, parentId: under, position: first + index };
              if (node.kind === "folder") {
                if (depth >= MAX_DEPTH) return "Folders are nested too deeply";
                if (node.ref || node.description || node.attributes) {
                  return `Folder "${name}": a folder has only a name and children`;
                }
                nodeRows.push({ ...row, kind: "folder", name });
                count.folders++;
                const problem = place(node.children ?? [], id, 1, depth + 1);
                if (problem) return problem;
                continue;
              }
              if (node.children?.length) return `Item "${name}": items cannot hold other items`;
              const checked = checkAttributes(fields, node.attributes ?? {});
              if ("error" in checked) return `Item "${name}": ${checked.error}`;
              const description = node.description ?? emptyDoc;
              const problem = docError(description);
              if (problem) return `Item "${name}": ${problem}`;
              if (node.ref) {
                if (refs.has(node.ref)) return `The reference "${node.ref}" is used twice`;
                refs.set(node.ref, id);
              }
              const uid = formatUid(set.uidPrefix, ++counter);
              const searchText = searchTextOf(uid, name, description, checked.attributes);
              nodeRows.push({ ...row, kind: "item", uid, searchText });
              revisionRows.push({
                itemId: id,
                number: 1,
                name,
                description,
                attributes: checked.attributes,
                authorId: userId,
                changeReason: "Imported",
              });
              count.items++;
            }
            return null;
          };
          const problem = place(part.nodes, parentId, (last?.max ?? 0) + 1, 0);
          if (problem) return { error: [400, problem] } as const;
          counts.push({ ...count, counter });
        }

        const types = await tx.select({ id: linkTypes.id }).from(linkTypes).where(eq(linkTypes.projectId, projectId));
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
          // Every imported item is at its first revision.
          linkRows.push({
            projectId,
            linkTypeId: link.typeId,
            upstreamId,
            downstreamId,
            upstreamRevision: 1,
            downstreamRevision: 1,
            createdBy: userId,
          });
        }

        // Nothing is written above this line: a refusal returns without throwing, which would commit what was written.
        for (const { setId, counter } of counts) {
          await tx.update(sets).set({ uidCounter: counter }).where(eq(sets.id, setId));
        }
        // Inserted in chunks: Postgres allows 65,535 values per statement.
        for (let i = 0; i < nodeRows.length; i += 500) await tx.insert(nodes).values(nodeRows.slice(i, i + 500));
        for (let i = 0; i < revisionRows.length; i += 500) {
          await tx.insert(itemRevisions).values(revisionRows.slice(i, i + 500));
        }
        for (let i = 0; i < linkRows.length; i += 500) await tx.insert(links).values(linkRows.slice(i, i + 500));

        // One audit event per set and one for the relationships, so the activity stream is not flooded.
        const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
        for (const count of counts) {
          const what = [plural(count.items, "item"), ...(count.folders ? [plural(count.folders, "folder")] : [])];
          await audit(tx, userId, "item.import", "set", count.setId, {
            projectId,
            label: `${what.join(" and ")} into ${count.name}`,
          });
        }
        if (linkRows.length > 0) {
          await audit(tx, userId, "link.import", "project", projectId, {
            label: plural(linkRows.length, "relationship"),
          });
        }
        return {
          created: {
            items: revisionRows.length,
            folders: nodeRows.length - revisionRows.length,
            links: linkRows.length,
          },
        };
      });

      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );
}
