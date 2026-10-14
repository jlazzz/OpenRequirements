import { actualToStored, type RichNode, storedActual } from "@app/shared";
import { and, desc, eq, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyRequest } from "fastify";
import { roleIn } from "./access.ts";
import type { AppContext, Tx } from "./app.ts";
import type { Db } from "./db/client.ts";
import {
  attributeDefinitions,
  baselines,
  externalReferences,
  itemRevisions,
  nodes,
  projectMembers,
  projects,
  resultAttachments,
  sets,
  stepResults,
  testCycles,
  testPlans,
  testRuns,
  users,
  verificationResults,
} from "./db/schema.ts";
import { referenceKind } from "./domain/references.ts";
import { roleAllows } from "./domain/roles.ts";
import { runOutcome, runState, runSteps } from "./domain/testrun.ts";
import { OUTCOMES, type Outcome } from "./domain/verification.ts";
import { notify } from "./mail.ts";
import { areUploadsOf, loadEvidence } from "./verification.ts";

const uuid = { type: "string", format: "uuid" } as const;
const idParam = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;

/**
 * The test runs matching `filter` (a condition on test_runs, test_cycles or test_plans), in cycle order.
 * Each comes with the frozen version of its test case, its steps with the latest result of each, and its state.
 */
export async function loadRuns(db: Db | Tx, filter: SQL | undefined) {
  const assignee = alias(users, "assignee");
  const rows = await db
    .select({
      id: testRuns.id,
      cycleId: testRuns.cycleId,
      cycle: testCycles.name,
      projectId: testPlans.projectId,
      itemId: testRuns.itemId,
      uid: nodes.uid,
      name: itemRevisions.name,
      revision: itemRevisions.number,
      attributes: itemRevisions.attributes,
      itemTypeId: sets.itemTypeId,
      group: testRuns.groupName,
      assigneeId: testRuns.assigneeId,
      assignee: assignee.name,
      result: verificationResults.outcome,
    })
    .from(testRuns)
    .innerJoin(testCycles, eq(testCycles.id, testRuns.cycleId))
    .innerJoin(testPlans, eq(testPlans.id, testCycles.planId))
    .innerJoin(nodes, eq(nodes.id, testRuns.itemId))
    .innerJoin(sets, eq(sets.id, nodes.setId))
    .innerJoin(itemRevisions, eq(itemRevisions.id, testRuns.revisionId))
    .leftJoin(assignee, eq(assignee.id, testRuns.assigneeId))
    .leftJoin(verificationResults, eq(verificationResults.runId, testRuns.id))
    .where(filter)
    .orderBy(testRuns.cycleId, testRuns.position);
  if (rows.length === 0) return [];

  const matching = db
    .select({ id: testRuns.id })
    .from(testRuns)
    .innerJoin(testCycles, eq(testCycles.id, testRuns.cycleId))
    .innerJoin(testPlans, eq(testPlans.id, testCycles.planId))
    .where(filter);
  const latest = await db
    .selectDistinctOn([stepResults.runId, stepResults.step], {
      runId: stepResults.runId,
      step: stepResults.step,
      outcome: stepResults.outcome,
      actual: stepResults.actual,
      by: users.name,
      at: stepResults.createdAt,
    })
    .from(stepResults)
    .innerJoin(users, eq(users.id, stepResults.recordedBy))
    .where(inArray(stepResults.runId, matching))
    .orderBy(stepResults.runId, stepResults.step, desc(stepResults.createdAt));
  const recorded = new Map(latest.map((row) => [`${row.runId}:${row.step}`, row]));
  // The steps of a test case are the value of its type's field of type "steps": the first one, should there be several.
  const stepFields = await db
    .select({ id: attributeDefinitions.id, itemTypeId: attributeDefinitions.itemTypeId })
    .from(attributeDefinitions)
    .where(
      and(
        eq(attributeDefinitions.type, "steps"),
        inArray(attributeDefinitions.itemTypeId, [...new Set(rows.map((row) => row.itemTypeId))]),
      ),
    )
    .orderBy(desc(attributeDefinitions.position));
  const stepField = new Map(stepFields.map((field) => [field.itemTypeId, field.id]));

  return rows.map(({ attributes, itemTypeId, result, ...run }) => {
    const steps = runSteps(attributes[stepField.get(itemTypeId) ?? ""]).map((step, index) => {
      const done = recorded.get(`${run.id}:${index + 1}`);
      return {
        ...step,
        outcome: done?.outcome ?? null,
        actual: storedActual(done?.actual ?? ""),
        by: done?.by ?? null,
        at: done?.at ?? null,
      };
    });
    return {
      ...run,
      steps,
      state: runState(
        steps.map((step) => step.outcome ?? undefined),
        result ?? undefined,
      ),
      // A run is finished once it has written its verification result.
      finished: result !== null,
    };
  });
}

