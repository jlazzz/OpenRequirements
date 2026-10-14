import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ExportLink, type ExportNode, type ExportSet, toReqif } from "@app/importers";
import { serializeReqif, zip } from "@app/reqif";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { AppContext } from "./app.ts";
import {
  attachments,
  baselineEntries,
  baselineLinks,
  baselines,
  itemRevisions,
  itemTypes,
  links,
  linkTypes,
  nodes,
  sets,
} from "./db/schema.ts";
import { liveLinks } from "./links.ts";
import { fieldsOf } from "./nodes.ts";

const uuid = { type: "string", format: "uuid" } as const;
const schema = (name: string) =>
  ({
    params: { type: "object", required: [name], properties: { [name]: uuid } },
    querystring: { type: "object", properties: { format: { enum: ["reqif", "reqifz"] } } },
  }) as const;

/** ReqIF export of a set as it is now, or of a baseline as it was frozen. Import goes through `import.ts`. */
export function reqifRoutes({ app, db, requireUser, access }: AppContext, dir: string) {
  /** The given sets with their item type and fields, in project order, each with the nodes found for it. */
  async function describe(setIds: string[], nodesOf: Map<string, ExportNode[]>): Promise<ExportSet[]> {
    if (setIds.length === 0) return [];
    const rows = await db
      .select({ id: sets.id, name: sets.name, itemTypeId: sets.itemTypeId, itemType: itemTypes.name })
      .from(sets)
      .innerJoin(itemTypes, eq(itemTypes.id, sets.itemTypeId))
      .where(inArray(sets.id, setIds))
      .orderBy(sets.position);
    return Promise.all(
      rows.map(async (set) => ({
        ...set,
        fields: await fieldsOf(db, set.itemTypeId),
        nodes: nodesOf.get(set.id) ?? [],
      })),
    );
  }

  // shortcut: builds the whole file in memory, stream it when exports with hundreds of megabytes of images are common
  async function send(
    reply: FastifyReply,
    format: string | undefined,
    projectId: string,
    title: string,
    exportSets: ExportSet[],
    exportLinks: ExportLink[],
  ) {
    const types = await db
      .select({ id: linkTypes.id, name: linkTypes.name })
      .from(linkTypes)
      .where(eq(linkTypes.projectId, projectId))
      .orderBy(linkTypes.position);
    // Only this project's images can be embedded, whatever address a description names.
    const stored = await db
      .select({ id: attachments.id, contentType: attachments.contentType })
      .from(attachments)
      .where(eq(attachments.projectId, projectId));
    const imageTypes = new Map(stored.map((a) => [a.id, a.contentType]));
    const { reqif, images } = toReqif(title, exportSets, exportLinks, types, imageTypes);
    const xml = serializeReqif(reqif, new Date());
    const filename = title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "export";
    const disposition = (extension: string) => `attachment; filename="${filename}.${extension}"`;
    if (format !== "reqifz") {
      return reply.type("application/xml").header("content-disposition", disposition("reqif")).send(xml);
    }
    const files = [{ name: `${filename}.reqif`, data: new TextEncoder().encode(xml) as Uint8Array }];
    for (const [name, id] of images) {
      // An image whose file is gone is left out; its reference stays in the text.
      const data = await readFile(join(dir, id)).catch(() => null);
      if (data) files.push({ name, data });
    }
    return reply
      .type("application/zip")
      .header("content-disposition", disposition("reqifz"))
      .send(Buffer.from(await zip(files)));
  }

  app.get("/api/sets/:setId/reqif", { onRequest: requireUser, schema: schema("setId") }, async (req, reply) => {
    const { setId } = req.params as { setId: string };
    const projectId = await access(req, reply, { setId }, "viewer");
    if (!projectId) return reply;
    const live = await db
      .select({ id: nodes.id, parentId: nodes.parentId, kind: nodes.kind, name: nodes.name, uid: nodes.uid })
      .from(nodes)
      .where(and(eq(nodes.setId, setId), isNull(nodes.deletedAt)))
      .orderBy(nodes.position);
    const latest = await db
      .selectDistinctOn([itemRevisions.itemId], {
        itemId: itemRevisions.itemId,
        name: itemRevisions.name,
        description: itemRevisions.description,
        attributes: itemRevisions.attributes,
      })
      .from(itemRevisions)
      .innerJoin(nodes, eq(nodes.id, itemRevisions.itemId))
      .where(eq(nodes.setId, setId))
      .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
    const current = new Map(latest.map((r) => [r.itemId, r]));
    const exportNodes = live.map((n) => ({
      ...n,
      name: current.get(n.id)?.name ?? n.name ?? "",
      description: current.get(n.id)?.description ?? null,
      attributes: current.get(n.id)?.attributes ?? null,
    }));
    const [set] = await describe([setId], new Map([[setId, exportNodes]]));
    if (!set) return reply.code(404).send({ error: "Set not found" });
    return send(
      reply,
      (req.query as { format?: string }).format,
      projectId,
      set.name,
      [set],
      await liveLinks(db, projectId, { setId }),
    );
  });

  app.get(
    "/api/baselines/:baselineId/reqif",
    { onRequest: requireUser, schema: schema("baselineId") },
    async (req, reply) => {
      const { baselineId } = req.params as { baselineId: string };
      const projectId = await access(req, reply, { baselineId }, "viewer");
      if (!projectId) return reply;
      const [baseline] = await db.select({ name: baselines.name }).from(baselines).where(eq(baselines.id, baselineId));
      if (!baseline) return reply.code(404).send({ error: "Baseline not found" });
      const entries = await db
        .select({
          id: nodes.id,
          setId: nodes.setId,
          parentId: baselineEntries.parentId,
          kind: nodes.kind,
          name: sql<string>`coalesce(${itemRevisions.name}, ${baselineEntries.name}, '')`,
          uid: nodes.uid,
          description: itemRevisions.description,
          attributes: itemRevisions.attributes,
        })
        .from(baselineEntries)
        .innerJoin(nodes, eq(nodes.id, baselineEntries.nodeId))
        .leftJoin(itemRevisions, eq(itemRevisions.id, baselineEntries.revisionId))
        .where(eq(baselineEntries.baselineId, baselineId))
        .orderBy(baselineEntries.position);
      const bySet = new Map<string, ExportNode[]>();
      for (const { setId, ...node } of entries) {
        const list = bySet.get(setId) ?? [];
        list.push(node);
        bySet.set(setId, list);
      }
      const frozen = await db
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
      const exportSets = await describe([...bySet.keys()], bySet);
      return send(reply, (req.query as { format?: string }).format, projectId, baseline.name, exportSets, frozen);
    },
  );
}
