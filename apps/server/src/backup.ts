import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import {
  attachments,
  attributeDefinitions,
  auditEvents,
  baselineEntries,
  baselineLinks,
  baselines,
  comments,
  itemRevisions,
  itemTypes,
  linkRevisions,
  links,
  linkTypes,
  nodes,
  projectMembers,
  projects,
  sets,
  users,
  verificationResults,
} from "./db/schema.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, type Backup, backupError, parentsFirst, remapIds } from "./domain/backup.ts";
import { imageType } from "./domain/image.ts";
import { NO_PASSWORD } from "./domain/password.ts";
import { ROLES } from "./domain/roles.ts";
import { OUTCOMES } from "./domain/verification.ts";
import { searchTextOf } from "./nodes.ts";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const id = { type: "string", format: "uuid" } as const;
const idOrNull = { type: ["string", "null"], format: "uuid" } as const;
const when = { type: "string", format: "date-time" } as const;
const whenOrNull = { type: ["string", "null"], format: "date-time" } as const;
const text = (maxLength: number) => ({ type: "string", maxLength }) as const;
const textOrNull = (maxLength: number) => ({ type: ["string", "null"], maxLength }) as const;
const count = { type: "integer", minimum: 0 } as const;
const row = (properties: Record<string, object>) => ({
  type: "object",
  required: Object.keys(properties),
  additionalProperties: false,
  properties,
});
const rows = (properties: Record<string, object>) => ({ type: "array", items: row(properties) });

