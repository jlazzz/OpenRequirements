// Scans a git repository for `@req UID` tags and sends them to a project as code references.
// Run in CI after each push to the main branch:
//   REQ_TOKEN=orq_… node packages/cli/src/main.ts --server https://req.example.com --project <project id> \
//     --repository https://github.com/acme/pump [--branch main] [--dir .]
// The project then shows, on each tagged item, a link to every file that names it. A tag that is removed from the code
// removes its reference at the next run.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { codeReferences } from "./scan.ts";

const { values } = parseArgs({
  options: {
    server: { type: "string" },
    project: { type: "string" },
    repository: { type: "string" },
    branch: { type: "string" },
    dir: { type: "string", default: "." },
  },
});
const token = process.env.REQ_TOKEN;
if (!values.server || !values.project || !values.repository || !token) {
  console.error("Needs --server, --project, --repository and an access token in REQ_TOKEN.");
  process.exit(2);
}
const dir = values.dir ?? ".";
const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", maxBuffer: 1 << 28 });
const commit = git("rev-parse", "HEAD").trim();
const branch = values.branch ?? git("rev-parse", "--abbrev-ref", "HEAD").trim();

const files = git("ls-files", "-z")
  .split("\0")
  .filter(Boolean)
  // Large files and binary files are skipped: tags live in source code.
  .filter(
    (path) =>
      statSync(join(dir, path), { throwIfNoEntry: false })?.isFile() && statSync(join(dir, path)).size < 2_000_000,
  )
  .map((path) => ({ path, text: readFileSync(join(dir, path), "utf8") }))
  .filter((file) => !file.text.includes("\0"));

const references = codeReferences(files, values.repository, branch, commit);
const res = await fetch(`${values.server.replace(/\/+$/, "")}/api/projects/${values.project}/code-references`, {
  method: "PUT",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ source: values.repository, references }),
});
const result = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`The server answered ${res.status}: ${result.error ?? result.message ?? ""}`);
  process.exit(1);
}
console.log(
  `${references.length} tags in ${files.length} files: ${result.added} added, ${result.updated} updated, ${result.removed} removed.`,
);
if (result.unknown.length) console.log(`No item has these UIDs: ${result.unknown.join(", ")}`);
