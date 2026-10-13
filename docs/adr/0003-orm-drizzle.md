# 0003: Database access uses Drizzle

Date: 2026-10-12
Status: Accepted

## Context

The outline left the ORM open between Drizzle and Prisma. The data model is unusual: append-only revision tables, baselines that point at revision IDs, and "latest revision" queries.

## Decision

Use Drizzle ORM with the `pg` driver, and drizzle-kit to generate SQL migrations.

## Why

- Drizzle stays close to SQL, which makes the revision and baseline queries easier to write and tune.
- Migrations are plain SQL files in the repo, reviewable before they run.

## Consequences

- The schema is `apps/server/src/db/schema.ts`. Column names are written in camelCase and mapped to snake_case.
- After a schema change, run `npm run db:generate` and commit the new file in `apps/server/drizzle/`. Never edit a migration that has been committed: migrations are forward-only.
- The server applies pending migrations on start.
- Tests run against a real Postgres database (`app_test`), not a substitute.
