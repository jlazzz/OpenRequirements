import { matchJunit, parseJunit } from "@app/importers";
import { and, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { AppContext, Tx } from "./app.ts";
import type { Db } from "./db/client.ts";
import {
  attachments,
  ciRuns,
  itemRevisions,
  itemTypes,
  linkTypes,
  nodes,
  projects,
  resultAttachments,
  sets,
  testCycles,
  testPlans,
  testRuns,
  users,
  verificationResults,
} from "./db/schema.ts";
import {
  countsTowardStatus,
  isFlaky,
  isOutOfDate,
  OUTCOMES,
  type Outcome,
  passRate,
  verificationStatus,
} from "./domain/verification.ts";
import { liveLinks } from "./links.ts";

const uuid = { type: "string", format: "uuid" } as const;
const param = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;
const MAX_REPORT_BYTES = 20 * 1024 * 1024;
const MAX_NOTE = 2000;
const MAX_EVIDENCE = 20;

/**
 * The live items of a project and whether they are test cases. `revision` and `revisedAt` are the latest version that
 * changed more than Status: the one results are judged against (ADR 0010). `latest` is the newest version of any kind.
 */
async function currentItems(db: Db | Tx, projectId: string) {
  const rows = await db
    .selectDistinctOn([itemRevisions.itemId], {
      id: nodes.id,
      uid: nodes.uid,
      role: itemTypes.role,
      revision: itemRevisions.number,
      revisedAt: itemRevisions.createdAt,
      latest: sql<number>`(select max(r.number) from item_revisions r where r.item_id = ${nodes.id})`,
    })
    .from(itemRevisions)
    .innerJoin(nodes, eq(nodes.id, itemRevisions.itemId))
    .innerJoin(sets, eq(sets.id, nodes.setId))
    .innerJoin(itemTypes, eq(itemTypes.id, sets.itemTypeId))
    .where(and(eq(sets.projectId, projectId), isNull(nodes.deletedAt), eq(itemRevisions.statusOnly, false)))
    .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
  return rows.map(({ role, ...item }) => ({ ...item, isTest: role === "test" }));
}

/** Evidence files matching `filter` (a condition on result_attachments), oldest first. */
export function loadEvidence(db: Db | Tx, filter: SQL | undefined) {
  return db
    .select({
      id: attachments.id,
      name: attachments.name,
      contentType: attachments.contentType,
      size: attachments.size,
      // Set when the file is evidence of one step of a run.
      step: resultAttachments.step,
      resultId: resultAttachments.resultId,
      runId: resultAttachments.runId,
      by: users.name,
      at: resultAttachments.createdAt,
    })
    .from(resultAttachments)
    .innerJoin(attachments, eq(attachments.id, resultAttachments.attachmentId))
    .innerJoin(users, eq(users.id, resultAttachments.createdBy))
    .where(filter)
    .orderBy(resultAttachments.createdAt);
}

/** The evidence of each of `results`, by result id: the files on the result itself and those gathered by its run. */
async function evidenceByResult(db: Db | Tx, results: { id: string; runId: string | null }[]) {
  const files = new Map<string, Awaited<ReturnType<typeof loadEvidence>>>();
  if (results.length === 0) return files;
  const runIds = results.flatMap((r) => (r.runId ? [r.runId] : []));
  const rows = await loadEvidence(
    db,
    or(
      inArray(
        resultAttachments.resultId,
        results.map((r) => r.id),
      ),
      runIds.length ? inArray(resultAttachments.runId, runIds) : undefined,
    ),
  );
  const resultOfRun = new Map(results.flatMap((r) => (r.runId ? [[r.runId, r.id]] : [])));
  for (const file of rows) {
    const resultId = file.resultId ?? resultOfRun.get(file.runId ?? "");
    if (resultId) files.set(resultId, [...(files.get(resultId) ?? []), file]);
  }
  return files;
}

/** Whether every one of `ids` is an upload of the project. */
export async function areUploadsOf(db: Db | Tx, projectId: string, ids: string[]) {
  if (ids.length === 0) return true;
  const found = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(inArray(attachments.id, ids), eq(attachments.projectId, projectId)));
  return found.length === new Set(ids).size;
}

/**
 * Verification of a whole project: the status of every item that is not a test case, from the tests linked to it
 * by a relationship type with the role "verifies" (the test is the downstream end), and the latest result of every test case that has one.
 */
