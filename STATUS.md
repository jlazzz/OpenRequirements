# Status

Last updated: 2026-10-12

Short, current picture of the project. Full checklists live in [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md) section 7. Keep this file under one screen.

## Phase

**Phase 0: Discovery & Foundations.** Exit criteria: documented user problems, at least one design partner, stack and license chosen, empty app deploys via Docker Compose.

## Done

- Repo skeleton: npm workspaces, TypeScript, Vitest (2026-10-12)
- `CLAUDE.md` (2026-10-12)
- License decided: AGPL-3.0 + CLA, [ADR 0001](docs/adr/0001-license-agpl-3.0.md) (2026-10-12)
- Pushed to GitHub, `development` branch (2026-10-12)
- Stack decided: Fastify and Drizzle, ADRs 0002 and 0003 (2026-10-12)
- Product design decided, Jama-style: [docs/DESIGN.md](docs/DESIGN.md) (2026-10-12)

## In progress

- **M0, running skeleton: built, waiting for the owner's test.** Do not start M1 until the owner has tested and given feedback.

## Next

Phase 1 is split into 8 milestones, M0 to M7, in [docs/DESIGN.md](docs/DESIGN.md) section 10. Each ends with an owner test.

1. Owner test of M0: `npm run up`, then log in from another machine on the network
2. Push and confirm the CI workflow passes on GitHub (not yet run)
3. Fold M0 feedback into `docs/DESIGN.md`
4. M1, structure and items. Decide the UI component library and router first.

## Open decisions

- Project name
- UI component library and router (before M1)
- Four design details in [docs/DESIGN.md](docs/DESIGN.md) section 11
- Beachhead confirmation after interviews
- Hosting for a public demo instance

## Not started (Phase 0, non-code)

- 8–10 user interviews
- Recruit 1–2 design partners
- Competitor teardown (StrictDoc, Tuleap, Jama/Polarion trial)
- Read the ReqIF spec and DOORS concepts
- Write the tool's own requirements spec
