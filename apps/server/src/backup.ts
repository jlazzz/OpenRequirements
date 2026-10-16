import { randomUUID } from "node:crypto";
import { access as fileExists, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import {
  attachments,
  attributeDefinitions,
  auditEvents,
  baselineEntries,
  baselineLinks,
  baselines,
  baselineVerification,
  ciRuns,
  comments,
  externalReferences,
  itemRevisions,
  itemTypes,
  linkRevisions,
  links,
  linkTypes,
  nodes,
  projectMembers,
  projects,
  resultAttachments,
  reviewMarks,
  reviewParticipants,
  reviews,
  sets,
  signatures,
  stepResults,
  testCycles,
  testPlanCases,
  testPlans,
  testRuns,
  users,
  verificationResults,
} from "./db/schema.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, type Backup, backupError, parentsFirst, remapIds } from "./domain/backup.ts";
import { fileType, safeFileName } from "./domain/filetype.ts";
import { NO_PASSWORD } from "./domain/password.ts";
import { MARKS } from "./domain/review.ts";
import { ROLES } from "./domain/roles.ts";
import { OUTCOMES } from "./domain/verification.ts";
import { searchTextOf } from "./nodes.ts";
import { obj, res, thing } from "./schemas.ts";

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
    version: { enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, BACKUP_VERSION] },
    exportedAt: when,
    project: {
      ...row({ id, name: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" }, createdAt: when }),
      // Added in version 11.
      required: ["id", "name", "createdAt"],
      properties: {
        id,
        name: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" },
        createdAt: when,
        mainBranch: text(200),
      },
    },
    users: rows({ id, email: { type: "string", format: "email", maxLength: 254 }, name: text(100) }),
    members: rows({ userId: id, role: { enum: [...ROLES] } }),
    itemTypes: {
      type: "array",
      // `role` is not in files older than version 5: their test case types are found by name, as the tool did then.
      // `archivedAt` is not in files older than version 8, nor in any of the other collections that have it.
      items: {
        ...row({ id, name: text(200), role: { enum: ["test", null] }, archivedAt: { ...whenOrNull, default: null } }),
        required: ["id", "name"],
      },
    },
    attributeDefinitions: {
      type: "array",
      items: {
        ...row({
          id,
          itemTypeId: id,
          name: text(200),
          type: text(20),
          options: { type: ["array", "null"], items: text(200) },
          archivedOptions: { type: "array", items: text(200), default: [] },
          position: count,
          archivedAt: { ...whenOrNull, default: null },
        }),
        required: ["id", "itemTypeId", "name", "type", "options", "position"],
      },
    },
    sets: {
      type: "array",
      items: {
        ...row({
          id,
          itemTypeId: id,
          name: text(200),
          uidPrefix: text(20),
          uidCounter: count,
          position: count,
          archivedAt: { ...whenOrNull, default: null },
        }),
        required: ["id", "itemTypeId", "name", "uidPrefix", "uidCounter", "position"],
      },
    },
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
    itemRevisions: {
      type: "array",
      items: {
        ...row({
          id,
          itemId: id,
          number: { type: "integer", minimum: 1 },
          name: text(200),
          description: { type: "object" },
          attributes: { type: "object" },
          authorId: id,
          changeReason: textOrNull(500),
          // Not in files older than version 4.
          statusOnly: { type: "boolean", default: false },
          createdAt: when,
        }),
        required: [
          "id",
          "itemId",
          "number",
          "name",
          "description",
          "attributes",
          "authorId",
          "changeReason",
          "createdAt",
        ],
      },
    },
    linkTypes: {
      type: "array",
      items: {
        // `role` is not in files older than version 8: there, the type named "Verified by" counted for verification.
        ...row({
          id,
          name: text(200),
          role: { enum: ["verifies", null] },
          position: count,
          archivedAt: { ...whenOrNull, default: null },
        }),
        required: ["id", "name", "position"],
      },
    },
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
      type: "array",
      items: {
        ...row({
          id,
          itemId: id,
          revision: { type: "integer", minimum: 1 },
          outcome: { enum: [...OUTCOMES] },
          runAt: when,
          note: text(2000),
          attachmentId: idOrNull,
          source: { enum: ["manual", "junit", "run"] },
          recordedBy: id,
          // The next two are not in files older than version 5.
          runId: { ...idOrNull, default: null },
          defectUrl: { ...textOrNull(2000), default: null },
          // Not in files older than version 9.
          ciRunId: { ...idOrNull, default: null },
          createdAt: when,
        }),
        required: [
          "id",
          "itemId",
          "revision",
          "outcome",
          "runAt",
          "note",
          "attachmentId",
          "source",
          "recordedBy",
          "createdAt",
        ],
      },
      default: [],
    },
    // Not in files older than version 9.
    ciRuns: {
      ...rows({
        id,
        pipeline: text(200),
        branch: text(200),
        commit: text(100),
        buildUrl: text(2000),
        passed: { type: "integer", minimum: 0 },
        failed: { type: "integer", minimum: 0 },
        skipped: { type: "integer", minimum: 0 },
        unmatched: { type: "integer", minimum: 0 },
        unmatchedNames: { type: "array", maxItems: 200, items: { type: "string", maxLength: 2000 } },
        createdBy: id,
        createdAt: when,
      }),
      default: [],
    },
    // Not in files older than version 6.
    resultAttachments: {
      ...rows({
        id,
        resultId: idOrNull,
        runId: idOrNull,
        step: { type: ["integer", "null"], minimum: 1 },
        attachmentId: id,
        createdBy: id,
        createdAt: when,
      }),
      default: [],
    },
    baselineVerification: {
      ...rows({
        baselineId: id,
        itemId: id,
        status: { enum: ["not_covered", "not_run", "passing", "failing"] },
        outOfDate: { type: "boolean" },
      }),
      default: [],
    },
    // The next five are not in files older than version 5.
    testPlans: { ...rows({ id, name: text(200), createdBy: id, createdAt: when, deletedAt: whenOrNull }), default: [] },
    testPlanCases: {
      ...rows({ id, planId: id, itemId: id, groupName: text(100), position: count, removedAt: whenOrNull }),
      default: [],
    },
    testCycles: {
      type: "array",
      items: {
        ...row({
          id,
          planId: id,
          name: text(200),
          environment: text(200),
          // Not in files older than version 6.
          baselineId: { ...idOrNull, default: null },
          createdBy: id,
          createdAt: when,
          closedBy: idOrNull,
          closedAt: whenOrNull,
        }),
        required: ["id", "planId", "name", "environment", "createdBy", "createdAt", "closedBy", "closedAt"],
      },
      default: [],
    },
    testRuns: {
      ...rows({
        id,
        cycleId: id,
        itemId: id,
        revisionId: id,
        groupName: text(100),
        position: count,
        assigneeId: idOrNull,
      }),
      default: [],
    },
    stepResults: {
      ...rows({
        id,
        runId: id,
        step: { type: "integer", minimum: 1 },
        outcome: { enum: [...OUTCOMES] },
        actual: text(100_000),
        recordedBy: id,
        createdAt: when,
      }),
      default: [],
    },
    // Not in files older than version 7.
    externalReferences: {
      ...rows({
        id,
        itemId: id,
        url: text(2000),
        title: text(500),
        kind: text(20),
        source: { type: ["string", "null"], maxLength: 500 },
        createdBy: id,
        createdAt: when,
        deletedAt: whenOrNull,
      }),
      default: [],
    },
    comments: {
      type: "array",
      items: {
        ...row({
          id,
          itemId: id,
          authorId: id,
          body: text(10_000),
          mentions: { type: "array", items: id },
          // Not in files older than version 4.
          reviewId: { ...idOrNull, default: null },
          createdAt: when,
          deletedAt: whenOrNull,
        }),
        required: ["id", "itemId", "authorId", "body", "mentions", "createdAt", "deletedAt"],
      },
    },
    // The next four are not in files older than version 4.
    reviews: {
      ...rows({
        id,
        baselineId: id,
        name: text(200),
        state: { enum: ["open", "closed", "approved", "rejected"] },
        createdBy: id,
        createdAt: when,
        closedBy: idOrNull,
        closedAt: whenOrNull,
        statusSet: { type: "boolean" },
      }),
      default: [],
    },
    reviewParticipants: {
      type: "array",
      items: {
        type: "object",
        // The last five are not in files older than version 10.
        required: ["reviewId", "userId", "role"],
        additionalProperties: false,
        properties: {
          id,
          reviewId: id,
          userId: id,
          role: { enum: ["reviewer", "approver"] },
          addedAt: when,
          addedBy: idOrNull,
          removedAt: whenOrNull,
          removedBy: idOrNull,
        },
      },
      default: [],
    },
    reviewMarks: {
      ...rows({ id, reviewId: id, itemId: id, userId: id, mark: { enum: [...MARKS] }, createdAt: when }),
      default: [],
    },
    signatures: {
      ...rows({
        id,
        reviewId: id,
        userId: id,
        meaning: { enum: ["approval", "rejection"] },
        signerName: text(100),
        signerEmail: text(254),
        digest: text(64),
        signedAt: when,
      }),
      default: [],
    },
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
    attachments: {
      type: "array",
      items: {
        // `name` is not in files older than version 6.
        ...row({
          id,
          name: { ...textOrNull(200), default: null },
          createdBy: id,
          createdAt: when,
          data: { type: "string" },
        }),
        required: ["id", "createdBy", "createdAt", "data"],
      },
    },
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
const ADDED_LATER = [
  "linkRevisions",
  "verificationResults",
  "ciRuns",
  "resultAttachments",
  "baselineVerification",
  "reviews",
  "reviewParticipants",
  "reviewMarks",
  "signatures",
  "testPlans",
  "testPlanCases",
  "testCycles",
  "testRuns",
  "stepResults",
  "externalReferences",
];
backupSchema.required = backupSchema.required.filter((key) => !ADDED_LATER.includes(key));

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => date?.toISOString() ?? null;
const date = (value: string) => new Date(value);
const dateOrNull = (value: string | null) => (value === null ? null : new Date(value));
// Postgres allows 65,535 values per statement, so large tables are inserted in parts.
const parts = <T>(list: T[]): T[][] =>
  Array.from({ length: Math.ceil(list.length / 500) }, (_, i) => list.slice(i * 500, i * 500 + 500));

/** Full-project backup as one JSON file, and restore of such a file as a new project. */
export function backupRoutes(
  { app, db, requireUser, requireAdmin, audit, access }: AppContext,
  dir: string,
  maxAttachmentBytes: number,
) {
  // The download streams the files one at a time.
  // shortcut: restore still parses the whole file in memory (256 MB at most), switch to a streamed archive when projects outgrow that
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
      const reviewIds = db.select({ id: reviews.id }).from(reviews).where(inProject(reviews));
      const planIds = db.select({ id: testPlans.id }).from(testPlans).where(inProject(testPlans));
      const cycleIds = db.select({ id: testCycles.id }).from(testCycles).where(inArray(testCycles.planId, planIds));
      const runIds = db.select({ id: testRuns.id }).from(testRuns).where(inArray(testRuns.cycleId, cycleIds));
      const files: (typeof attachments.$inferSelect)[] = [];
      for (const file of await db.select().from(attachments).where(inProject(attachments))) {
        // A row whose file has gone missing is left out, so one lost image cannot block every backup.
        if (
          await fileExists(join(dir, file.id)).then(
            () => true,
            () => false,
          )
        ) {
          files.push(file);
        }
      }
      const stored = new Set(files.map((file) => file.id));

      const backup: Omit<Backup, "attachments"> = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: iso(new Date()),
        project: {
          id: project.id,
          name: project.name,
          createdAt: iso(project.createdAt),
          mainBranch: project.mainBranch,
        },
        users: [],
        members: (await db.select().from(projectMembers).where(inProject(projectMembers))).map((m) => ({
          userId: m.userId,
          role: m.role,
        })),
        itemTypes: types.map(({ id, name, role, archivedAt }) => ({
          id,
          name,
          role,
          archivedAt: isoOrNull(archivedAt),
        })),
        attributeDefinitions: types.length
          ? (
              await db
                .select()
                .from(attributeDefinitions)
                .where(
                  inArray(
                    attributeDefinitions.itemTypeId,
                    types.map((t) => t.id),
                  ),
                )
            ).map((field) => ({ ...field, archivedAt: isoOrNull(field.archivedAt) }))
          : [],
        sets: projectSets.map(({ projectId: _, ...set }) => ({ ...set, archivedAt: isoOrNull(set.archivedAt) })),
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
        linkTypes: (await db.select().from(linkTypes).where(inProject(linkTypes))).map(({ projectId: _, ...t }) => ({
          ...t,
          archivedAt: isoOrNull(t.archivedAt),
        })),
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
        verificationResults: (
          await db.select().from(verificationResults).where(inArray(verificationResults.itemId, nodeIds))
        ).map((r) => ({ ...r, attachmentId: null, runAt: iso(r.runAt), createdAt: iso(r.createdAt) })),
        ciRuns: (await db.select().from(ciRuns).where(inProject(ciRuns))).map(({ projectId: _, ...run }) => ({
          ...run,
          createdAt: iso(run.createdAt),
        })),
        // Evidence whose file has gone missing is left out with it, so the result itself still restores.
        resultAttachments: (
          await db
            .select({ evidence: resultAttachments })
            .from(resultAttachments)
            .innerJoin(attachments, eq(attachments.id, resultAttachments.attachmentId))
            .where(inProject(attachments))
        )
          .filter(({ evidence }) => stored.has(evidence.attachmentId))
          .map(({ evidence }) => ({ ...evidence, createdAt: iso(evidence.createdAt) })),
        testPlans: (await db.select().from(testPlans).where(inProject(testPlans))).map(({ projectId: _, ...plan }) => ({
          ...plan,
          createdAt: iso(plan.createdAt),
          deletedAt: isoOrNull(plan.deletedAt),
        })),
        testPlanCases: (await db.select().from(testPlanCases).where(inArray(testPlanCases.planId, planIds))).map(
          (c) => ({ ...c, removedAt: isoOrNull(c.removedAt) }),
        ),
        testCycles: (await db.select().from(testCycles).where(inArray(testCycles.planId, planIds))).map((c) => ({
          ...c,
          createdAt: iso(c.createdAt),
          closedAt: isoOrNull(c.closedAt),
        })),
        testRuns: await db.select().from(testRuns).where(inArray(testRuns.cycleId, cycleIds)),
        stepResults: (await db.select().from(stepResults).where(inArray(stepResults.runId, runIds))).map((s) => ({
          ...s,
          createdAt: iso(s.createdAt),
        })),
        // The state read from another tool is left out: it is read again after a restore.
        externalReferences: (
          await db.select().from(externalReferences).where(inArray(externalReferences.itemId, nodeIds))
        ).map(({ state: _, checkedAt: __, ...r }) => ({
          ...r,
          createdAt: iso(r.createdAt),
          deletedAt: isoOrNull(r.deletedAt),
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
        baselineVerification: await db
          .select()
          .from(baselineVerification)
          .where(inArray(baselineVerification.baselineId, baselineIds)),
        reviews: (await db.select().from(reviews).where(inProject(reviews))).map(({ projectId: _, ...r }) => ({
          ...r,
          createdAt: iso(r.createdAt),
          closedAt: isoOrNull(r.closedAt),
        })),
        reviewParticipants: (
          await db.select().from(reviewParticipants).where(inArray(reviewParticipants.reviewId, reviewIds))
        ).map((p) => ({ ...p, addedAt: iso(p.addedAt), removedAt: isoOrNull(p.removedAt) })),
        reviewMarks: (await db.select().from(reviewMarks).where(inArray(reviewMarks.reviewId, reviewIds))).map((m) => ({
          ...m,
          createdAt: iso(m.createdAt),
        })),
        signatures: (await db.select().from(signatures).where(inArray(signatures.reviewId, reviewIds))).map((s) => ({
          ...s,
          signedAt: iso(s.signedAt),
        })),
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
          backup.ciRuns.map((r) => r.createdBy),
          backup.resultAttachments.map((a) => a.createdBy),
          backup.testPlans.map((p) => p.createdBy),
          backup.testCycles.flatMap((c) => (c.closedBy ? [c.createdBy, c.closedBy] : [c.createdBy])),
          backup.testRuns.flatMap((r) => (r.assigneeId ? [r.assigneeId] : [])),
          backup.stepResults.map((s) => s.recordedBy),
          backup.comments.flatMap((c) => [c.authorId, ...c.mentions]),
          backup.externalReferences.map((r) => r.createdBy),
          backup.baselines.map((b) => b.createdBy),
          backup.reviews.flatMap((r) => (r.closedBy ? [r.createdBy, r.closedBy] : [r.createdBy])),
          backup.reviewParticipants.flatMap((p) =>
            [p.userId, p.addedBy, p.removedBy].filter((id): id is string => typeof id === "string"),
          ),
          files.map((file) => file.createdBy),
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
      // The files are read and sent one at a time, so a backup never holds more than one of them in memory.
      const head = JSON.stringify(backup);
      async function* body() {
        yield `${head.slice(0, -1)},"attachments":[`;
        for (const [index, file] of files.entries()) {
          const entry: Backup["attachments"][number] = {
            id: file.id,
            name: file.name,
            createdBy: file.createdBy,
            createdAt: iso(file.createdAt),
            data: (await readFile(join(dir, file.id))).toString("base64"),
          };
          yield `${index ? "," : ""}${JSON.stringify(entry)}`;
        }
        yield "]}";
      }
      return reply
        .type("application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="backup-${iso(new Date()).slice(0, 10)}.json"`)
        .send(Readable.from(body()));
    },
  );

  // Restores a backup as a new project. It never touches an existing project. Everything gets a new id.
  app.post(
    "/api/projects/restore",
    {
      onRequest: [requireUser, requireAdmin],
      bodyLimit: 256 * 1024 * 1024,
      schema: { response: res(obj({ project: thing }), 201), body: backupSchema },
    },
    async (req, reply) => {
      const uploaded = req.body as Backup;
      const problem = backupError(uploaded);
      if (problem) return reply.code(400).send({ error: problem });
      const userId = req.user?.id as string;

      // A file's type is decided from its bytes again, exactly as when it was first uploaded.
      const images: { bytes: Buffer; contentType: string }[] = [];
      for (const file of uploaded.attachments) {
        const bytes = Buffer.from(file.data, "base64");
        const contentType = fileType(bytes, file.name ?? "");
        if (!contentType || bytes.length > maxAttachmentBytes) {
          return reply.code(400).send({
            error: `The backup holds a file that is not an allowed type, or is larger than ${maxAttachmentBytes / 1024 / 1024} MB`,
          });
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
            .values({
              id: projectId,
              name,
              mainBranch: backup.project.mainBranch ?? "",
              createdAt: date(backup.project.createdAt),
            })
            .returning();
          if (!created) throw new Error("project insert returned no row");

          const members = new Map(backup.members.map((m) => [m.userId, m.role]));
          // Whoever restores a project manages it.
          members.set(userId, "admin");
          await tx
            .insert(projectMembers)
            .values([...members].map(([user, role]) => ({ projectId, userId: user, role })));
          // Files older than version 5 have no role: there, a type whose name contains "test" held the test cases.
          const role = (type: { name: string; role?: "test" | null }) =>
            type.role === undefined ? (/test/i.test(type.name) ? ("test" as const) : null) : type.role;
          for (const part of parts(backup.itemTypes)) {
            await tx
              .insert(itemTypes)
              .values(part.map((t) => ({ ...t, projectId, role: role(t), archivedAt: dateOrNull(t.archivedAt) })));
          }
          for (const part of parts(backup.attributeDefinitions)) {
            await tx
              .insert(attributeDefinitions)
              .values(part.map((field) => ({ ...field, archivedAt: dateOrNull(field.archivedAt) })));
          }
          for (const part of parts(backup.sets)) {
            await tx.insert(sets).values(part.map((s) => ({ ...s, projectId, archivedAt: dateOrNull(s.archivedAt) })));
          }

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
            // Files older than version 8 have no role: there, the type named "Verified by" counted for verification.
            const role = (t: { name: string; role?: "verifies" | null }) =>
              t.role === undefined ? (/^verified by$/i.test(t.name.trim()) ? ("verifies" as const) : null) : t.role;
            await tx
              .insert(linkTypes)
              .values(part.map((t) => ({ ...t, projectId, role: role(t), archivedAt: dateOrNull(t.archivedAt) })));
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
          for (const part of parts(backup.baselines)) {
            await tx.insert(baselines).values(part.map((b) => ({ ...b, projectId, createdAt: date(b.createdAt) })));
          }
          for (const part of parts(backup.baselineEntries)) await tx.insert(baselineEntries).values(part);
          for (const part of parts(backup.baselineLinks)) await tx.insert(baselineLinks).values(part);
          for (const part of parts(backup.baselineVerification)) await tx.insert(baselineVerification).values(part);
          for (const part of parts(backup.reviews)) {
            await tx
              .insert(reviews)
              .values(
                part.map((r) => ({ ...r, projectId, createdAt: date(r.createdAt), closedAt: dateOrNull(r.closedAt) })),
              );
          }
          for (const part of parts(backup.reviewParticipants)) {
            await tx.insert(reviewParticipants).values(
              part.map((p) => ({
                ...p,
                addedAt: p.addedAt ? date(p.addedAt) : undefined,
                removedAt: dateOrNull(p.removedAt ?? null),
              })),
            );
          }
          for (const part of parts(backup.reviewMarks)) {
            await tx.insert(reviewMarks).values(part.map((m) => ({ ...m, createdAt: date(m.createdAt) })));
          }
          for (const part of parts(backup.signatures)) {
            await tx.insert(signatures).values(part.map((s) => ({ ...s, signedAt: date(s.signedAt) })));
          }
          // After the reviews, because a comment may belong to one.
          for (const part of parts(backup.comments)) {
            await tx
              .insert(comments)
              .values(part.map((c) => ({ ...c, createdAt: date(c.createdAt), deletedAt: dateOrNull(c.deletedAt) })));
          }
          for (const part of parts(backup.externalReferences)) {
            await tx
              .insert(externalReferences)
              .values(part.map((r) => ({ ...r, createdAt: date(r.createdAt), deletedAt: dateOrNull(r.deletedAt) })));
          }
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
              name: file.name ? safeFileName(file.name) : null,
              size: image.bytes.length,
              createdBy: file.createdBy,
              createdAt: date(file.createdAt),
            });
            await writeFile(join(dir, file.id), image.bytes);
          }
          for (const part of parts(backup.testPlans)) {
            await tx.insert(testPlans).values(
              part.map((plan) => ({
                ...plan,
                projectId,
                createdAt: date(plan.createdAt),
                deletedAt: dateOrNull(plan.deletedAt),
              })),
            );
          }
          for (const part of parts(backup.testPlanCases)) {
            await tx.insert(testPlanCases).values(part.map((c) => ({ ...c, removedAt: dateOrNull(c.removedAt) })));
          }
          for (const part of parts(backup.testCycles)) {
            await tx
              .insert(testCycles)
              .values(part.map((c) => ({ ...c, createdAt: date(c.createdAt), closedAt: dateOrNull(c.closedAt) })));
          }
          for (const part of parts(backup.testRuns)) await tx.insert(testRuns).values(part);
          for (const part of parts(backup.stepResults)) {
            await tx.insert(stepResults).values(part.map((s) => ({ ...s, createdAt: date(s.createdAt) })));
          }
          for (const part of parts(backup.ciRuns)) {
            await tx.insert(ciRuns).values(part.map((r) => ({ ...r, projectId, createdAt: date(r.createdAt) })));
          }
          // After the test runs, because a result may point at its run.
          for (const part of parts(backup.verificationResults)) {
            await tx
              .insert(verificationResults)
              .values(
                part.map((r) => ({ ...r, attachmentId: null, runAt: date(r.runAt), createdAt: date(r.createdAt) })),
              );
          }
          // After the attachments and the results. In a file older than version 6 a result names its one evidence image itself.
          const evidence = [
            ...backup.resultAttachments.map((file) => ({ ...file, createdAt: date(file.createdAt) })),
            ...backup.verificationResults.flatMap((r) =>
              r.attachmentId
                ? [
                    {
                      resultId: r.id,
                      attachmentId: r.attachmentId,
                      createdBy: r.recordedBy,
                      createdAt: date(r.createdAt),
                    },
                  ]
                : [],
            ),
          ];
          for (const part of parts(evidence)) await tx.insert(resultAttachments).values(part);
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
