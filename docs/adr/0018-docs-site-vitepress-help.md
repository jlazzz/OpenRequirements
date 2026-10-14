# 0018. Documentation site with VitePress, served at /help

Date: 2026-10-14. Status: accepted.

## Context

The user guide is Markdown in `docs/user-guide`. Evaluators need a website, and regulated customers run the app without internet access, so the guide must also ship inside the app.

## Decision

- VitePress builds `docs/user-guide` into a static site (config in `docs/.vitepress`). It is a dev dependency only. The stack already uses Vite; local search works offline. Starlight and a hand-written page were considered and rejected: heavier, or more code to keep.
- The sidebar lists every `.md` file in the folder, titled by its first heading. A dead relative link fails the build. Links to `../adr/` are rewritten to the repository on GitHub.
- GitHub Actions (`docs.yml`) publishes the site to GitHub Pages with base `/<repo>/`.
- The Docker image builds the site with base `/help/` and the server serves it at `/help` with `@fastify/static`, outside `/api/`, no sign-in. The guide holds no project data.

## Consequences

- `npm run docs:build` needs the dev dependencies; the image builds it before pruning.
- Slice 2 (help in the app) links screens to `/help/<page>`.
