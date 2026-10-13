# 0002: Backend is Fastify, run as TypeScript with no build step

Date: 2026-10-12
Status: Accepted

## Context

The outline left the backend framework open between Fastify and NestJS. The maintainer is one person working part-time.

## Decision

- The API server uses Fastify.
- Node runs the TypeScript sources directly (built-in type stripping). The server has no compile step, in development or in the Docker image.
- The server also serves the built web app, so an install is one app container plus Postgres.

## Why

- Fastify is small and imposes no structure, so there is less code to maintain than with NestJS.
- No build step means one fewer thing to break, and the code that runs is the code in the repo.
- One container keeps self-hosting simple.

## Consequences

- Requires Node 24 or newer.
- Relative imports use the `.ts` extension. `tsconfig.json` enforces erasable syntax only: no `enum`, no parameter properties, no namespaces.
- Request validation uses Fastify's JSON schemas. OpenAPI output is not set up yet; add `@fastify/swagger` when the public API is documented (Phase 2).
