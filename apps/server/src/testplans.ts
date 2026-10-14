import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppContext, Tx } from "./app.ts";
import {
  itemRevisions,
  itemTypes,
  nodes,
  sets,
  testCycles,
  testPlanCases,
  testPlans,
  testRuns,
  users,
} from "./db/schema.ts";
import { RUN_STATES, type RunState } from "./domain/testrun.ts";
import { loadRuns } from "./testruns.ts";

const uuid = { type: "string", format: "uuid" } as const;
const idParam = (name: string) => ({ type: "object", required: [name], properties: { [name]: uuid } }) as const;
const name = { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" } as const;
const group = { type: "string", maxLength: 100 } as const;
const itemIds = { type: "array", minItems: 1, maxItems: 5000, items: uuid } as const;
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Test plans: a named selection of test cases in groups, and the cycles started from it. */
export function testPlanRoutes({ app, db, requireUser, audit, access }: AppContext) {
  /** Locks a live plan, so changes to its cases and starting a cycle run one at a time. */
  async function lockPlan(tx: Tx, planId: string) {
    const [plan] = await tx
      .select({ id: testPlans.id, name: testPlans.name, projectId: testPlans.projectId })
      .from(testPlans)
      .where(and(eq(testPlans.id, planId), isNull(testPlans.deletedAt)))
      .for("update");
    return plan;
  }
  const gone = { error: [404, "Test plan not found"] } as const;
  /** The test cases of a plan that are still in it and not deleted, in plan order. */
  const liveCases = (tx: Tx | typeof db, planId: string) =>
    tx
      .select({ itemId: testPlanCases.itemId, group: testPlanCases.groupName })
      .from(testPlanCases)
      .innerJoin(nodes, eq(nodes.id, testPlanCases.itemId))
      .where(and(eq(testPlanCases.planId, planId), isNull(testPlanCases.removedAt), isNull(nodes.deletedAt)))
      .orderBy(testPlanCases.position);

  app.get(
    "/api/projects/:projectId/test-plans",
    { onRequest: requireUser, schema: { params: idParam("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "viewer"))) return reply;
      const plans = await db
        .select({
          id: testPlans.id,
          name: testPlans.name,
          createdAt: testPlans.createdAt,
          author: users.name,
          cases: sql<number>`(select count(*)::int from test_plan_cases c join nodes n on n.id = c.item_id
            where c.plan_id = ${testPlans.id} and c.removed_at is null and n.deleted_at is null)`,
          cycles: sql<number>`(select count(*)::int from test_cycles c where c.plan_id = ${testPlans.id})`,
          openCycles: sql<number>`(select count(*)::int from test_cycles c
            where c.plan_id = ${testPlans.id} and c.closed_at is null)`,
        })
        .from(testPlans)
        .innerJoin(users, eq(users.id, testPlans.createdBy))
        .where(and(eq(testPlans.projectId, projectId), isNull(testPlans.deletedAt)))
        .orderBy(desc(testPlans.createdAt));
      return { plans };
    },
  );

  app.post(
    "/api/projects/:projectId/test-plans",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("projectId"),
        body: { type: "object", required: ["name"], additionalProperties: false, properties: { name } },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "editor"))) return reply;
      const userId = req.user?.id as string;
      const planName = (req.body as { name: string }).name.trim();
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(testPlans)
          .values({ projectId, name: planName, createdBy: userId })
          .returning({ id: testPlans.id });
        if (!row) throw new Error("test plan insert returned no row");
        await audit(tx, userId, "plan.create", "plan", row.id, { projectId, label: planName });
        return row.id;
      });
      return reply.code(201).send({ id });
    },
  );

  // One plan: its test cases with their groups, and its cycles with how their runs stand.
  app.get(
    "/api/test-plans/:testPlanId",
    { onRequest: requireUser, schema: { params: idParam("testPlanId") } },
    async (req, reply) => {
      const { testPlanId } = req.params as { testPlanId: string };
      if (!(await access(req, reply, { testPlanId }, "viewer"))) return reply;
      const [plan] = await db
        .select({ id: testPlans.id, name: testPlans.name, createdAt: testPlans.createdAt, author: users.name })
        .from(testPlans)
        .innerJoin(users, eq(users.id, testPlans.createdBy))
        .where(and(eq(testPlans.id, testPlanId), isNull(testPlans.deletedAt)));
      if (!plan) return reply.code(404).send({ error: "Test plan not found" });
      const cycles = await db
        .select({
          id: testCycles.id,
          name: testCycles.name,
          environment: testCycles.environment,
          createdAt: testCycles.createdAt,
          closedAt: testCycles.closedAt,
        })
        .from(testCycles)
        .where(eq(testCycles.planId, testPlanId))
        .orderBy(desc(testCycles.createdAt));
      // shortcut: counts by loading every run of every cycle of the plan, count in SQL when a plan has had dozens of large cycles
      const runs = await loadRuns(db, eq(testCycles.planId, testPlanId));
      const tally = (cycleId: string) => {
        const states = Object.fromEntries(RUN_STATES.map((state) => [state, 0])) as Record<RunState, number>;
        for (const run of runs) if (run.cycleId === cycleId) states[run.state] += 1;
        return states;
      };
      return {
        plan,
        cases: await liveCases(db, testPlanId),
        cycles: cycles.map((cycle) => ({ ...cycle, runs: tally(cycle.id) })),
      };
    },
  );

  app.patch(
    "/api/test-plans/:testPlanId",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testPlanId"),
        body: { type: "object", required: ["name"], additionalProperties: false, properties: { name } },
      },
    },
    async (req, reply) => {
      const { testPlanId } = req.params as { testPlanId: string };
      const projectId = await access(req, reply, { testPlanId }, "editor");
      if (!projectId) return reply;
      const planName = (req.body as { name: string }).name.trim();
      const renamed = await db.transaction(async (tx) => {
        if (!(await lockPlan(tx, testPlanId))) return false;
        await tx.update(testPlans).set({ name: planName }).where(eq(testPlans.id, testPlanId));
        await audit(tx, req.user?.id ?? null, "plan.rename", "plan", testPlanId, { projectId, label: planName });
        return true;
      });
      if (!renamed) return reply.code(404).send({ error: "Test plan not found" });
      return { ok: true };
    },
  );

  // Soft delete: the plan leaves the list. Its cycles, runs and the results they recorded are kept.
  app.delete(
    "/api/test-plans/:testPlanId",
    { onRequest: requireUser, schema: { params: idParam("testPlanId") } },
    async (req, reply) => {
      const { testPlanId } = req.params as { testPlanId: string };
      const projectId = await access(req, reply, { testPlanId }, "editor");
      if (!projectId) return reply;
      const deleted = await db.transaction(async (tx) => {
        const plan = await lockPlan(tx, testPlanId);
        if (!plan) return false;
        await tx.update(testPlans).set({ deletedAt: new Date() }).where(eq(testPlans.id, testPlanId));
        await audit(tx, req.user?.id ?? null, "plan.delete", "plan", testPlanId, { projectId, label: plan.name });
        return true;
      });
      if (!deleted) return reply.code(404).send({ error: "Test plan not found" });
      return { ok: true };
    },
  );

  // Adds test cases to a plan, in the order given, optionally into a group. A test case already in the plan is skipped.
  app.post(
    "/api/test-plans/:testPlanId/cases",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testPlanId"),
        body: {
          type: "object",
          required: ["itemIds"],
          additionalProperties: false,
          properties: { itemIds, group },
        },
      },
    },
    async (req, reply) => {
      const { testPlanId } = req.params as { testPlanId: string };
      const projectId = await access(req, reply, { testPlanId }, "editor");
      if (!projectId) return reply;
      const body = req.body as { itemIds: string[]; group?: string };
      const wanted = [...new Set(body.itemIds)];

      const result = await db.transaction(async (tx) => {
        const plan = await lockPlan(tx, testPlanId);
        if (!plan) return gone;
        const testCases = await tx
          .select({ id: nodes.id })
          .from(nodes)
          .innerJoin(sets, eq(sets.id, nodes.setId))
          .innerJoin(itemTypes, eq(itemTypes.id, sets.itemTypeId))
          .where(
            and(
              inArray(nodes.id, wanted),
              eq(sets.projectId, projectId),
              eq(nodes.kind, "item"),
              isNull(nodes.deletedAt),
              eq(itemTypes.role, "test"),
            ),
          );
        if (testCases.length !== wanted.length) {
          return { error: [400, "Only test cases of this project can be added to a test plan"] } as const;
        }
        const existing = await tx
          .select({ itemId: testPlanCases.itemId, position: testPlanCases.position })
          .from(testPlanCases)
          .where(and(eq(testPlanCases.planId, testPlanId), isNull(testPlanCases.removedAt)));
        const have = new Set(existing.map((c) => c.itemId));
        const last = Math.max(0, ...existing.map((c) => c.position));
        const fresh = wanted.filter((id) => !have.has(id));
        for (let i = 0; i < fresh.length; i += 1000) {
          await tx.insert(testPlanCases).values(
            fresh.slice(i, i + 1000).map((itemId, index) => ({
              planId: testPlanId,
              itemId,
              groupName: body.group?.trim() ?? "",
              position: last + i + index + 1,
            })),
          );
        }
        if (fresh.length > 0) {
          await audit(tx, req.user?.id ?? null, "plan.cases.add", "plan", testPlanId, {
            projectId,
            label: `${plan.name}: ${count(fresh.length, "test case")}`,
          });
        }
        return { added: fresh.length, skipped: wanted.length - fresh.length };
      });
      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );

  // Puts test cases of the plan into a named group. An empty name takes them out of their group.
  app.patch(
    "/api/test-plans/:testPlanId/cases",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testPlanId"),
        body: {
          type: "object",
          required: ["itemIds", "group"],
          additionalProperties: false,
          properties: { itemIds, group },
        },
      },
    },
    async (req, reply) => {
      const { testPlanId } = req.params as { testPlanId: string };
      const projectId = await access(req, reply, { testPlanId }, "editor");
      if (!projectId) return reply;
      const body = req.body as { itemIds: string[]; group: string };
      const result = await db.transaction(async (tx) => {
        const plan = await lockPlan(tx, testPlanId);
        if (!plan) return gone;
        const moved = await tx
          .update(testPlanCases)
          .set({ groupName: body.group.trim() })
          .where(
            and(
              eq(testPlanCases.planId, testPlanId),
              isNull(testPlanCases.removedAt),
              inArray(testPlanCases.itemId, body.itemIds),
            ),
          )
          .returning({ id: testPlanCases.id });
        if (moved.length > 0) {
          await audit(tx, req.user?.id ?? null, "plan.cases.group", "plan", testPlanId, {
            projectId,
            label: `${plan.name}: ${count(moved.length, "test case")} to ${body.group.trim() || "no group"}`,
          });
        }
        return { grouped: moved.length };
      });
      if ("error" in result) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // Takes test cases out of a plan. The rows stay, marked as removed; cycles already started keep their runs.
  app.post(
    "/api/test-plans/:testPlanId/cases/remove",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testPlanId"),
        body: { type: "object", required: ["itemIds"], additionalProperties: false, properties: { itemIds } },
      },
    },
    async (req, reply) => {
      const { testPlanId } = req.params as { testPlanId: string };
      const projectId = await access(req, reply, { testPlanId }, "editor");
      if (!projectId) return reply;
      const body = req.body as { itemIds: string[] };
      const result = await db.transaction(async (tx) => {
        const plan = await lockPlan(tx, testPlanId);
        if (!plan) return gone;
        const removed = await tx
          .update(testPlanCases)
          .set({ removedAt: new Date() })
          .where(
            and(
              eq(testPlanCases.planId, testPlanId),
              isNull(testPlanCases.removedAt),
              inArray(testPlanCases.itemId, body.itemIds),
            ),
          )
          .returning({ id: testPlanCases.id });
        if (removed.length > 0) {
          await audit(tx, req.user?.id ?? null, "plan.cases.remove", "plan", testPlanId, {
            projectId,
            label: `${plan.name}: ${count(removed.length, "test case")}`,
          });
        }
        return { removed: removed.length };
      });
      if ("error" in result) return reply.code(result.error[0]).send({ error: result.error[1] });
      return result;
    },
  );

  // Starts a cycle: one run per chosen test case of the plan, each frozen at the test case's current version.
  app.post(
    "/api/test-plans/:testPlanId/cycles",
    {
      onRequest: requireUser,
      schema: {
        params: idParam("testPlanId"),
        body: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: {
            name,
            environment: { type: "string", maxLength: 200 },
            // Which test cases to run: all of the plan, one group, or those whose run failed or was blocked in the plan's last cycle.
            scope: { enum: ["all", "group", "failed"] },
            group,
          },
        },
      },
    },
    async (req, reply) => {
      const { testPlanId } = req.params as { testPlanId: string };
      const projectId = await access(req, reply, { testPlanId }, "editor");
      if (!projectId) return reply;
      const userId = req.user?.id as string;
      const body = req.body as { name: string; environment?: string; scope?: "all" | "group" | "failed"; group?: string };
      const cycleName = body.name.trim();

      const result = await db.transaction(async (tx) => {
        const plan = await lockPlan(tx, testPlanId);
        if (!plan) return gone;
        let cases = await liveCases(tx, testPlanId);
        if (body.scope === "group") cases = cases.filter((c) => c.group === (body.group?.trim() ?? ""));
        if (body.scope === "failed") {
          const [last] = await tx
            .select({ id: testCycles.id })
            .from(testCycles)
            .where(eq(testCycles.planId, testPlanId))
            .orderBy(desc(testCycles.createdAt))
            .limit(1);
          if (!last) return { error: [400, "This plan has no earlier cycle to take failed runs from"] } as const;
          const again = new Set(
            (await loadRuns(tx, eq(testRuns.cycleId, last.id)))
              .filter((run) => run.state === "failed" || run.state === "blocked")
              .map((run) => run.itemId),
          );
          cases = cases.filter((c) => again.has(c.itemId));
        }
        if (cases.length === 0) return { error: [400, "No test case of the plan matches: nothing to run"] } as const;

        const current = await tx
          .selectDistinctOn([itemRevisions.itemId], { itemId: itemRevisions.itemId, id: itemRevisions.id })
          .from(itemRevisions)
          .where(
            inArray(
              itemRevisions.itemId,
              cases.map((c) => c.itemId),
            ),
          )
          .orderBy(itemRevisions.itemId, desc(itemRevisions.number));
        const revisionOf = new Map(current.map((r) => [r.itemId, r.id]));
        const [cycle] = await tx
          .insert(testCycles)
          .values({
            planId: testPlanId,
            name: cycleName,
            environment: body.environment?.trim() ?? "",
            createdBy: userId,
            // The moment of the write, so "the last cycle" is the last one started even within one second.
            createdAt: sql`clock_timestamp()`,
          })
          .returning({ id: testCycles.id });
        if (!cycle) throw new Error("test cycle insert returned no row");
        const runs = cases.map((c, index) => ({
          cycleId: cycle.id,
          itemId: c.itemId,
          revisionId: revisionOf.get(c.itemId) as string,
          groupName: c.group,
          position: index + 1,
        }));
        for (let i = 0; i < runs.length; i += 1000) await tx.insert(testRuns).values(runs.slice(i, i + 1000));
        await audit(tx, userId, "cycle.create", "cycle", cycle.id, {
          projectId,
          label: `${cycleName} of ${plan.name}: ${count(runs.length, "run")}`,
        });
        return { id: cycle.id, runs: runs.length };
      });
      if (result.error) return reply.code(result.error[0]).send({ error: result.error[1] });
      return reply.code(201).send(result);
    },
  );
}
