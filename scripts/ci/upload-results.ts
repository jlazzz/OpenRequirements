// Uploads a CI run's test results to a requirements instance, and the repository's `@req` tags.
//   REQ_URL=https://req.example.com REQ_TOKEN=orq_… node scripts/ci/upload-results.ts [junit.xml]
// Optional: REQ_PROJECT (project id) or REQ_PROJECT_NAME (default: the dogfood project's name).
// The run's label comes from GitHub's environment (GITHUB_SHA, GITHUB_REF_NAME, GITHUB_RUN_ID...).
// Exits non-zero on transport or auth errors only, never because tests failed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Tests carry their test case in a `// @req VER-nnn` comment above them, not in their name, and the import matches on
 * names. Put each UID in front of the name of the test it tags.
 */
export function tagJunit(xml: string, read: (file: string) => string | undefined): string {
  const tagged = new Map<string, Map<string, string>>(); // file -> test name -> UIDs
  const tags = (file: string) => {
    let names = tagged.get(file);
    if (names) return names;
    names = new Map();
    const lines = (read(file) ?? "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const uids = lines[i]?.match(/^\s*\/\/\s*@req\s+(.+)$/)?.[1]?.match(/[A-Za-z][A-Za-z0-9]*-\d+/g);
      const name = lines[i + 1]?.match(/^\s*(?:test|it)(?:\.\w+)*\(\s*(["'`])(.*?)\1/)?.[2];
      if (uids && name) names.set(name, uids.join(" "));
    }
    tagged.set(file, names);
    return names;
  };
  return xml.replace(/<testcase ([^>]*?)>/g, (whole, attrs: string) => {
    const file = attrs.match(/classname="([^"]*)"/)?.[1];
    const name = attrs.match(/ name="([^"]*)"/)?.[1];
    if (!file || name === undefined) return whole;
    const plain = name
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
    const uids = tags(file).get(plain);
    return uids ? whole.replace(` name="${name}"`, ` name="${uids} ${name}"`) : whole;
  });
}

async function main() {
  const { REQ_URL, REQ_TOKEN, REQ_PROJECT, REQ_PROJECT_NAME = "Open Requirements (own requirements)" } = process.env;
  if (!REQ_URL || !REQ_TOKEN) {
    console.error("Needs REQ_URL and REQ_TOKEN in the environment.");
    process.exit(2);
  }
  const base = REQ_URL.replace(/\/+$/, "");
  const auth = { authorization: `Bearer ${REQ_TOKEN}` };
  const fail = async (what: string, res: Response) => {
    console.error(`${what}: the server answered ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  };

  let projectId = REQ_PROJECT;
  if (!projectId) {
    const res = await fetch(`${base}/api/projects`, { headers: auth });
    if (!res.ok) return fail("Listing projects", res);
    const { projects } = (await res.json()) as { projects: { id: string; name: string }[] };
    projectId = projects.find((p) => p.name === REQ_PROJECT_NAME)?.id;
    if (!projectId) {
      console.error(
        `The token's user has no project named "${REQ_PROJECT_NAME}". Set REQ_PROJECT or REQ_PROJECT_NAME.`,
      );
      process.exit(1);
    }
  }

  const e = process.env;
  const repo = e.GITHUB_REPOSITORY;
  const query = new URLSearchParams({
    pipeline: e.GITHUB_WORKFLOW ?? "ci",
    branch: e.GITHUB_REF_NAME ?? "",
    commit: e.GITHUB_SHA ?? "",
    buildUrl:
      repo && e.GITHUB_RUN_ID
        ? `${e.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${e.GITHUB_RUN_ID}`
        : "",
  });
  const xml = tagJunit(readFileSync(process.argv[2] ?? "junit.xml", "utf8"), (f) => {
    try {
      return readFileSync(f, "utf8");
    } catch {
      return undefined;
    }
  });
  const res = await fetch(`${base}/api/projects/${projectId}/verification-results/junit?${query}`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/xml" },
    body: xml,
  });
  if (!res.ok) return fail("Uploading results", res);
  const body = (await res.json()) as { recorded?: unknown[]; unmatched?: unknown[]; ciRunId?: string };
  console.log(
    `Recorded ${body.recorded?.length ?? 0} results, ${body.unmatched?.length ?? 0} unmatched (CI run ${body.ciRunId}).`,
  );

  if (repo) {
    // The scanner has its own exit code: 1 for transport or auth errors.
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("../../packages/cli/src/main.ts", import.meta.url)),
        "--server",
        base,
        "--project",
        projectId,
        "--repository",
        `${e.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}`,
        ...(e.GITHUB_REF_NAME ? ["--branch", e.GITHUB_REF_NAME] : []),
      ],
      { stdio: "inherit", env: { ...e, REQ_TOKEN } },
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
