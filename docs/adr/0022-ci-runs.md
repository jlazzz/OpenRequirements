# 0022. CI runs

Date: 2026-10-14. Status: accepted.

## Context

A JUnit upload recorded one verification result per matched test case and then forgot the upload: nobody could open "build 812" and see what it did, and unmatched test names were only in the response.

## Decision

- **Table `ci_runs`, append-only:** project, pipeline, branch, commit, build URL, counts (passed, failed, skipped, unmatched), the first 200 unmatched names, uploader, time. Migration 0020.
- **`verification_results.ci_run_id`** points at it. The JUnit route takes `pipeline`, `branch`, `commit` and `buildUrl` as optional query parameters and writes the run in the same transaction as the results. An upload that matches nothing still makes a run. The answer gains `ciRunId`.
- **Counts:** passed and failed are results recorded (several tests of one UID count once, as before). Skipped is reported tests that were skipped. Unmatched is reported tests that named no test case, so a skipped test with no UID counts in both.
- **Routes:** `GET /api/projects/:projectId/ci-runs?pipeline=&branch=` (Viewer, newest 200, plus the pipelines and branches seen) and `GET /api/ci-runs/:ciRunId` (results with their test case and the requirements it verifies through a link of role `verifies`). New path parameter `ciRunId` resolves to its project in `access.ts`. Every upload is audited as `ci_run.create`.
- **Verification stays as it was:** status is computed from results, never from runs. No branch rule yet: every upload counts.
- **Backup format version 9** adds `ciRuns` and `verificationResults.ciRunId`; older files restore with no runs.

## Consequences

Results from before this change have no run and show no link. A trend per pipeline and a main-branch-only rule are later work (roadmap T6).