export async function projectVerification(db: Db | Tx, projectId: string) {
  const items = await currentItems(db, projectId);
  const byId = new Map(items.map((i) => [i.id, i]));
  const types = await db
    .select({ id: linkTypes.id })
    .from(linkTypes)
    .where(and(eq(linkTypes.projectId, projectId), eq(linkTypes.role, "verifies")));
  const verifying = new Set(types.map((t) => t.id));
  // The latest result of each test case.
  const latest = new Map<string, { id: string; outcome: Outcome; revision: number; recordedAt: Date }>();
  const [{ mainBranch = "" } = {}] = await db
    .select({ mainBranch: projects.mainBranch })
    .from(projects)
    .where(eq(projects.id, projectId));
  // The branch rule: a CI result from another branch is recorded but never the latest result that counts.
  const counts = mainBranch ? or(isNull(verificationResults.ciRunId), eq(ciRuns.branch, mainBranch)) : undefined;
  const rows = await db
    .selectDistinctOn([verificationResults.itemId], {
      itemId: verificationResults.itemId,
      id: verificationResults.id,
      outcome: verificationResults.outcome,
      revision: verificationResults.revision,
      recordedAt: verificationResults.createdAt,
    })
    .from(verificationResults)
    .innerJoin(nodes, eq(nodes.id, verificationResults.itemId))
    .innerJoin(sets, eq(sets.id, nodes.setId))
    .leftJoin(ciRuns, eq(ciRuns.id, verificationResults.ciRunId))
    .where(and(eq(sets.projectId, projectId), counts))
    .orderBy(verificationResults.itemId, desc(verificationResults.createdAt));
  for (const { itemId, ...result } of rows) latest.set(itemId, result);

  const testsOf = new Map<string, string[]>();
  for (const link of await liveLinks(db, projectId)) {
    if (!verifying.has(link.typeId) || !byId.get(link.downstreamId)?.isTest) continue;
    const list = testsOf.get(link.upstreamId) ?? [];
    // Two "Verified by" links to one test count once.
    if (!list.includes(link.downstreamId)) testsOf.set(link.upstreamId, [...list, link.downstreamId]);
  }

  const requirements: Record<
    string,
    ReturnType<typeof verificationStatus> & { tests: { itemId: string; outcome: Outcome | null; outOfDate: boolean }[] }
  > = {};
  const tests: Record<
    string,
    { id: string; outcome: Outcome; revision: number; recordedAt: Date; outOfDate: boolean }
  > = {};
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
          source: verificationResults.source,
          // Set on a result that came from a CI upload.
          ciRunId: verificationResults.ciRunId,
          // Set on the result of a test run.
          runId: verificationResults.runId,
          defectUrl: verificationResults.defectUrl,
          recordedBy: users.name,
          recordedAt: verificationResults.createdAt,
        })
        .from(verificationResults)
        .innerJoin(users, eq(users.id, verificationResults.recordedBy))
        .where(eq(verificationResults.itemId, itemId))
        .orderBy(desc(verificationResults.createdAt));
      const evidence = await evidenceByResult(db, rows);
      return {
        isTest: item.isTest,
        results: rows.map((r) => ({
          ...r,
          outOfDate: isOutOfDate(r, item.revision),
          attachments: (evidence.get(r.id) ?? []).map(({ id, name, contentType, step }) => ({
            id,
            name,
            contentType,
            step,
          })),
        })),
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
            // Evidence: uploads of the same project.
            attachmentIds: { type: "array", maxItems: MAX_EVIDENCE, items: uuid },
          },
        },
      },
    },
    async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      const body = req.body as {
        outcome: Outcome;
        revision?: number;
        runAt?: string;
        note?: string;
        attachmentIds?: string[];
      };
      const evidence = [...new Set(body.attachmentIds ?? [])];
      const projectId = await access(req, reply, { nodeId: itemId }, "editor");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const item = (await currentItems(db, projectId)).find((i) => i.id === itemId);
      if (!item) return reply.code(404).send({ error: "Item not found" });
      if (!item.isTest) return reply.code(400).send({ error: "Results can only be recorded on a test case" });
      if (body.revision !== undefined && body.revision > item.latest) {
        return reply.code(400).send({ error: `This test case has no version ${body.revision}` });
      }
      const runAt = body.runAt ? new Date(body.runAt) : new Date();
      if (runAt.getTime() > Date.now() + 86_400_000) {
        return reply.code(400).send({ error: "The run date is in the future" });
      }
      if (!(await areUploadsOf(db, projectId, evidence))) {
        return reply.code(400).send({ error: "The evidence is not an upload of this project" });
      }
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(verificationResults)
          .values({
            itemId,
            revision: body.revision ?? item.latest,
            outcome: body.outcome,
            runAt,
            note: body.note?.trim() ?? "",
            source: "manual",
            recordedBy: userId,
          })
          .returning({ id: verificationResults.id });
        if (!row) throw new Error("result insert returned no row");
        if (evidence.length > 0) {
          await tx
            .insert(resultAttachments)
            .values(evidence.map((attachmentId) => ({ resultId: row.id, attachmentId, createdBy: userId })));
        }
        await audit(tx, userId, `result.${body.outcome}`, "item", itemId);
        return row.id;
      });
      return reply.code(201).send({ id });
    },
  );

  app.get(
    "/api/projects/:projectId/verification",
    { onRequest: requireUser, schema: { params: param("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      return projectVerification(db, projectId);
    },
  );

  // The requirement verification report: the status of every requirement, and for the latest result of each test case
  // who recorded it, in which cycle, and its evidence. Computed on every request, like the status itself.
  app.get(
    "/api/projects/:projectId/reports/verification",
    { onRequest: requireUser, schema: { params: param("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const { requirements, tests } = await projectVerification(db, projectId);
      const ids = Object.values(tests).map((t) => t.id);
      const details = ids.length
        ? await db
            .select({
              id: verificationResults.id,
              runAt: verificationResults.runAt,
              recordedBy: users.name,
              source: verificationResults.source,
              runId: verificationResults.runId,
              cycleId: testCycles.id,
              cycle: testCycles.name,
              defectUrl: verificationResults.defectUrl,
            })
            .from(verificationResults)
            .innerJoin(users, eq(users.id, verificationResults.recordedBy))
            .leftJoin(testRuns, eq(testRuns.id, verificationResults.runId))
            .leftJoin(testCycles, eq(testCycles.id, testRuns.cycleId))
            .where(inArray(verificationResults.id, ids))
        : [];
      const evidence = await evidenceByResult(db, details);
      const detailOf = new Map(details.map((d) => [d.id, d]));
      return {
        requirements,
        tests: Object.fromEntries(
          Object.entries(tests).map(([itemId, result]) => [
            itemId,
            {
              ...result,
              ...detailOf.get(result.id),
              evidence: (evidence.get(result.id) ?? []).map(({ id, name }) => ({ id, name })),
            },
          ]),
        ),
      };
    },
  );

  // Flaky tests: live test cases whose last five results changed outcome more than once. Outcomes are oldest first.
  app.get(
    "/api/projects/:projectId/reports/flaky",
    { onRequest: requireUser, schema: { params: param("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const rows = await db
        .select({ itemId: verificationResults.itemId, outcome: verificationResults.outcome })
        .from(verificationResults)
        .innerJoin(nodes, eq(nodes.id, verificationResults.itemId))
        .innerJoin(sets, eq(sets.id, nodes.setId))
        .where(and(eq(sets.projectId, projectId), isNull(nodes.deletedAt)))
        // shortcut: reads every result of the project to keep five per test, use a window function when results reach hundreds of thousands
        .orderBy(verificationResults.createdAt);
      const outcomes = new Map<string, Outcome[]>();
      for (const row of rows) outcomes.set(row.itemId, [...(outcomes.get(row.itemId) ?? []), row.outcome].slice(-5));
      return {
        tests: [...outcomes].filter(([, list]) => isFlaky(list)).map(([itemId, list]) => ({ itemId, outcomes: list })),
      };
    },
  );

  // Import from CI: a JUnit XML report as the request body. Each reported test whose name or class name contains
  // the UID of a test case records one result on that test case, against its current version.
  // With `?testCycleId=`, a reported test that has an unfinished run in that cycle finishes the run instead,
  // against the version the cycle froze. With `?attachmentId=`, that upload (the job's log, say) becomes evidence
  // of every result the report records.
  app.post(
    "/api/projects/:projectId/verification-results/junit",
    {
      onRequest: requireUser,
      bodyLimit: MAX_REPORT_BYTES,
      schema: {
        params: param("projectId"),
        querystring: {
          type: "object",
          properties: {
            testCycleId: uuid,
            attachmentId: uuid,
            // Where the report came from, kept on the CI run.
            pipeline: { type: "string", maxLength: 200 },
            branch: { type: "string", maxLength: 200 },
            commit: { type: "string", maxLength: 100 },
            buildUrl: { type: "string", maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      const {
        testCycleId,
        attachmentId,
        pipeline = "",
        branch = "",
        commit = "",
        buildUrl = "",
      } = req.query as Record<string, string | undefined>;
      if (!(await access(req, reply, { projectId }, "editor"))) return reply;
      const userId = req.user?.id as string;
      if (attachmentId && !(await areUploadsOf(db, projectId, [attachmentId]))) {
        return reply.code(400).send({ error: "The log file is not an upload of this project" });
      }
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
      const filled = await db.transaction(async (tx) => {
        // The unfinished runs of the cycle, by test case. The cycle is locked, as for every write to its runs.
        const runs = new Map<string, { id: string; revision: number }>();
        if (testCycleId) {
          const [cycle] = await tx
            .select({ closedAt: testCycles.closedAt, projectId: testPlans.projectId })
            .from(testCycles)
            .innerJoin(testPlans, eq(testPlans.id, testCycles.planId))
            .where(eq(testCycles.id, testCycleId))
            .for("update", { of: testCycles });
          if (cycle?.projectId !== projectId) return { error: [400, "The test cycle is not in this project"] } as const;
          if (cycle.closedAt) return { error: [409, "This test cycle is closed"] } as const;
          const open = await tx
            .select({ id: testRuns.id, itemId: testRuns.itemId, revision: itemRevisions.number })
            .from(testRuns)
            .innerJoin(itemRevisions, eq(itemRevisions.id, testRuns.revisionId))
            .leftJoin(verificationResults, eq(verificationResults.runId, testRuns.id))
            .where(and(eq(testRuns.cycleId, testCycleId), isNull(verificationResults.id)));
          for (const { itemId, ...run } of open) runs.set(itemId, run);
        }
        const [ciRun] = await tx
          .insert(ciRuns)
          .values({
            projectId,
            pipeline,
            branch,
            commit,
            buildUrl,
            passed: results.filter((r) => r.outcome === "pass").length,
            failed: results.filter((r) => r.outcome === "fail").length,
            skipped: reported.filter((t) => t.outcome === "skipped").length,
            unmatched: unmatched.length,
            unmatchedNames: unmatched.slice(0, 200),
            createdBy: userId,
          })
          .returning({ id: ciRuns.id });
        if (!ciRun) throw new Error("ci run insert returned no row");
        for (const result of results) {
          const item = testCases.get(result.uid);
          if (!item) continue;
          const run = runs.get(item.id);
          const [row] = await tx
            .insert(verificationResults)
            .values({
              itemId: item.id,
              revision: run?.revision ?? item.latest,
              outcome: result.outcome,
              runAt: now,
              note: result.note.slice(0, MAX_NOTE),
              source: "junit",
              recordedBy: userId,
              runId: run?.id ?? null,
              ciRunId: ciRun.id,
            })
            .returning({ id: verificationResults.id });
          if (!row) throw new Error("result insert returned no row");
          if (attachmentId) {
            await tx.insert(resultAttachments).values({ resultId: row.id, attachmentId, createdBy: userId });
          }
          // One event per result for the audit log. The activity stream shows the single summary below instead.
          await audit(tx, userId, `junit.result.${result.outcome}`, "result", row.id, { projectId, label: result.uid });
        }
        await audit(tx, userId, "junit.import", "junit", projectId, {
          projectId,
          label: `${results.length} ${results.length === 1 ? "result" : "results"}`,
        });
        await audit(tx, userId, "ci_run.create", "ci_run", ciRun.id, {
          projectId,
          label: pipeline || branch || "CI run",
        });
        return { runs: new Set(runs.keys()), ciRunId: ciRun.id };
      });
      if (filled.error) return reply.code(filled.error[0]).send({ error: filled.error[1] });
      return reply.code(201).send({
        ciRunId: filled.ciRunId,
        // `run: true` says the result finished a run of the cycle.
        recorded: results.map(({ uid, outcome }) => ({
          uid,
          outcome,
          ...(filled.runs.has(testCases.get(uid)?.id ?? "") ? { run: true } : {}),
        })),
        // Reported tests that named no test case of this project. Capped, so a report from another project stays readable.
        unmatched: unmatched.slice(0, 200),
        unmatchedCount: unmatched.length,
      });
    },
  );

  // CI runs of a project, newest first, optionally of one pipeline or branch.
  app.get(
    "/api/projects/:projectId/ci-runs",
    {
      onRequest: requireUser,
      schema: {
        params: param("projectId"),
        querystring: {
          type: "object",
          properties: { pipeline: { type: "string" }, branch: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      const { pipeline, branch } = req.query as { pipeline?: string; branch?: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const mine = eq(ciRuns.projectId, projectId);
      const runs = await db
        .select({
          id: ciRuns.id,
          pipeline: ciRuns.pipeline,
          branch: ciRuns.branch,
          commit: ciRuns.commit,
          buildUrl: ciRuns.buildUrl,
          passed: ciRuns.passed,
          failed: ciRuns.failed,
          skipped: ciRuns.skipped,
          unmatched: ciRuns.unmatched,
          createdBy: users.name,
          createdAt: ciRuns.createdAt,
        })
        .from(ciRuns)
        .innerJoin(users, eq(users.id, ciRuns.createdBy))
        .where(
          and(
            mine,
            pipeline === undefined ? undefined : eq(ciRuns.pipeline, pipeline),
            branch === undefined ? undefined : eq(ciRuns.branch, branch),
          ),
        )
        .orderBy(desc(ciRuns.createdAt))
        .limit(200);
      // For the filters: every pipeline and branch the project has seen.
      const names = await db
        .selectDistinct({ pipeline: ciRuns.pipeline, branch: ciRuns.branch })
        .from(ciRuns)
        .where(mine);
      const [{ mainBranch = "" } = {}] = await db
        .select({ mainBranch: projects.mainBranch })
        .from(projects)
        .where(eq(projects.id, projectId));
      return {
        mainBranch,
        // `counts`: whether the run's results count toward verification status (the branch rule).
        runs: runs.map((r) => ({ ...r, counts: countsTowardStatus(r.branch, mainBranch), passRate: passRate(r) })),
        pipelines: [...new Set(names.map((n) => n.pipeline))].sort(),
        branches: [...new Set(names.map((n) => n.branch))].sort(),
      };
    },
  );

  // One upload: the results it recorded, each with the requirements its test case verifies, and the unmatched names.
  app.get(
    "/api/ci-runs/:ciRunId",
    { onRequest: requireUser, schema: { params: param("ciRunId") } },
    async (req, reply) => {
      const { ciRunId } = req.params as { ciRunId: string };
      const projectId = await access(req, reply, { ciRunId }, "viewer");
      if (!projectId) return reply;
      const [run] = await db
        .select({
          id: ciRuns.id,
          pipeline: ciRuns.pipeline,
          branch: ciRuns.branch,
          commit: ciRuns.commit,
          buildUrl: ciRuns.buildUrl,
          passed: ciRuns.passed,
          failed: ciRuns.failed,
          skipped: ciRuns.skipped,
          unmatched: ciRuns.unmatched,
          unmatchedNames: ciRuns.unmatchedNames,
          createdBy: users.name,
          createdAt: ciRuns.createdAt,
        })
        .from(ciRuns)
        .innerJoin(users, eq(users.id, ciRuns.createdBy))
        .where(eq(ciRuns.id, ciRunId));
      if (!run) return reply.code(404).send({ error: "CI run not found" });
      const rows = await db
        .select({
          id: verificationResults.id,
          itemId: verificationResults.itemId,
          outcome: verificationResults.outcome,
          revision: verificationResults.revision,
          note: verificationResults.note,
        })
        .from(verificationResults)
        .where(eq(verificationResults.ciRunId, ciRunId))
        .orderBy(verificationResults.createdAt);
      const items = new Map((await currentItems(db, projectId)).map((i) => [i.id, i]));
      const types = await db
        .select({ id: linkTypes.id })
        .from(linkTypes)
        .where(and(eq(linkTypes.projectId, projectId), eq(linkTypes.role, "verifies")));
      const verifying = new Set(types.map((t) => t.id));
      const tested = new Set(rows.map((r) => r.itemId));
      const requirementsOf = new Map<string, string[]>();
      for (const link of await liveLinks(db, projectId)) {
        if (!verifying.has(link.typeId) || !tested.has(link.downstreamId) || !items.has(link.upstreamId)) continue;
        requirementsOf.set(link.downstreamId, [...(requirementsOf.get(link.downstreamId) ?? []), link.upstreamId]);
      }
      const wanted = [...new Set([...tested, ...[...requirementsOf.values()].flat()])];
      const names = wanted.length
        ? await db
            .selectDistinctOn([itemRevisions.itemId], { itemId: itemRevisions.itemId, name: itemRevisions.name })
            .from(itemRevisions)
            .where(inArray(itemRevisions.itemId, wanted))
            .orderBy(itemRevisions.itemId, desc(itemRevisions.number))
        : [];
      const nameOf = new Map(names.map((n) => [n.itemId, n.name]));
      return {
        run,
        results: rows.map((r) => ({
          ...r,
          uid: items.get(r.itemId)?.uid ?? null,
          name: nameOf.get(r.itemId) ?? "",
          requirements: [...new Set(requirementsOf.get(r.itemId) ?? [])].map((id) => ({
            id,
            uid: items.get(id)?.uid ?? null,
            name: nameOf.get(id) ?? "",
          })),
        })),
      };
    },
  );
}
