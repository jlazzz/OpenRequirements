# 0012: Test steps, plans, cycles and runs

Date: 2026-10-13
Status: Accepted

## Context

[ADR 0011](0011-test-planning-and-execution-in-scope.md) brought test planning and execution into scope. Until now a result was recorded one at a time on a test case ([ADR 0009](0009-verification-tracking.md)), with nothing to say which tests to run for a release, who runs them, or what happened on each step. The owner chose Jama's terms: Plan, Cycle, Run.

## Decisions

### Steps are a field type, not a table

A field of type `steps` holds a list of `{ action, expected }`, both plain text, at most 200 steps. The value lives in `item_revisions.attributes` like any other field, so versions, drafts, baselines, backup and the version compare work with no new table. `packages/shared/src/steps.ts` validates the value and turns it into numbered lines for tables, search and the word diff.

### An item type says it holds test cases

`item_types.role` is `test` for a type whose items are test cases. It replaces the rule "the type's name contains test" from ADR 0009. The migration sets the role on existing types by that old rule and adds a "Steps" field to each.

### Plan, cycle, run

- A **test plan** (`test_plans`, `test_plan_cases`) is a named selection of test cases in a project, in optional named groups. A plan is soft-deleted. A test case is taken out by setting `removed_at`.
- A **test cycle** (`test_cycles`) is one pass through a plan. Starting it makes one **test run** (`test_runs`) per chosen test case and freezes the test case's current version on the run. The group and position are copied onto the run, so a cycle keeps its shape when the plan changes later.
- A cycle starts with all cases, one group, or only those that failed or were blocked in the last cycle.
- A cycle is closed once, for good, like a review. Unfinished runs stay as they are and record nothing.
- Only a run's assignee ever changes.

### Step results are append-only; the run's state is computed

`step_results` holds one row per click: run, step number, pass / fail / blocked, the actual result, who and when. A step is corrected by recording it again; the latest row per step counts.

`apps/server/src/domain/testrun.ts` works out a run's state from the latest result of each step. First match wins:

1. Any step failed: **failed**.
2. Any step blocked: **blocked**.
3. Every step passed: **passed**.
4. Some steps have a result: **in progress**.
5. Otherwise: **not started**.

A test case without steps runs as one step for the whole test.

### Finishing a run writes an ordinary verification result

A run can be finished when its state is passed, failed or blocked. Finishing appends a row to `verification_results` with source `run`, the run's id, and the version the cycle froze. Nothing else about verification changes: the status per requirement is still computed by the rule in ADR 0009. A test case that was edited after the cycle started therefore gets a result that is already out of date, which is correct: the edited test has not been run.

A finished run cannot change. `verification_results.run_id` is unique, so a run records one result.

### Defects stay outside

A failed run can carry a defect link: a plain `http(s)` URL stored on the result as `defect_url`. The tool does not manage defects ([ADR 0011](0011-test-planning-and-execution-in-scope.md)). The URL moves to an external reference when those are built.

### Who may do what

- Viewer: reads plans, cycles and runs.
- Reviewer: records steps on, and finishes, the runs **assigned to them**.
- Editor: creates and changes plans, starts and closes cycles, assigns runs, and executes any run.

A tester therefore does not need the right to edit requirements. The path parameters `testPlanId`, `testCycleId` and `testRunId` are known to the permission hook, and each is in the "someone outside a project" test.

### JUnit import can fill a cycle

`POST /api/projects/:projectId/verification-results/junit?testCycleId=…`: a reported test that has an unfinished run in that cycle finishes the run, against the frozen version. Other reported tests record a result as before.

### Backup format version 5

Backups carry plans, plan cases, cycles, runs and step results. Older files still restore.

## Consequences

- No new status rule: plans and cycles are a way to produce results, and the requirement status has one source.
- A run records one result per test case, not per requirement. The limit noted in ADR 0009 still holds.
- Evidence on a step, comparing two cycles, and status frozen in a baseline are not built. They are bundle E in the [roadmap](../ROADMAP.md).
- Assigning a run notifies nobody until notifications exist (roadmap J3).
- A closed cycle is not signed. Signing with the review signature is listed as later work.
