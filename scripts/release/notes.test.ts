import { expect, test } from "vitest";
import { releaseNotes } from "./notes.ts";

const log = `# Changelog

## [Unreleased]

- Something new.

## [1.1.0] - 2026-11-01

### Added

- A thing.

## [1.0.0] - 2026-10-20

- First release.
`;

test("returns the notes of one version", () => {
  expect(releaseNotes(log, "1.1.0")).toEqual({ notes: "### Added\n\n- A thing." });
});

test("refuses a missing, undated or empty section", () => {
  expect(releaseNotes(log, "2.0.0")).toHaveProperty("error");
  expect(releaseNotes("## [1.0.0]\n\n- x\n", "1.0.0")).toHaveProperty("error");
  expect(releaseNotes("## [1.0.0] - 2026-10-20\n\nnothing\n", "1.0.0")).toHaveProperty("error");
});
