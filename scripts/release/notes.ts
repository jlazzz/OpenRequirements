// Release-notes check, run by the release workflow and by hand: `node scripts/release/notes.ts v1.2.3 [out.md]`.
// Fails unless the tag matches package.json and CHANGELOG.md has a dated, non-empty section for it.
import { readFileSync, writeFileSync } from "node:fs";

/** The body of the `## [version] - date` section of a changelog, or an error saying what is wrong. */
export function releaseNotes(changelog: string, version: string): { notes: string } | { error: string } {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return { error: `CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section` };
  if (!/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/.test(lines[start] ?? "")) {
    return { error: `The heading of ${version} must read "## [${version}] - YYYY-MM-DD"` };
  }
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  const notes = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
  if (!/^- /m.test(notes)) return { error: `The ${version} section of CHANGELOG.md lists no changes` };
  return { notes };
}

if (import.meta.main) {
  const [tag, out] = process.argv.slice(2);
  const version = tag?.replace(/^v/, "") ?? "";
  const pkg = JSON.parse(readFileSync("package.json", "utf8")).version;
  const fail = (message: string) => {
    console.error(message);
    process.exit(1);
  };
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) fail(`"${tag}" is not a tag like v1.2.3`);
  if (version !== pkg) fail(`Tag ${tag} does not match package.json version ${pkg}`);
  const result = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version);
  if ("error" in result) fail(result.error);
  else if (out) writeFileSync(out, `${result.notes}\n`);
}