// The shape of a backup file. domain/backup.ts then checks that the file is consistent.
const backupSchema = {
  ...row({
    format: { const: BACKUP_FORMAT },
    version: { enum: [1, 2, BACKUP_VERSION] },
    exportedAt: when,
    project: row({ id, name: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" }, createdAt: when }),
    users: rows({ id, email: { type: "string", format: "email", maxLength: 254 }, name: text(100) }),
    members: rows({ userId: id, role: { enum: [...ROLES] } }),
    itemTypes: rows({ id, name: text(200) }),
    attributeDefinitions: rows({
      id,
      itemTypeId: id,
      name: text(200),
      type: text(20),
      options: { type: ["array", "null"], items: text(200) },
      position: count,
    }),
    sets: rows({ id, itemTypeId: id, name: text(200), uidPrefix: text(20), uidCounter: count, position: count }),
    nodes: rows({
      id,
      setId: id,
      parentId: idOrNull,
      kind: { enum: ["folder", "item"] },
      name: textOrNull(200),
      uid: textOrNull(40),
      position: count,
      createdAt: when,
      deletedAt: whenOrNull,
    }),
    itemRevisions: rows({
      id,
      itemId: id,
      number: { type: "integer", minimum: 1 },
      name: text(200),
      description: { type: "object" },
      attributes: { type: "object" },
      authorId: id,
      changeReason: textOrNull(500),
      createdAt: when,
    }),
    linkTypes: rows({ id, name: text(200), position: count }),
    links: rows({
      id,
      linkTypeId: id,
      upstreamId: id,
      downstreamId: id,
      upstreamRevision: count,
      downstreamRevision: count,
      createdBy: id,
      createdAt: when,
      deletedAt: whenOrNull,
    }),
    // Not in version 1 files.
    linkRevisions: {
      ...rows({
        id,
        linkId: id,
        number: { type: "integer", minimum: 1 },
        upstreamRevision: count,
        downstreamRevision: count,
        confirmedBy: id,
        createdAt: when,
      }),
      default: [],
    },
    // Not in version 1 or 2 files.
    verificationResults: {
      ...rows({
        id,
        itemId: id,
        revision: { type: "integer", minimum: 1 },
        outcome: { enum: [...OUTCOMES] },
        runAt: when,
        note: text(2000),
        attachmentId: idOrNull,
        source: { enum: ["manual", "junit"] },
        recordedBy: id,
        createdAt: when,
      }),
      default: [],
    },
    comments: rows({
      id,
      itemId: id,
      authorId: id,
      body: text(10_000),
      mentions: { type: "array", items: id },
      createdAt: when,
      deletedAt: whenOrNull,
    }),
    baselines: rows({ id, setId: idOrNull, name: text(200), createdBy: id, createdAt: when }),
    baselineEntries: rows({
      baselineId: id,
      nodeId: id,
      revisionId: idOrNull,
      parentId: idOrNull,
      position: count,
      name: textOrNull(200),
    }),
    baselineLinks: {
      type: "array",
      items: {
        ...row({ baselineId: id, linkId: id, suspect: { type: ["boolean", "null"], default: null } }),
        required: ["baselineId", "linkId"],
      },
    },
    attachments: rows({ id, createdBy: id, createdAt: when, data: { type: "string" } }),
    auditEvents: rows({
      id,
      at: when,
      actorUserId: idOrNull,
      action: text(100),
      entityType: text(100),
      entityId: text(100),
      data: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: { label: text(1000), mentions: { type: "array", items: id } },
      },
    }),
  }),
};
backupSchema.required = backupSchema.required.filter((key) => key !== "linkRevisions" && key !== "verificationResults");

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => date?.toISOString() ?? null;
const date = (value: string) => new Date(value);
const dateOrNull = (value: string | null) => (value === null ? null : new Date(value));
// Postgres allows 65,535 values per statement, so large tables are inserted in parts.
const parts = <T>(list: T[]): T[][] =>
  Array.from({ length: Math.ceil(list.length / 500) }, (_, i) => list.slice(i * 500, i * 500 + 500));

/** Full-project backup as one JSON file, and restore of such a file as a new project. */
export function backupRoutes({ app, db, requireUser, requireAdmin, audit, access }: AppContext, dir: string) {
  // shortcut: the whole backup is built and parsed in memory, switch to a streamed archive when projects carry hundreds of megabytes of images
  app.get(
    "/api/projects/:projectId/backup",
    {
      onRequest: requireUser,
      schema: { params: { type: "object", required: ["projectId"], properties: { projectId: id } } },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "admin"))) return reply;
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const inProject = <T extends { projectId: unknown }>(table: T) => eq(table.projectId as never, projectId);
      const types = await db.select().from(itemTypes).where(inProject(itemTypes));
      const projectSets = await db.select().from(sets).where(inProject(sets));
      const setIds = projectSets.map((s) => s.id);
      const allNodes = setIds.length ? await db.select().from(nodes).where(inArray(nodes.setId, setIds)) : [];
      const nodeIds = db
        .select({ id: nodes.id })
        .from(nodes)
        .innerJoin(sets, eq(sets.id, nodes.setId))
        .where(eq(sets.projectId, projectId));
      const allBaselines = await db.select().from(baselines).where(inProject(baselines));
      const baselineIds = db.select({ id: baselines.id }).from(baselines).where(inProject(baselines));
      const files: Backup["attachments"] = [];
      for (const file of await db.select().from(attachments).where(inProject(attachments))) {
        // A row whose file has gone missing is left out, so one lost image cannot block every backup.
        const bytes = await readFile(join(dir, file.id)).catch(() => null);
        if (bytes) {
          files.push({
            id: file.id,
            createdBy: file.createdBy,
            createdAt: iso(file.createdAt),
            data: bytes.toString("base64"),
          });
        }
      }

      const backup: Backup = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: iso(new Date()),
        project: { id: project.id, name: project.name, createdAt: iso(project.createdAt) },
        users: [],
        members: (await db.select().from(projectMembers).where(inProject(projectMembers))).map((m) => ({
          userId: m.userId,
          role: m.role,
        })),
        itemTypes: types.map(({ id, name }) => ({ id, name })),
        attributeDefinitions: types.length
          ? await db
              .select()
              .from(attributeDefinitions)
              .where(
                inArray(
                  attributeDefinitions.itemTypeId,
                  types.map((t) => t.id),
                ),
              )
          : [],
        sets: projectSets.map(({ projectId: _, ...set }) => set),
        nodes: allNodes.map(({ searchText: _, ...node }) => ({
          ...node,
          createdAt: iso(node.createdAt),
          deletedAt: isoOrNull(node.deletedAt),
        })),
        itemRevisions: (await db.select().from(itemRevisions).where(inArray(itemRevisions.itemId, nodeIds))).map(
          (r) => ({
            ...r,
            createdAt: iso(r.createdAt),
          }),
        ),
        linkTypes: (await db.select().from(linkTypes).where(inProject(linkTypes))).map(({ projectId: _, ...t }) => t),
        links: (await db.select().from(links).where(inProject(links))).map(({ projectId: _, ...link }) => ({
          ...link,
          createdAt: iso(link.createdAt),
          deletedAt: isoOrNull(link.deletedAt),
        })),
        linkRevisions: (
          await db
            .select()
            .from(linkRevisions)
            .where(inArray(linkRevisions.linkId, db.select({ id: links.id }).from(links).where(inProject(links))))
        ).map((r) => ({ ...r, createdAt: iso(r.createdAt) })),
        // Evidence whose file has gone missing is left out with it, so the result itself still restores.
        verificationResults: (
          await db.select().from(verificationResults).where(inArray(verificationResults.itemId, nodeIds))
        ).map((r) => ({
          ...r,
          attachmentId: files.some((file) => file.id === r.attachmentId) ? r.attachmentId : null,
          runAt: iso(r.runAt),
          createdAt: iso(r.createdAt),
        })),
        comments: (await db.select().from(comments).where(inArray(comments.itemId, nodeIds))).map((c) => ({
          ...c,
          createdAt: iso(c.createdAt),
          deletedAt: isoOrNull(c.deletedAt),
        })),
        baselines: allBaselines.map(({ projectId: _, ...b }) => ({ ...b, createdAt: iso(b.createdAt) })),
        baselineEntries: await db
          .select()
          .from(baselineEntries)
          .where(inArray(baselineEntries.baselineId, baselineIds)),
        baselineLinks: await db.select().from(baselineLinks).where(inArray(baselineLinks.baselineId, baselineIds)),
        attachments: files,
        auditEvents: (await db.select().from(auditEvents).where(inProject(auditEvents))).map(
          ({ projectId: _, ...event }) => ({ ...event, at: iso(event.at) }),
        ),
      };
      // Everyone the history names, so a restore elsewhere can keep who wrote what.
      const people = new Set(
        [
          backup.members.map((m) => m.userId),
          backup.itemRevisions.map((r) => r.authorId),
          backup.links.map((l) => l.createdBy),
          backup.linkRevisions.map((r) => r.confirmedBy),
          backup.verificationResults.map((r) => r.recordedBy),
          backup.comments.flatMap((c) => [c.authorId, ...c.mentions]),
          backup.baselines.map((b) => b.createdBy),
          backup.attachments.map((a) => a.createdBy),
          backup.auditEvents.flatMap((e) => (e.actorUserId ? [e.actorUserId] : [])),
        ].flat(),
      );
      backup.users = people.size
        ? await db
            .select({ id: users.id, email: users.email, name: users.name })
            .from(users)
            .where(inArray(users.id, [...people]))
        : [];
      // Mentions of people who have no account any more cannot be restored, so they are dropped.
      const known = new Set(backup.users.map((u) => u.id));
      for (const comment of backup.comments) comment.mentions = comment.mentions.filter((m) => known.has(m));

      await audit(db, req.user?.id ?? null, "project.backup", "project", projectId);
      return reply
        .header("content-disposition", `attachment; filename="backup-${iso(new Date()).slice(0, 10)}.json"`)
        .send(backup);
    },
  );

  // Restores a backup as a new project. It never touches an existing project. Everything gets a new id.
  app.post(
    "/api/projects/restore",
    { onRequest: [requireUser, requireAdmin], bodyLimit: 256 * 1024 * 1024, schema: { body: backupSchema } },
    async (req, reply) => {
      const uploaded = req.body as Backup;
      const problem = backupError(uploaded);
      if (problem) return reply.code(400).send({ error: problem });
      const userId = req.user?.id as string;

      const images: { bytes: Buffer; contentType: string }[] = [];
      for (const file of uploaded.attachments) {
        const bytes = Buffer.from(file.data, "base64");
        const contentType = imageType(bytes);
        if (!contentType || bytes.length > MAX_ATTACHMENT_BYTES) {
          return reply.code(400).send({ error: "The backup holds an attachment that is not an image of at most 5 MB" });
        }
        images.push({ bytes, contentType });
      }

      try {
        const project = await db.transaction(async (tx) => {
          // People are matched by email. Someone with no account here gets one that cannot sign in until they are invited.
          const ids = new Map<string, string>();
          for (const person of uploaded.users) {
            const email = person.email.toLowerCase();
            const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
            const [created] = existing
              ? [existing]
              : await tx
                  .insert(users)
                  .values({ email, name: person.name, passwordHash: NO_PASSWORD })
                  .returning({ id: users.id });
            if (!created) throw new Error("user insert returned no row");
            if (!existing) await audit(tx, userId, "user.create", "user", created.id, { label: email });
            ids.set(person.id.toLowerCase(), created.id);
          }
          for (const [name, list] of Object.entries(uploaded)) {
            if (name === "users" || !Array.isArray(list)) continue;
            for (const entry of list as { id?: string }[]) if (entry.id) ids.set(entry.id.toLowerCase(), randomUUID());
          }
          const projectId = randomUUID();
          ids.set(uploaded.project.id.toLowerCase(), projectId);
          // The image bytes are kept out of the id rewrite: they are large and hold no ids.
          const backup = remapIds(
            { ...uploaded, attachments: uploaded.attachments.map((a) => ({ ...a, data: "" })) },
            ids,
          );

          const [taken] = await tx
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.name, backup.project.name), isNull(projects.archivedAt)));
          const name = taken ? `${backup.project.name} (restored)`.slice(0, 100) : backup.project.name;
          const [created] = await tx
            .insert(projects)
            .values({ id: projectId, name, createdAt: date(backup.project.createdAt) })
            .returning();
          if (!created) throw new Error("project insert returned no row");

          const members = new Map(backup.members.map((m) => [m.userId, m.role]));
          // Whoever restores a project manages it.
          members.set(userId, "admin");
          await tx
            .insert(projectMembers)
            .values([...members].map(([user, role]) => ({ projectId, userId: user, role })));
          for (const part of parts(backup.itemTypes)) {
            await tx.insert(itemTypes).values(part.map((t) => ({ ...t, projectId })));
          }
          for (const part of parts(backup.attributeDefinitions)) await tx.insert(attributeDefinitions).values(part);
          for (const part of parts(backup.sets)) await tx.insert(sets).values(part.map((s) => ({ ...s, projectId })));

          // What search matches is derived from each item's latest version, so it is rebuilt, not trusted from the file.
          const latest = new Map<string, Backup["itemRevisions"][number]>();
          for (const revision of backup.itemRevisions) {
            if ((latest.get(revision.itemId)?.number ?? 0) < revision.number) latest.set(revision.itemId, revision);
          }
          for (const part of parts(parentsFirst(backup.nodes) ?? [])) {
            await tx.insert(nodes).values(
              part.map((node) => {
                const current = latest.get(node.id);
                return {
                  ...node,
                  createdAt: date(node.createdAt),
                  deletedAt: dateOrNull(node.deletedAt),
                  searchText: current
                    ? searchTextOf(node.uid ?? "", current.name, current.description, current.attributes)
                    : "",
                };
              }),
            );
          }
          for (const part of parts(backup.itemRevisions)) {
            await tx.insert(itemRevisions).values(part.map((r) => ({ ...r, createdAt: date(r.createdAt) })));
          }
          for (const part of parts(backup.linkTypes)) {
            await tx.insert(linkTypes).values(part.map((t) => ({ ...t, projectId })));
          }
          for (const part of parts(backup.links)) {
            await tx.insert(links).values(
              part.map((link) => ({
                ...link,
                projectId,
                createdAt: date(link.createdAt),
                deletedAt: dateOrNull(link.deletedAt),
              })),
            );
          }
          for (const part of parts(backup.linkRevisions)) {
            await tx.insert(linkRevisions).values(part.map((r) => ({ ...r, createdAt: date(r.createdAt) })));
          }
          for (const part of parts(backup.comments)) {
            await tx
              .insert(comments)
              .values(part.map((c) => ({ ...c, createdAt: date(c.createdAt), deletedAt: dateOrNull(c.deletedAt) })));
          }
          for (const part of parts(backup.baselines)) {
            await tx.insert(baselines).values(part.map((b) => ({ ...b, projectId, createdAt: date(b.createdAt) })));
          }
          for (const part of parts(backup.baselineEntries)) await tx.insert(baselineEntries).values(part);
          for (const part of parts(backup.baselineLinks)) await tx.insert(baselineLinks).values(part);
          for (const part of parts(backup.auditEvents)) {
            await tx.insert(auditEvents).values(part.map((event) => ({ ...event, projectId, at: date(event.at) })));
          }

          await mkdir(dir, { recursive: true });
          for (const [index, file] of backup.attachments.entries()) {
            const image = images[index];
            if (!image) continue;
            await tx.insert(attachments).values({
              id: file.id,
              projectId,
              contentType: image.contentType,
              size: image.bytes.length,
              createdBy: file.createdBy,
              createdAt: date(file.createdAt),
            });
            await writeFile(join(dir, file.id), image.bytes);
          }
          // After the attachments, because a result may point at its evidence.
          for (const part of parts(backup.verificationResults)) {
            await tx
              .insert(verificationResults)
              .values(part.map((r) => ({ ...r, runAt: date(r.runAt), createdAt: date(r.createdAt) })));
          }
          await audit(tx, userId, "project.restore", "project", projectId);
          return created;
        });
        return reply.code(201).send({ project });
      } catch (error) {
        // Class 23 is a broken constraint: two items with one UID, two versions with one number, and the like.
        const cause = (error as { cause?: { code?: string; detail?: string } }).cause;
        if (!cause?.code?.startsWith("23")) throw error;
        return reply.code(400).send({ error: `The backup is not consistent. ${cause.detail ?? ""}`.trim() });
      }
    },
  );
}
