import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ExportLink, type ExportNode, type ExportSet, imagesOf, toCsv, toDocx, toReqif } from "@app/importers";
import { serializeReqif, zip } from "@app/reqif";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { AppContext } from "./app.ts";
import {
  attachments,
  baselineEntries,
  baselineLinks,
  baselines,
  baselineVerification,
  itemRevisions,
  itemTypes,
  links,
  linkTypes,
  nodes,
  projects,
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
type Content = { projectId: string; title: string; sets: ExportSet[]; links: ExportLink[]; baseline?: Date };

/**
 * Export of a set as it is now, or of a baseline as it was frozen: as ReqIF, or as a Word document.
 * Import goes through `import.ts`.
 */
export function exportRoutes({ app, db, requireUser, access }: AppContext, dir: string) {
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

  /** Only this project's images can be embedded, whatever address a description names. */
  const storedImages = async (projectId: string) =>
    new Map(
      (
        await db
          .select({ id: attachments.id, contentType: attachments.contentType })
          .from(attachments)
          .where(eq(attachments.projectId, projectId))
      ).map((a) => [a.id, a.contentType]),
    );
  const fileName = (title: string, extension: string) =>
    `${title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "export"}.${extension}`;
  const disposition = (title: string, extension: string) => `attachment; filename="${fileName(title, extension)}"`;

  // shortcut: builds the whole file in memory, stream it when exports with hundreds of megabytes of images are common
  async function sendReqif(reply: FastifyReply, format: string | undefined, content: Content) {
    const { projectId, title } = content;
    const types = await db
      .select({ id: linkTypes.id, name: linkTypes.name })
      .from(linkTypes)
      .where(eq(linkTypes.projectId, projectId))
      .orderBy(linkTypes.position);
    const { reqif, images } = toReqif(title, content.sets, content.links, types, await storedImages(projectId));
    const xml = serializeReqif(reqif, new Date());
    if (format !== "reqifz") {
      return reply.type("application/xml").header("content-disposition", disposition(title, "reqif")).send(xml);
    }
    const files = [{ name: fileName(title, "reqif"), data: new TextEncoder().encode(xml) as Uint8Array }];
    for (const [name, id] of images) {
      // An image whose file is gone is left out; its reference stays in the text.
      const data = await readFile(join(dir, id)).catch(() => null);
      if (data) files.push({ name, data });
    }
    return reply
      .type("application/zip")
      .header("content-disposition", disposition(title, "reqifz"))
      .send(Buffer.from(await zip(files)));
  }

  async function sendDocx(reply: FastifyReply, content: Content) {
    const { projectId, title } = content;
    const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));
    const day = (date: Date) => date.toISOString().slice(0, 10);
    const known = await storedImages(projectId);
    const images = new Map<string, { data: Uint8Array; type: string }>();
    for (const id of imagesOf(content.sets)) {
      const type = known.get(id);
      const data = type && (await readFile(join(dir, id)).catch(() => null));
      if (type && data) images.set(id, { data, type });
    }
    const name = project?.name ?? "";
    const cover = content.baseline
      ? {
          title,
          lines: [name, `Baseline of ${day(content.baseline)}`, `Exported ${day(new Date())}`],
          header: `${name} · Baseline ${title}`,
        }
      : { title, lines: [name, `Current version, exported ${day(new Date())}`], header: `${name} · ${title}` };
    const bytes = await toDocx(cover, content.sets, images);
    return reply
      .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .header("content-disposition", disposition(title, "docx"))
      .send(Buffer.from(bytes));
  }

  async function ofSet(setId: string, projectId: string): Promise<Content | null> {
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
    if (!set) return null;
    return { projectId, title: set.name, sets: [set], links: await liveLinks(db, projectId, { setId }) };
  }

  async function ofBaseline(baselineId: string, projectId: string): Promise<Content | null> {
    const [baseline] = await db
      .select({ name: baselines.name, createdAt: baselines.createdAt })
      .from(baselines)
      .where(eq(baselines.id, baselineId));
    if (!baseline) return null;
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
    return {
      projectId,
      title: baseline.name,
      sets: await describe([...bySet.keys()], bySet),
      links: frozen,
      baseline: baseline.createdAt,
    };
  }

  /** One row per frozen item: its verification status then, and the relationships that were suspect then. */
  app.get(
    "/api/baselines/:baselineId/csv",
    { onRequest: requireUser, schema: { params: schema("baselineId").params } },
    async (req, reply) => {
      const { baselineId } = req.params as { baselineId: string };
      const projectId = await access(req, reply, { baselineId }, "viewer");
      if (!projectId) return reply;
      const content = await ofBaseline(baselineId, projectId);
      if (!content) return reply.code(404).send({ error: "Baseline not found" });
      const status = new Map(
        (await db.select().from(baselineVerification).where(eq(baselineVerification.baselineId, baselineId))).map(
          (v) => [v.itemId, v],
        ),
      );
      const typeNames = new Map(
        (
          await db
            .select({ id: linkTypes.id, name: linkTypes.name })
            .from(linkTypes)
            .where(eq(linkTypes.projectId, projectId))
        ).map((t) => [t.id, t.name]),
      );
      const uids = new Map(content.sets.flatMap((s) => s.nodes.map((n) => [n.id, n.uid ?? ""] as const)));
      const suspect = new Map<string, string[]>();
      const frozenSuspect = await db
        .select({ typeId: links.linkTypeId, upstreamId: links.upstreamId, downstreamId: links.downstreamId })
        .from(baselineLinks)
        .innerJoin(links, eq(links.id, baselineLinks.linkId))
        .where(and(eq(baselineLinks.baselineId, baselineId), eq(baselineLinks.suspect, true)));
      for (const l of frozenSuspect) {
        const type = typeNames.get(l.typeId) ?? "";
        for (const [from, to] of [
          [l.upstreamId, l.downstreamId],
          [l.downstreamId, l.upstreamId],
        ] as const) {
          suspect.set(from, [...(suspect.get(from) ?? []), `${uids.get(to) ?? ""} (${type})`]);
        }
      }
      const label = { not_covered: "Not covered", not_run: "Not run", passing: "Passing", failing: "Failing" };
      const rows: string[][] = [["Set", "ID", "Name", "Verification", "Out of date", "Suspect relationships"]];
      for (const set of content.sets) {
        for (const n of set.nodes) {
          if (n.kind !== "item") continue;
          const v = status.get(n.id);
          rows.push([
            set.name,
            n.uid ?? "",
            n.name,
            v ? label[v.status] : "",
            v?.outOfDate ? "Yes" : "",
            (suspect.get(n.id) ?? []).join("; "),
          ]);
        }
      }
      return reply
        .type("text/csv; charset=utf-8")
        .header("content-disposition", disposition(content.title, "csv"))
        .send(toCsv(rows));
    },
  );

  for (const kind of ["reqif", "docx"] as const) {
    app.get(`/api/sets/:setId/${kind}`, { onRequest: requireUser, schema: schema("setId") }, async (req, reply) => {
      const { setId } = req.params as { setId: string };
      const projectId = await access(req, reply, { setId }, "viewer");
      if (!projectId) return reply;
      const content = await ofSet(setId, projectId);
      if (!content) return reply.code(404).send({ error: "Set not found" });
      if (kind === "docx") return sendDocx(reply, content);
      return sendReqif(reply, (req.query as { format?: string }).format, content);
    });

    app.get(
      `/api/baselines/:baselineId/${kind}`,
      { onRequest: requireUser, schema: schema("baselineId") },
      async (req, reply) => {
        const { baselineId } = req.params as { baselineId: string };
        const projectId = await access(req, reply, { baselineId }, "viewer");
        if (!projectId) return reply;
        const content = await ofBaseline(baselineId, projectId);
        if (!content) return reply.code(404).send({ error: "Baseline not found" });
        if (kind === "docx") return sendDocx(reply, content);
        return sendReqif(reply, (req.query as { format?: string }).format, content);
      },
    );
  }
}
