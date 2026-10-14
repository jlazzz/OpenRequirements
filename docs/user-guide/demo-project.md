# The Kestrel-EO demo project

Kestrel-EO is a fictional 175 kg Earth-observation satellite. The demo project holds its requirements and tests from mission needs down to flight software, with a design history that uses every part of the tool. Every name and number is invented.

## Load it

On any instance, with an administrator's account:

```bash
DEMO_URL=http://localhost:3000 DEMO_EMAIL=you@example.com DEMO_PASSWORD='your password' npm run demo
```

It takes a few seconds. Each run makes a new copy called "Kestrel-EO (demo)". On an instance with no account yet, the account is created as the first administrator.

It also invites seven people. They sign in as `<name>.demo@` followed by your email's domain (for example `maya.demo@example.com`), all with the password in `TEAM_PASSWORD` at the top of `scripts/demo/spacecraft.ts`. Sign in as one of them to see the tool from their side.

| Person | Role | Does |
|---|---|---|
| Maya Okafor | Editor | Systems engineer: imports, baselines, reviews |
| Lars Eriksen | Editor | ADCS lead |
| Priya Raman | Editor | Power subsystem lead |
| Tomás Ruiz | Editor | Test engineer: plans, cycles, runs |
| Hannah Becker | Reviewer | Product assurance: approves and signs reviews |
| Kenji Watanabe | Reviewer | Customer representative |
| Ana Costa | Viewer | Programme manager |

## What is in it

| Set | Items | |
|---|---|---|
| Mission Needs | 14 | What users and regulators need |
| Mission Requirements | 23 | Derived from the needs |
| System Requirements | 50 | Performance, budgets, environment, modes, safety, security |
| Subsystem Requirements | 117 | One folder per subsystem: ADCS, EPS, COMMS, C&DH, FSW, PROP, THERM, STR, PAYLOAD, GROUND |
| Interfaces | 25 | Data, electrical, mechanical, thermal and RF interfaces |
| Hazards | 18 | Each with the requirements that control it |
| Component Tests | 52 | Flight software unit tests from CI, and unit acceptance tests |
| Subsystem Tests | 36 | Engineering model qualification |
| System Tests | 17 | Functional, environmental and end-to-end tests |
| Mission Validation | 12 | Operations rehearsals, analyses and commissioning |

About 500 relationships connect them: Derived from, Verified by, Mitigated by and Interfaces with.

## A tour

1. **System Requirements, List view.** The Verification column shows Passing, Failing, Not run and Not covered. Filter by "No downstream" to find gaps.
2. **SYS-014 Power budget.** Version 2 has a table and a chart. Open History to compare it with version 1, and Relationships to see which links became suspect.
3. **Suspect links** (project menu). The changes after PDR left relationships to review. Four were already confirmed.
4. **Trace view** on Mission Needs: follow a need down to the tests that prove it.
5. **Baselines.** SRR, PDR and CDR, plus set baselines for the reviews. Compare PDR with the current state.
6. **Reviews.** "PDR review: System Requirements" is approved and signed by two approvers. "CDR review: Subsystem Requirements" is open, with one item rejected and a comment explaining why.
7. **Test plans.** "Subsystem qualification": the first cycle is closed with two failures and one blocked run, the second retests only those. "System verification": the protoflight campaign is under way against the CDR baseline, with thermal vacuum half done and evidence attached. Sign in as Tomás and open "My test runs".
8. **Reports.** Flaky tests lists one flight software test that keeps flipping between pass and fail. The requirement verification report links each requirement to its evidence.
9. **The rest.** Comments with mentions (Lars, Priya and Tomás have notifications), defect links on failed runs, code references from the flight software repository, a draft Lars has not saved yet on SUB-005, and a deleted requirement in Deleted items.
