# 0013: Evidence files, frozen status, reports and bulk item actions

Date: 2026-10-13
Status: Accepted

## Context

Bundle E of the [roadmap](../ROADMAP.md) (T4 and T5). Until now a result carried at most one image as evidence, the verification status of a requirement was only ever computed for now, and there were no test reports. The owner also asked for bulk edit, move and delete of items, and a dark mode. The owner asked for the bundle to be built without questions, so the choices below are the recommended ones.

## Decisions

### Evidence files are checked by content, and only images are ever shown

`domain/image.ts` became `domain/filetype.ts`. Besides PNG, JPEG, GIF and WebP it accepts PDF (`%PDF-`), zip (`PK`) and text: any file that is valid UTF-8 with no NUL byte. A name ending in `.csv` makes text CSV. What the browser says a file is, is never trusted, with one exception that makes things stricter: an upload that says it is an image must be one, because rich text shows it.

Anything that is not an image is served with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and a sandboxing CSP, so a text file that holds HTML or a script is never run. The original file name is kept in `attachments.name`, made safe (no path, no quotes or control characters). The size limit is `MAX_ATTACHMENT_MB`, default 25.

A Reviewer may now upload files, because a tester with that role attaches evidence to the runs assigned to them (ADR 0012). Before, uploading needed the Editor role.

### Evidence lives in `result_attachments`

Append-only, never removed. A row belongs to exactly one of:

- a **result** (manual results, and results from a JUnit report), or
- a **run**, optionally one of its steps. Evidence is gathered while the run is executed, before its result exists. The run's evidence is the evidence of the result the run records.

`verification_results.attachment_id` is no longer written. The migration copies each existing value into `result_attachments`; the column stays, as migrations never drop a column that old rows use. A backup older than version 6 is restored the same way.

A JUnit report takes `?attachmentId=`: an upload made first (the CI job's log, say) that becomes evidence of every result the report records.

Evidence is uploaded from the execution screen by button, by dropping a file on a step, or by pasting a screenshot, which goes to the highlighted step. A finished run takes no more evidence.

### Status is frozen in baselines

`baseline_verification` holds the verification status and the out-of-date flag of every item in a baseline that is not a test case, worked out by the same rule as everywhere else when the baseline is made. It is written once, like `baseline_links.suspect`. The baseline page shows the status then and, where it differs, the status now.

A cycle may name the baseline it verifies (`test_cycles.baseline_id`). A review of that baseline lists those cycles, so its approvers see the evidence they sign for.

### Reports are computed, nothing new is stored

- **Cycle summary:** runs by state, by group and by assignee. Worked out in the browser from the cycle's runs.
- **Plan history:** `GET /api/test-plans/:testPlanId/history`, every cycle of the plan side by side with the state each test case reached. This is how two cycles are compared.
- **Requirement verification report:** `GET /api/projects/:projectId/reports/verification`, the status of each requirement with, for the latest result of each test, who recorded it, in which cycle, its evidence and defect link.
- **Flaky tests:** `GET /api/projects/:projectId/reports/flaky`, live test cases whose last five results changed outcome more than once. The rule is `isFlaky` in `domain/verification.ts`.

Each has a CSV export. Word export waits for J2.

### Backup format version 6, files streamed out

Version 6 adds `attachments.name`, `resultAttachments`, `baselineVerification` and `testCycles.baselineId`. The download now writes the files one at a time, so a backup never holds more than one file in memory. Restore still parses the whole file in memory, up to 256 MB.

### Bulk item actions are one request, all or none

`POST /api/sets/:setId/bulk` with `action` `delete`, `move` or `edit`, for up to 500 items of one set. The set is locked as for any move or delete, and any problem with one item changes nothing at all.

- **delete** is the ordinary soft delete, one audit event per item. Each item is restored from Deleted items on its own.
- **move** puts the items last in a folder of the same set (or at its top level), in the order they have in the set.
- **edit** sets the given fields and keeps every other value. Each item that does not have the value yet gets a new version, with the Status-only flag worked out as for any save. It is refused while the person has an unsaved draft of one of the items, since that draft could not be saved afterwards.

It is one route rather than the web app calling the single-item routes in a loop, so that a failure halfway cannot leave half the selection changed.

### Dark mode

Mantine's colour scheme: it follows the system until the person picks light or dark with the button in the top bar, and the choice is kept in the browser. Colours that were written as white or light grey now use Mantine's theme variables. Printing, and saving as PDF, always uses the light scheme.

## Consequences

- Testers can attach logs and reports without asking an editor, and approvers see what was tested.
- A baseline says what was verified when it was made, which a status computed for now could not.
- Evidence cannot be removed. A wrong file stays, as a wrong result does; the record is corrected by adding, not by changing.
- A restore of a very large project still needs memory for the whole file.
