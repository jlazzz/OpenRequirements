# 0009: Verification tracking, and where "RM, not ALM" now stops

Date: 2026-10-13
Status: Accepted. The scope section is replaced by [ADR 0011](0011-test-planning-and-execution-in-scope.md).

## Context

The outline placed verification tracking and JUnit import in Phase 3. The owner asked for them now. Until this ADR, `CLAUDE.md` said the tool does no test management at all. A requirement cannot be shown as verified without knowing whether its tests passed, so that rule is widened on purpose.

## Decisions

### Scope: results are stored; test runs are not planned or executed here

The tool stores the outcome of a test and works out a status per requirement. It does not plan test runs, assign tests to people, hold test steps to tick off, or track defects. Those stay in external tools, and results arrive from them: by hand, or from CI as a JUnit file.

### A result belongs to a test case and is append-only

`verification_results` holds one row per run: the test case, the version of it that was run, pass / fail / blocked, the run date, who recorded it, a note, optional evidence and the source (manual or JUnit). There is no route to change or remove a row. A mistake is corrected by recording another result; the latest one counts.

A result can be recorded on an item whose item type name contains "test". This is the same rule the Trace view uses for its coverage target (ADR 0008). Item types still have no "is a test" flag.

### The status rule is a pure module, and nothing is stored

`apps/server/src/domain/verification.ts` takes a requirement's tests with the latest result of each. First match wins:

1. No tests: **not covered**.
2. Any current result is a fail: **failing**.
3. Every test has a current pass: **passing**.
4. Otherwise: **not run**.

Only direct "Verified by" relationships count, with the requirement upstream and the test case downstream. The relationship type is found by its name. A blocked test counts as not run: it has verified nothing and has not failed.

The status is computed on every request, like suspect links and the trace. Every item that is not a test case gets a status.

### Out of date

A result is out of date, and ignored by the rule, when:

- the test case has a newer version than the one that was run, or
- the requirement got a new version after the result was recorded.

The requirement's version is not stored on the result. A result belongs to a test case, which can verify several requirements, and the time the result was recorded is enough to compare with the time of the requirement's current version. The cost: the record does not say "verified SYS-001 version 3" in so many words. If an audit needs that, add a table of requirement versions per result; the rule's input does not change.

The time compared is when the result was recorded on the server, not the run date a person typed.

### Evidence is an image

Evidence reuses the existing attachment upload: one image per result. The failure message of a JUnit test goes in the note. PDF and log files would need new upload rules and are left for later.

### JUnit import

`POST /api/projects/:projectId/verification-results/junit` takes the report as the raw request body (`application/xml`), needs the Editor role, and records one result per matched test case against its current version.

- A reported test matches a test case when its name or class name contains the UID, with a hyphen, an underscore or nothing between prefix and number, in any letter case.
- `failure` or `error` records a fail. `skipped` records nothing. Several tests for one UID record one result, and a failure wins.
- The answer lists what was recorded and the reported tests that matched nothing.
- The reader is hand-written in `packages/importers`. It scans for the four tags it needs and never expands entities a file declares, so there is no XML library and no entity-expansion attack to defend against.

Each imported result gets its own audit event. The activity stream shows one line per report instead.

### Personal access tokens, so CI can sign in

There were only browser session cookies. A user can now make access tokens on the account dialog. A token is sent as `Authorization: Bearer …` and acts as its user, with that user's roles. Only the SHA-256 hash is stored; the token is shown once. Revoking sets `revoked_at`; rows are kept.

A request that carries a token cannot change the password or make tokens, so a leaked token cannot make itself permanent. A request that sends an `Authorization` header is never read as a cookie session.

### Backup format version 3

Backups carry `verificationResults`. Version 1 and 2 files still restore. Tokens are account data, not project data, and are not in a backup.

## Consequences

- Results recorded against a requirement go out of date on any new version of it, even a typo fix. That is the same strictness as suspect links, and there is no "still valid" confirmation yet.
- A "Verified by" relationship made the wrong way round (test upstream) is ignored by the status.
- Baselines do not freeze verification status.
- Renaming the "Verified by" relationship type, once types are editable, would break the rule. Add a flag on the type then.
