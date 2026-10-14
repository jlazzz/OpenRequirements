import { matchJunit, parseJunit } from "@app/importers";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import type { Db } from "./db/client.ts";
import {
  attachments,
  itemRevisions,
  itemTypes,
  linkTypes,
  nodes,
  sets,
  users,
  verificationResults,
} from "./db/schema.ts";
import { isOutOfDate, OUTCOMES, verificationStatus } from "./domain/verification.ts";
import { liveLinks } from "./links.ts";

const uuid = { type: "string", format: "uuid" } as const;
const param = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;
const MAX_REPORT_BYTES = 20 * 1024 * 1024;
const MAX_NOTE = 2000;

/** Item types have no "is a test" flag. As in the Trace view, a type whose name contains "test" holds test cases. */
const isTestType = (name: string) => /test/i.test(name);
/** The relationship type that says a test verifies a requirement. Matched by name, because types come from the template. */
const isVerifiedBy = (name: string) => /^verified by$/i.test(name.trim());

/** The live items of a project with their current version, when it was saved, and whether they are test cases. */
async function currentItems(db: Db, projectId: string) {
  const rows = await db
    .selectDistinctOn([itemRevisions.itemId], {
      id: nodes.id,
      uid: nodes.uid,
      itemType: itemTypes.name,
      revision: itemRevisions.number,
      revisedAt: itemRevisions.createdAt,
    })
    .from(itemRevisions)
    .innerJoin(nodes, eq(nodes.id, itemRevisions.itemId))
    .innerJoin(sets, eq(sets.id, nodes.setId))
    .innerJoin(itemTypes, eq(itemTypes.id, sets.itemTypeId))
    .where(and(eq(sets.projectId, projectId), isNull(nodes.deletedAt)))
    .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
  return rows.map(({ itemType, ...item }) => ({ ...item, isTest: isTestType(itemType) }));
}

