# Qualification scripts (IQ/OQ)

A regulated customer has to show that a tool works on their own installation before relying on it. These scripts are the checks to run by hand, after installing and after every upgrade. Each step says what to do and what you must see.

They are not a certificate. They are a record you can keep: run them, write down who ran them and when, and note any step whose result differed.

## Load the scripts

You need an administrator's account.

```bash
QUAL_URL=http://localhost:3000 QUAL_EMAIL=you@example.com QUAL_PASSWORD=... npm run qualification
```

1. It creates the project "Qualification scripts" (`QUAL_PROJECT` renames it) with 12 test cases in **Verification Tests** and a test plan "Installation and operational qualification".
2. Run it again at any time. Test cases are matched by external id (`QUAL-IQ-01` and up), so a second run updates changed wording and never duplicates.
3. The wording is in `scripts/qualification/scripts.ts`. Edit it there, not in the tool: the next run overwrites a change made in the tool.

## Run them

1. Open the project, then **Test plans**, then the plan.
2. Start a cycle named after the version, for example "1.2.3 after upgrade", and describe the environment.
3. Open each run and follow the steps. Choose **Pass**, **Fail** or **Blocked** for each step. For a failed step, write what you saw. Paste a screenshot if it helps.
4. **Finish run**, then close the cycle when all are done.

The closed cycle, with who ran each step and when, is your record. Results stay when you upgrade, so the next cycle can be compared with the last.

Use a scratch project for the operations: the scripts create items, baselines and a review in a project called "Qualification scratch", not in your real ones.

## What the scripts check

| Script | Checks |
|---|---|
| IQ-01 The installation is running | The server answers and reports its version |
| IQ-02 Signing in and out | Wrong password refused, sign-in and sign-out |
| IQ-03 Creating a project | A project from a template, with its sets |
| OQ-01 Versions of an item | Versions are kept, compared and restored |
| OQ-02 Deleting and restoring an item | A deleted item keeps its ID and history |
| OQ-03 Relationships and suspect relationships | A change flags the relationship |
| OQ-04 A baseline does not change | A baseline keeps items as they were |
| OQ-05 Review and electronic signature | A signature needs the password; closing is permanent |
| OQ-06 Running a test and its result | A finished run sets verification status |
| OQ-07 Backup and restore of a project | A backup restores as a new project |
| OQ-08 The audit log is intact | **Verify audit log** reports Intact |
| OQ-09 After an upgrade | Earlier data is present and still checks out |

## After an upgrade

1. Before upgrading, write down the version and the number of events that **Verify audit log** reports.
2. Upgrade as in the [install guide](install.md#upgrade).
3. Run OQ-09, then IQ-01 and IQ-02. Run the rest of the OQ scripts for a major version, or when the changelog names a change to a feature you rely on.

## Limits

- The scripts check the installation as a person would use it. They do not replace your own checks of your configuration (single sign-on, email, HTTPS), which depend on your setup.
- The tool's own automated tests and their results are in the validation pack of each release.
