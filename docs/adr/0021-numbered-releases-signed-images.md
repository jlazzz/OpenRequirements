# 0021. Numbered releases with signed images

Date: 2026-10-14. Status: accepted.

## Context

Customers in regulated work must name the exact version they run, verify what they pulled, and upgrade on purpose. Until now an install was "whatever the repository was at". The validation pack (A2 slice 3) needs a version to name its baseline after.

## Decision

- **One source of the version:** `version` in the root `package.json`, [Semantic Versioning](https://semver.org/). The server reads it at start and returns it from the public `GET /api/version` (`{ version }`, nothing else); the account dialog shows it.
- **A tag releases.** Pushing `vX.Y.Z` runs `.github/workflows/release.yml`: `scripts/release/notes.ts` checks that the tag, `package.json` and a dated `CHANGELOG.md` section agree; lint, typecheck and tests run; the image is built from `deploy/Dockerfile` and pushed to GHCR as `X.Y.Z`; a CycloneDX SBOM of the production dependencies (`npm sbom`) is attached to the image and the GitHub release; the image digest is signed with cosign keyless through GitHub OIDC. No long-lived signing key exists.
- **Changelog:** `CHANGELOG.md`, Keep a Changelog format; its section for the version is the release notes.
- **Upgrade path:** `deploy/docker-compose.yml` takes `APP_IMAGE` and `APP_VERSION`; unset, it builds from the checkout as before. Migrations stay forward-only, so the guide says to back up first and restore to go back.
- **No `latest` tag is pushed**: an upgrade is always a version someone typed.

## Consequences

- Humans bump two version lines and the changelog heading; the workflow refuses a mismatch.
- Third-party actions are pinned by major tag, not commit SHA (the SHAs were not verifiable when this was written). Pin them by SHA before the first public release.
- Not built: the roadmap's upgrade test (start the previous release, load the demo, upgrade, check it opens). It needs a first release to upgrade from and is left for a later slice.
- Pre-release tags (`v1.0.0-rc.1`) publish a GitHub pre-release.
