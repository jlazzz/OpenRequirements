# 0026. CI main branch rule

Date: 2026-10-16. Status: accepted.

## Context

Every JUnit upload counted toward verification status. A failing feature branch turned a requirement red, and a passing one turned it green, whatever main said (ADR 0022 left this open).

## Decision

- **Setting `projects.main_branch`** (text, default empty; migration 0023). Empty keeps today's behaviour: every result counts.
- **The rule** is `countsTowardStatus` in `domain/verification.ts`: a result counts when the project has no main branch, when its CI run was on that branch, or when it has no CI run (recorded by hand or in a test run). `projectVerification` applies it in the query that picks each test case's latest result, so the requirement list, the verification page and baselines all follow it.
- **Other branches are not discarded.** Their results are recorded, listed on the test case and the CI run, and used by the flaky-test report. The CI runs list marks them "not counted".
- **Branch names match exactly**, and a run uploaded without a branch does not count once a main branch is set.
- **Route:** `PATCH /api/projects/:projectId` with `{ mainBranch }`, Admin only, audited as `project.update`. `GET .../ci-runs` gains `mainBranch`, and each run `counts` and `passRate`.
- **Trend:** pass rate per run (passed over passed plus failed) is computed from `ci_runs` counts; the CI runs page draws the latest 20 runs per pipeline as bars. Nothing new is stored.
- **Backup format version 11** adds `project.mainBranch`; older files restore with it empty. Version 9 and 10 were missing from the file's schema check and are now accepted.

## Consequences

Changing the setting changes statuses at once, with no new result and no out-of-date mark; a baseline made earlier keeps the status it froze. Matching is exact, so `main` and `origin/main` differ.