/** Verification results on test cases, the status of each requirement worked out from them, and import of results from CI. */
export function verificationRoutes({ app, db, requireUser, audit, access }: AppContext) {
  // A JUnit report arrives as the raw file.
  app.addContentTypeParser(
    ["application/xml", "text/xml"],
    { parseAs: "string", bodyLimit: MAX_REPORT_BYTES },
    (_req, body, done) => done(null, body),
  );

  // The results of one test case, newest first.
  app.get(
    "/api/items/:itemId/results",
    { onRequest: requireUser, schema: { params: param("itemId") } },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const projectId = await access(req, reply, { nodeId: itemId }, "viewer");
      if (!projectId) return reply;
      const item = (await currentItems(db, projectId)).find((i) => i.id === itemId);
      if (!item) return reply.code(404).send({ error: "Item not found" });
      const rows = await db
        .select({
          id: verificationResults.id,
          outcome: verificationResults.outcome,
          revision: verificationResults.revision,
          runAt: verificationResults.runAt,
          note: verificationResults.note,
          attachmentId: verificationResults.attachmentId,
          source: verificationResults.source,
          recordedBy: users.name,
          recordedAt: verificationResults.createdAt,
        })
        .from(verificationResults)
        .innerJoin(users, eq(users.id, verificationResults.recordedBy))
        .where(eq(verificationResults.itemId, itemId))
        .orderBy(desc(verificationResults.createdAt));
      return {
        isTest: item.isTest,
        results: rows.map((r) => ({ ...r, outOfDate: isOutOfDate(r, item.revision) })),
      };
    },
  );

  // Records one result on a test case. Results are never changed or removed: a mistake is corrected by recording another.
  app.post(
    "/api/items/:itemId/results",
    {
      onRequest: requireUser,
      schema: {
        params: param("itemId"),
        body: {
          type: "object",
          required: ["outcome"],
          additionalProperties: false,
          properties: {
            outcome: { enum: [...OUTCOMES] },
            // The version of the test case that was run. Left out, it is the current one.
            revision: { type: "integer", minimum: 1 },
            // When the test was run. Left out, it is now.
            runAt: { type: "string", format: "date-time" },
            note: { type: "string", maxLength: MAX_NOTE },
            attachmentId: uuid,
          },
        },
      },
    },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const body = req.body as {
        outcome: (typeof OUTCOMES)[number];
        revision?: number;
        runAt?: string;
        note?: string;
        attachmentId?: string;
      };
      const projectId = await access(req, reply, { nodeId: itemId }, "editor");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const item = (await currentItems(db, projectId)).find((i) => i.id === itemId);
      if (!item) return reply.code(404).send({ error: "Item not found" });
      if (!item.isTest) return reply.code(400).send({ error: "Results can only be recorded on a test case" });
      if (body.revision !== undefined && body.revision > item.revision) {
        return reply.code(400).send({ error: `This test case has no version ${body.revision}` });
      }
      const runAt = body.runAt ? new Date(body.runAt) : new Date();
      if (runAt.getTime() > Date.now() + 86_400_000) {
        return reply.code(400).send({ error: "The run date is in the future" });
      }
      if (body.attachmentId) {
        const [file] = await db
          .select({ id: attachments.id })
          .from(attachments)
          .where(and(eq(attachments.id, body.attachmentId), eq(attachments.projectId, projectId)));
        if (!file) return reply.code(400).send({ error: "The evidence is not an upload of this project" });
      }
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(verificationResults)
          .values({
            itemId,
            revision: body.revision ?? item.revision,
            outcome: body.outcome,
            runAt,
            note: body.note?.trim() ?? "",
            attachmentId: body.attachmentId ?? null,
            source: "manual",
            recordedBy: userId,
          })
          .returning({ id: verificationResults.id });
        if (!row) throw new Error("result insert returned no row");
        await audit(tx, userId, `result.${body.outcome}`, "item", itemId);
        return row.id;
      });
      return reply.code(201).send({ id });
    },
  );

  // Verification of a whole project: the status of every item that is not a test case, from the tests linked to it
  // by "Verified by" (the test is the downstream end), and the latest result of every test case that has one.
  app.get(
    "/api/projects/:projectId/verification",
    { onRequest: requireUser, schema: { params: param("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const items = await currentItems(db, projectId);
      const byId = new Map(items.map((i) => [i.id, i]));
      const types = await db.select().from(linkTypes).where(eq(linkTypes.projectId, projectId));
      const verifying = new Set(types.filter((t) => isVerifiedBy(t.name)).map((t) => t.id));
      // The latest result of each test case.
      const latest = new Map<string, { outcome: (typeof OUTCOMES)[number]; revision: number; recordedAt: Date }>();
      const rows = await db
        .selectDistinctOn([verificationResults.itemId], {
          itemId: verificationResults.itemId,
          outcome: verificationResults.outcome,
          revision: verificationResults.revision,
          recordedAt: verificationResults.createdAt,
        })
        .from(verificationResults)
        .innerJoin(nodes, eq(nodes.id, verificationResults.itemId))
        .innerJoin(sets, eq(sets.id, nodes.setId))
        .where(eq(sets.projectId, projectId))
        .orderBy(verificationResults.itemId, desc(verificationResults.createdAt));
      for (const { itemId, ...result } of rows) latest.set(itemId, result);

      const testsOf = new Map<string, string[]>();
      for (const link of await liveLinks(db, projectId)) {
        if (!verifying.has(link.typeId) || !byId.get(link.downstreamId)?.isTest) continue;
        const list = testsOf.get(link.upstreamId) ?? [];
        // Two "Verified by" links to one test count once.
        if (!list.includes(link.downstreamId)) testsOf.set(link.upstreamId, [...list, link.downstreamId]);
      }

      const requirements: Record<string, object> = {};
      const tests: Record<string, object> = {};
      for (const item of items) {
        if (item.isTest) {
          const result = latest.get(item.id);
          if (result) tests[item.id] = { ...result, outOfDate: isOutOfDate(result, item.revision) };
          continue;
        }
        const linked = (testsOf.get(item.id) ?? []).flatMap((id) => {
          const test = byId.get(id);
          return test ? [{ itemId: id, revision: test.revision, result: latest.get(id) }] : [];
        });
        requirements[item.id] = {
          ...verificationStatus(item.revisedAt, linked),
          tests: linked.map(({ itemId, revision, result }) => ({
            itemId,
            outcome: result?.outcome ?? null,
            outOfDate: result !== undefined && isOutOfDate(result, revision, item.revisedAt),
          })),
        };
      }
      return { requirements, tests };
    },
  );

  // Import from CI: a JUnit XML report as the request body. Each reported test whose name or class name contains
  // the UID of a test case records one result on that test case, against its current version.
  app.post(
    "/api/projects/:projectId/verification-results/junit",
    { onRequest: requireUser, bodyLimit: MAX_REPORT_BYTES, schema: { params: param("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "editor"))) return reply;
      const userId = req.user?.id as string;
      const reported = typeof req.body === "string" ? parseJunit(req.body) : null;
      if (!reported) {
        return reply
          .code(400)
          .send({ error: "Send a JUnit XML report as the request body, with the content type application/xml" });
      }
      const testCases = new Map(
        (await currentItems(db, projectId)).filter((i) => i.isTest && i.uid).map((i) => [i.uid as string, i]),
      );
      const { results, unmatched } = matchJunit(reported, [...testCases.keys()]);
      const now = new Date();
      await db.transaction(async (tx) => {
        for (const result of results) {
          const item = testCases.get(result.uid);
          if (!item) continue;
          const [row] = await tx
            .insert(verificationResults)
            .values({
              itemId: item.id,
              revision: item.revision,
              outcome: result.outcome,
              runAt: now,
              note: result.note.slice(0, MAX_NOTE),
              source: "junit",
              recordedBy: userId,
            })
            .returning({ id: verificationResults.id });
          if (!row) throw new Error("result insert returned no row");
          // One event per result for the audit log. The activity stream shows the single summary below instead.
          await audit(tx, userId, `junit.result.${result.outcome}`, "result", row.id, { projectId, label: result.uid });
        }
        await audit(tx, userId, "junit.import", "junit", projectId, {
          projectId,
          label: `${results.length} ${results.length === 1 ? "result" : "results"}`,
        });
      });
      return reply.code(201).send({
        recorded: results.map(({ uid, outcome }) => ({ uid, outcome })),
        // Reported tests that named no test case of this project. Capped, so a report from another project stays readable.
        unmatched: unmatched.slice(0, 200),
        unmatchedCount: unmatched.length,
      });
    },
  );
}
