# 0011: Test planning and execution are in scope

Date: 2026-10-13
Status: Accepted. Replaces the scope section of [ADR 0009](0009-verification-tracking.md).

## Context

ADR 0009 allowed the tool to store test results but kept test run planning and step-by-step execution out. The owner now wants the tool to compete with dedicated test management tools as well as with Jama Connect, which has its own test management.

## Decisions

### Scope: test management is in, defect and task tracking stay out

In scope from now on:

- test cases with structured steps
- test plans, test cycles and test runs
- assigning runs to people and executing them step by step
- evidence files on results

Still out of scope: defect tracking, task tracking, sprint planning. A failed run links to a defect in an external tool (Jira, GitHub); the defect is not managed here.

The product line changes from "RM only, not ALM" to "requirements and test management, not ALM".

### What ADR 0009 still decides

Everything else in ADR 0009 stands:

- a verification result belongs to a test case and is append-only
- the verification status is computed, never stored
- the out-of-date rule
- JUnit import and personal access tokens

A finished test run records an ordinary verification result. The status rule gets no new input.

### Design is not decided here

The data model and screens are proposed in [docs/ROADMAP.md](../ROADMAP.md), track T. Each part gets its own ADR when it is built.

## Consequences

- The tool is now two products in one. Each track competes for build time with the other.
- Test execution adds mutable work state (who is assigned, what is in progress). The hard rules still hold: step results are append-only and every write is audited.
- `CLAUDE.md` and `docs/DESIGN.md` no longer say that run planning is out of scope.
