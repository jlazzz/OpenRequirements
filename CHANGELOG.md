# Changelog

All notable changes to a release are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

How to write an entry:

- Changes go under `## [Unreleased]` as they are made, one `- ` line each, grouped under `### Added`, `### Changed`, `### Fixed` or `### Security`.
- To release, rename `Unreleased` to `## [X.Y.Z] - YYYY-MM-DD`, add a new empty `Unreleased` above it, and set `version` in the root `package.json` to `X.Y.Z`. See [docs/RELEASING.md](docs/RELEASING.md).
- Write for the person who runs the server: say what they will notice, and any step they must take to upgrade.
- A migration is always forward-only. Say so when a release adds one.

## [Unreleased]

### Added

- Numbered releases: the version is shown at `/api/version` and in the account dialog; a version tag builds, signs and publishes the image.
