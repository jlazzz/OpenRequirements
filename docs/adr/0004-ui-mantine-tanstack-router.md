# 0004: Web UI uses Mantine and TanStack Router

Date: 2026-10-12
Status: Accepted

## Context

M1 needs an explorer tree, tables, modals and a panel layout. The reference product is Jama Connect, which has a dense business look. M0 used plain CSS and no router.

## Decision

- UI components: Mantine (`@mantine/core`, `@mantine/hooks`).
- Routing: TanStack Router, with routes defined in code in `apps/web/src/router.tsx`.

## Why

- Mantine ships the tree, table, modal and app-shell components M1 needs, with keyboard and screen-reader support built in.
- TanStack Router is typed end to end and comes from the makers of TanStack Query, already in use.
- Code-defined routes need no build plugin or generated files.

## Consequences

- Use Mantine components and its theme before writing custom CSS.
- Every screen has a URL, so links to a project or item can be shared.