type Run = Awaited<ReturnType<typeof loadRuns>>[number];

/** A run as a row of a list: without the text of its steps. */
export const runSummary = ({ steps, ...run }: Run) => ({
  ...run,
  done: steps.filter((step) => step.outcome).length,
  total: steps.length,
});

/** Test cycles and runs: assigning runs, executing them step by step, finishing them and closing a cycle. */
export function testRunRoutes({ app, db, requireUser, audit, access, mail }: AppContext) {
  /**
   * Locks the cycle of a run (or the cycle itself), so step results, finishing, assigning and closing run one at a time.
   * Returns the cycle, or undefined when there is none.
   */
  async function lockCycle(tx: Tx, where: { testCycleId: string } | { testRunId: string }) {
    const [cycle] = await tx
      .select({ id: testCycles.id, name: testCycles.name, closedAt: testCycles.closedAt })
      .from(testCycles)
      .where(
        "testCycleId" in where
          ? eq(testCycles.id, where.testCycleId)
          : inArray(
              testCycles.id,
              tx.select({ id: testRuns.cycleId }).from(testRuns).where(eq(testRuns.id, where.testRunId)),
            ),
      )
      .for("update");
    return cycle;
  }
  const closed = { error: [409, "This test cycle is closed"] } as const;
  const noRun = { error: [404, "Test run not found"] } as const;

  /** A Reviewer executes the runs assigned to them; an Editor executes any run (ADR 0012). */
  async function mayExecute(req: FastifyRequest, projectId: string, assigneeId: string | null) {
    const role = req.user ? await roleIn(db, req.user, projectId) : null;
    return role !== null && (roleAllows(role, "editor") || assigneeId === req.user?.id);
  }
  const notYours = { error: [403, "This run is assigned to someone else. An editor can execute any run."] } as const;

  // The signed-in user's open work in every project: runs assigned to them that are not finished, in cycles still open.
  app.get("/api/test-runs/mine", { onRequest: requireUser }, async (req) => {
    const user = req.user as { id: string; isAdmin: boolean };
    // shortcut: also loads this user's finished runs of open cycles before dropping them, filter in SQL when cycles reach thousands of runs per person
    const runs = await loadRuns(
      db,
      and(eq(testRuns.assigneeId, user.id), isNull(testCycles.closedAt), isNull(testPlans.deletedAt)),
    );
    const mine = db
      .select({ id: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, user.id));
    // Someone taken out of a project no longer sees its runs.
    const open = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(isNull(projects.archivedAt), user.isAdmin ? undefined : inArray(projects.id, mine)));
    const project = new Map(open.map((p) => [p.id, p.name]));
    return {
      runs: runs
        .filter((run) => !run.finished && project.has(run.projectId))
        .map((run) => ({ ...runSummary(run), project: project.get(run.projectId) })),
    };
  });

  // Runs in the project's open cycles, for the Test runs page: who they are assigned to, and which plan and cycle.
  app.get(
    "/api/projects/:projectId/test-runs",
    { onRequest: requireUser, schema: { params: idParam("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const open = and(eq(testPlans.projectId, projectId), isNull(testCycles.closedAt), isNull(testPlans.deletedAt));
      const cycles = await db
        .select({ id: testCycles.id, name: testCycles.name, planId: testPlans.id, plan: testPlans.name })
        .from(testCycles)
        .innerJoin(testPlans, eq(testPlans.id, testCycles.planId))
        .where(open)
        .orderBy(desc(testCycles.createdAt));
      const plan = new Map(cycles.map((cycle) => [cycle.id, cycle]));
      const runs = await loadRuns(db, open);
      return {
        cycles,
        runs: runs.map((run) => ({ ...runSummary(run), plan: plan.get(run.cycleId)?.plan ?? "" })),
      };
    },
  );

  // One cycle with its runs. The runs carry their state and progress, not the text of their steps.
  app.get(
    "/api/test-cycles/:testCycleId",
    { onRequest: requireUser, schema: { params: idParam("testCycleId") } },
    async (req, reply) => {
      const { testCycleId } = req.params as { testCycleId: string };
      if (!(await access(req, reply, { testCycleId }, "viewer"))) return reply;
      const closer = alias(users, "closer");
      const [cycle] = await db
        .select({
          id: testCycles.id,
          name: testCycles.name,
          environment: testCycles.environment,
          planId: testCycles.planId,
          plan: testPlans.name,
          // The baseline the cycle verifies, when it names one.
          baselineId: testCycles.baselineId,
          baseline: baselines.name,
          createdAt: testCycles.createdAt,
          author: users.name,
          closedAt: testCycles.closedAt,
          closedBy: closer.name,
        })
        .from(testCycles)
        .innerJoin(testPlans, eq(testPlans.id, testCycles.planId))
        .leftJoin(baselines, eq(baselines.id, testCycles.baselineId))
        .innerJoin(users, eq(users.id, testCycles.createdBy))
        .leftJoin(closer, eq(closer.id, testCycles.closedBy))
        .where(eq(testCycles.id, testCycleId));
      if (!cycle) return reply.code(404).send({ error: "Test cycle not found" });
      return { cycle, runs: (await loadRuns(db, eq(testRuns.cycleId, testCycleId))).map(runSummary) };
    },
  );

  // Assigns runs to one person, or to nobody. One request covers one run or many.
  app.post(
    "/api/test-cycles/:testCycleId/assign",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testCycleId"),
        body: {
          type: "object",
          required: ["runIds", "assigneeId"],
          additionalProperties: false,
          properties: {
            runIds: { type: "array", minItems: 1, maxItems: 5000, items: uuid },
            assigneeId: { type: ["string", "null"], format: "uuid" },
          },
        },
      },
    },
    async (req, reply) => {
      const { testCycleId } = req.params as { testCycleId: string };
      const projectId = await access(req, reply, { testCycleId }, "editor");
      if (!projectId) return reply;
      const body = req.body as { runIds: string[]; assigneeId: string | null };
      const runIds = [...new Set(body.runIds)];
      // Executing a run needs the Reviewer role or higher. Instance administrators are admins of every project.
      const [person] = body.assigneeId
        ? await db
            .select({ name: users.name, isAdmin: users.isAdmin, role: projectMembers.role })
            .from(users)
            .leftJoin(projectMembers, and(eq(projectMembers.userId, users.id), eq(projectMembers.projectId, projectId)))
            .where(and(eq(users.id, body.assigneeId), isNull(users.deactivatedAt)))
        : [];
      if (body.assigneeId && !(person?.isAdmin || (person?.role && roleAllows(person.role, "reviewer")))) {
        return reply.code(400).send({
          error: "A run can be assigned to an active member of this project with the Reviewer role or higher",
        });
      }

      const result = await db.transaction(async (tx) => {
        const cycle = await lockCycle(tx, { testCycleId });
        if (!cycle || cycle.closedAt) return closed;
        const inCycle = and(eq(testRuns.cycleId, testCycleId), inArray(testRuns.id, runIds));
        if ((await tx.$count(testRuns, inCycle)) !== runIds.length) {
          return { error: [400, "A run is not part of this test cycle"] } as const;
        }
        // Only runs that were not already this person's are news to them.
        const fresh = body.assigneeId
          ? await tx
              .select({ id: testRuns.id })
              .from(testRuns)
              .where(and(inCycle, or(isNull(testRuns.assigneeId), ne(testRuns.assigneeId, body.assigneeId))))
          : [];
        await tx.update(testRuns).set({ assigneeId: body.assigneeId }).where(inCycle);
        if (body.assigneeId && fresh.length > 0) {
          await notify(tx, mail, [
            {
              userId: body.assigneeId,
              projectId,
              kind: "run",
              text: `${req.user?.name} assigned you ${fresh.length === 1 ? "a test run" : `${fresh.length} test runs`} in ${cycle.name}`,
              path:
                fresh.length === 1
                  ? `/projects/${projectId}/runs/${fresh[0]?.id}`
                  : `/projects/${projectId}/cycles/${testCycleId}`,
              actorId: req.user?.id ?? null,
            },
          ]);
        }
        await audit(tx, req.user?.id ?? null, body.assigneeId ? "run.assign" : "run.unassign", "cycle", testCycleId, {
          projectId,
          label: `${cycle.name}: ${runIds.length} ${runIds.length === 1 ? "run" : "runs"}${person ? ` to ${person.name}` : ""}`,
        });
        return { assigned: runIds.length };
      });
      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // Closes a cycle for good. Runs that were not finished stay as they are and record nothing.
  app.post(
    "/api/test-cycles/:testCycleId/close",
    { onRequest: requireUser, schema: { params: idParam("testCycleId") } },
    async (req, reply) => {
      const { testCycleId } = req.params as { testCycleId: string };
      const projectId = await access(req, reply, { testCycleId }, "editor");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const result = await db.transaction(async (tx) => {
        const cycle = await lockCycle(tx, { testCycleId });
        if (!cycle || cycle.closedAt) return closed;
        await tx
          .update(testCycles)
          .set({ closedBy: userId, closedAt: new Date() })
          .where(eq(testCycles.id, testCycleId));
        await audit(tx, userId, "cycle.close", "cycle", testCycleId, { projectId, label: cycle.name });
        return { ok: true };
      });
      if ("error" in result) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // The execution screen's data: the frozen test case, each step with its latest result, and where to go next.
  app.get(
    "/api/test-runs/:testRunId",
    { onRequest: requireUser, schema: { params: idParam("testRunId") } },
    async (req, reply) => {
      const { testRunId } = req.params as { testRunId: string };
      const projectId = await access(req, reply, { testRunId }, "viewer");
      if (!projectId) return reply;
      const [frozen] = await db
        .select({
          description: itemRevisions.description,
          cycleId: testCycles.id,
          environment: testCycles.environment,
          closedAt: testCycles.closedAt,
          planId: testCycles.planId,
          plan: testPlans.name,
        })
        .from(testRuns)
        .innerJoin(itemRevisions, eq(itemRevisions.id, testRuns.revisionId))
        .innerJoin(testCycles, eq(testCycles.id, testRuns.cycleId))
        .innerJoin(testPlans, eq(testPlans.id, testCycles.planId))
        .where(eq(testRuns.id, testRunId));
      if (!frozen) return reply.code(404).send({ error: "Test run not found" });
      // shortcut: loads every run of the cycle to find the next one, query only the neighbours when cycles reach thousands of runs
      const siblings = await loadRuns(db, eq(testRuns.cycleId, frozen.cycleId));
      const run = siblings.find((r) => r.id === testRunId);
      if (!run) return reply.code(404).send({ error: "Test run not found" });
      // "Next run": the same person's next unfinished run in the cycle, starting over from the top after the last one.
      const queue = siblings.filter((r) => r.assigneeId === run.assigneeId && (!r.finished || r.id === run.id));
      const at = queue.findIndex((r) => r.id === run.id);
      const next = queue[at + 1] ?? (at > 0 ? queue[0] : undefined);
      const [result] = await db
        .select({
          outcome: verificationResults.outcome,
          note: verificationResults.note,
          defectUrl: verificationResults.defectUrl,
          at: verificationResults.createdAt,
          by: users.name,
        })
        .from(verificationResults)
        .innerJoin(users, eq(users.id, verificationResults.recordedBy))
        .where(eq(verificationResults.runId, testRunId));
      const { description, ...cycle } = frozen;
      const evidence = await loadEvidence(db, eq(resultAttachments.runId, testRunId));
      return {
        run: {
          ...run,
          description,
          result: result ?? null,
          // Evidence files, oldest first. `step` is set on a file that belongs to one step.
          attachments: evidence.map(({ resultId: _, runId: __, ...file }) => file),
        },
        cycle: { ...cycle, id: cycle.cycleId, name: run.cycle },
        nextRunId: next?.id ?? null,
        // What the screen offers; every action is checked again.
        canExecute: !run.finished && !frozen.closedAt && (await mayExecute(req, projectId, run.assigneeId)),
      };
    },
  );

  // Records the outcome of one step, or of several at once ("Pass all remaining"). Appended, never changed:
  // a step is corrected by recording it again, and the latest result counts.
  app.post(
    "/api/test-runs/:testRunId/steps",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testRunId"),
        body: {
          type: "object",
          required: ["steps", "outcome"],
          additionalProperties: false,
          properties: {
            steps: { type: "array", minItems: 1, maxItems: 200, items: { type: "integer", minimum: 1 } },
            outcome: { enum: [...OUTCOMES] },
            // What actually happened: plain text or a rich-text document.
            actual: { anyOf: [{ type: "string" }, { type: "object" }] },
          },
        },
      },
    },
    async (req, reply) => {
      const { testRunId } = req.params as { testRunId: string };
      const projectId = await access(req, reply, { testRunId }, "reviewer");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const body = req.body as { steps: number[]; outcome: Outcome; actual?: string | RichNode };
      const steps = [...new Set(body.steps)];
      const actual = actualToStored(body.actual ?? "");
      if ("error" in actual) return reply.code(400).send({ error: actual.error });

      const result = await db.transaction(async (tx) => {
        const cycle = await lockCycle(tx, { testRunId });
        const [run] = await loadRuns(tx, eq(testRuns.id, testRunId));
        if (!cycle || !run) return noRun;
        if (!(await mayExecute(req, projectId, run.assigneeId))) return notYours;
        if (cycle.closedAt) return closed;
        if (run.finished) return { error: [409, "This run is finished"] } as const;
        if (steps.some((step) => step > run.steps.length)) {
          return { error: [400, `This run has ${run.steps.length} steps`] } as const;
        }
        await tx.insert(stepResults).values(
          steps.map((step) => ({
            runId: testRunId,
            step,
            outcome: body.outcome,
            actual: actual.stored,
            recordedBy: userId,
            // The moment of the write, not of the transaction's start: the latest result of a step must be the last one written.
            createdAt: sql`clock_timestamp()`,
          })),
        );
        await audit(tx, userId, `run.step.${body.outcome}`, "run", testRunId, {
          projectId,
          label: `${run.uid} ${run.name}: ${steps.length === 1 ? `step ${steps[0]}` : `${steps.length} steps`}`,
        });
        const [after] = await loadRuns(tx, eq(testRuns.id, testRunId));
        return { state: after?.state };
      });
      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  // Attaches an uploaded file to a run as evidence, of one step or of the whole test. Appended, never removed.
  app.post(
    "/api/test-runs/:testRunId/attachments",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testRunId"),
        body: {
          type: "object",
          required: ["attachmentId"],
          additionalProperties: false,
          properties: { attachmentId: uuid, step: { type: "integer", minimum: 1 } },
        },
      },
    },
    async (req, reply) => {
      const { testRunId } = req.params as { testRunId: string };
      const projectId = await access(req, reply, { testRunId }, "reviewer");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const body = req.body as { attachmentId: string; step?: number };

      const result = await db.transaction(async (tx) => {
        const cycle = await lockCycle(tx, { testRunId });
        const [run] = await loadRuns(tx, eq(testRuns.id, testRunId));
        if (!cycle || !run) return noRun;
        if (!(await mayExecute(req, projectId, run.assigneeId))) return notYours;
        if (cycle.closedAt) return closed;
        if (run.finished) return { error: [409, "This run is finished"] } as const;
        if (body.step !== undefined && body.step > run.steps.length) {
          return { error: [400, `This run has ${run.steps.length} steps`] } as const;
        }
        if (!(await areUploadsOf(tx, projectId, [body.attachmentId]))) {
          return { error: [400, "The evidence is not an upload of this project"] } as const;
        }
        await tx
          .insert(resultAttachments)
          .values({ runId: testRunId, step: body.step ?? null, attachmentId: body.attachmentId, createdBy: userId });
        await audit(tx, userId, "run.evidence", "run", testRunId, {
          projectId,
          label: `${run.uid} ${run.name}${body.step ? `: step ${body.step}` : ""}`,
        });
        return { ok: true };
      });
      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  // Finishes a run: its outcome becomes an ordinary verification result on the test case, at the version the cycle froze.
  // So a test case that was edited after the cycle started gets a result that is already out of date (ADR 0009).
  app.post(
    "/api/test-runs/:testRunId/finish",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testRunId"),
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            note: { type: "string", maxLength: 2000 },
            // Where the defect of a failed run is tracked. Defects are not managed here (ADR 0011).
            defectUrl: { type: "string", maxLength: 2000, pattern: "^https?://\\S+$" },
          },
        },
      },
    },
    async (req, reply) => {
      const { testRunId } = req.params as { testRunId: string };
      const projectId = await access(req, reply, { testRunId }, "reviewer");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const body = (req.body ?? {}) as { note?: string; defectUrl?: string };

      const result = await db.transaction(async (tx) => {
        const cycle = await lockCycle(tx, { testRunId });
        const [run] = await loadRuns(tx, eq(testRuns.id, testRunId));
        if (!cycle || !run) return noRun;
        if (!(await mayExecute(req, projectId, run.assigneeId))) return notYours;
        if (cycle.closedAt) return closed;
        if (run.finished) return { error: [409, "This run is already finished"] } as const;
        const outcome = runOutcome(run.state);
        if (!outcome) {
          const open = run.steps.filter((step) => !step.outcome).length;
          return {
            error: [400, `Record every step first: ${open} of ${run.steps.length} have no result`],
          } as const;
        }
        await tx.insert(verificationResults).values({
          itemId: run.itemId,
          revision: run.revision,
          outcome,
          runAt: new Date(),
          note: body.note?.trim() ?? "",
          source: "run",
          recordedBy: userId,
          runId: testRunId,
          defectUrl: body.defectUrl ?? null,
        });
        // The defect also shows among the test case's references, where its state is read from the other tool.
        if (body.defectUrl) {
          await tx.insert(externalReferences).values({
            itemId: run.itemId,
            url: body.defectUrl,
            title: `Defect found in ${cycle.name}`,
            kind: referenceKind(body.defectUrl),
            createdBy: userId,
          });
        }
        await audit(tx, userId, `run.finish.${outcome}`, "run", testRunId, {
          projectId,
          label: `${run.uid} ${run.name} in ${cycle.name}`,
        });
        return { outcome };
      });
      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );
}
