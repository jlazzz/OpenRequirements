// Builds the validation pack of one release from a requirements instance, through its public API, as a zip:
// the specification (a baseline named after the version) as Word, ReqIF and CSV, the traceability matrix, the
// verification status per requirement with the test results and the CI run each came from, and a manifest.
//
//   REQ_URL=https://req.example.com REQ_TOKEN=orq_… node scripts/validation-pack/validation-pack.ts [out.zip]
//
// Optional: REQ_PROJECT or REQ_PROJECT_NAME (default: the dogfood project), VERSION (default: package.json),
// IMAGE and IMAGE_DIGEST (the release's image), SBOM (path of the SBOM file, referenced by name and SHA-256),
// REQ_STRICT=1 (exit 1 when a requirement is not passing). The baseline "vX.Y.Z" is made when it does not exist yet.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toCsv } from "../../packages/importers/src/index.ts";
import { zip } from "../../packages/reqif/src/index.ts";

export type Frozen = {
  baseline: { id: string; name: string; createdAt: string };
  entries: { id: string; kind: string; uid: string | null; name: string; revision: number | null }[];
  links: { typeId: string; upstreamId: string; downstreamId: string; suspect: boolean }[];
  verification: Record<string, { status: string; outOfDate: boolean }>;
};
export type Report = {
  requirements: Record<string, { tests: { itemId: string }[] }>;
  tests: Record<
    string,
    { id: string; outcome: string; runAt: string; recordedBy?: string; source?: string; cycle?: string | null }
  >;
};
type CiRun = { run: { id: string; pipeline: string; branch: string; commit: string; buildUrl: string } };

const LABEL: Record<string, string> = {
  not_covered: "Not covered",
  not_run: "Not run",
  passing: "Passing",
  failing: "Failing",
};

/** One row per frozen relationship, with the relationship type's name and whether it was suspect then. */
export function traceabilityCsv(frozen: Frozen, typeNames: Record<string, string>): string {
  const item = new Map(frozen.entries.map((e) => [e.id, e]));
  const rows = [["Upstream ID", "Upstream name", "Relationship", "Downstream ID", "Downstream name", "Suspect"]];
  for (const l of frozen.links) {
    const [up, down] = [item.get(l.upstreamId), item.get(l.downstreamId)];
    rows.push([
      up?.uid ?? "",
      up?.name ?? "",
      typeNames[l.typeId] ?? "",
      down?.uid ?? "",
      down?.name ?? "",
      l.suspect ? "Yes" : "",
    ]);
  }
  return toCsv(rows);
}

/**
 * One row per requirement and test that verifies it: the status frozen in the baseline, then the test's latest result
 * and the CI run it came from (empty for a result recorded by hand). A requirement without tests has one row.
 */
export function verificationCsv(frozen: Frozen, report: Report, ciRunOf: Map<string, CiRun["run"]>) {
  const item = new Map(frozen.entries.map((e) => [e.id, e]));
  const rows = [
    [
      "Requirement",
      "Name",
      "Status in baseline",
      "Out of date",
      "Test case",
      "Latest outcome",
      "Run at",
      "Recorded by",
      "CI pipeline",
      "Commit",
      "Build",
    ],
  ];
  for (const e of frozen.entries) {
    const v = frozen.verification[e.id];
    const wanted = report.requirements[e.id];
    if (e.kind !== "item" || !v || !wanted) continue;
    const base = [e.uid ?? "", e.name, LABEL[v.status] ?? v.status, v.outOfDate ? "Yes" : ""];
    if (!wanted.tests.length) rows.push([...base, "", "", "", "", "", "", ""]);
    for (const { itemId } of wanted.tests) {
      const r = report.tests[itemId];
      const ci = r ? ciRunOf.get(r.id) : undefined;
      rows.push([
        ...base,
        item.get(itemId)?.uid ?? "",
        r?.outcome ?? "",
        r?.runAt ?? "",
        r?.recordedBy ?? "",
        ci?.pipeline ?? "",
        ci?.commit ?? "",
        ci?.buildUrl ?? "",
      ]);
    }
  }
  return toCsv(rows);
}

async function main() {
  const e = process.env;
  const { REQ_URL, REQ_TOKEN, REQ_PROJECT_NAME = "Open Requirements (own requirements)" } = e;
  if (!REQ_URL || !REQ_TOKEN) {
    console.error("Needs REQ_URL and REQ_TOKEN in the environment.");
    process.exit(2);
  }
  const base = REQ_URL.replace(/\/+$/, "");
  const headers = { authorization: `Bearer ${REQ_TOKEN}` };
  const get = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}/api/${path}`, { headers, ...init });
    if (!res.ok) {
      console.error(`${init?.method ?? "GET"} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    return res;
  };
  const json = async <T>(path: string, init?: RequestInit) => (await get(path, init)).json() as Promise<T>;
  const bytes = async (path: string) => new Uint8Array(await (await get(path)).arrayBuffer());

  const version =
    e.VERSION ??
    (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
  const tag = `v${version}`;
  let projectId = e.REQ_PROJECT;
  if (!projectId) {
    const { projects } = await json<{ projects: { id: string; name: string }[] }>("projects");
    projectId = projects.find((p) => p.name === REQ_PROJECT_NAME)?.id;
    if (!projectId) {
      console.error(
        `The token's user has no project named "${REQ_PROJECT_NAME}". Set REQ_PROJECT or REQ_PROJECT_NAME.`,
      );
      process.exit(1);
    }
  }

  // The specification is the project's baseline named after the release; made now when the release has none.
  const { baselines } = await json<{ baselines: { id: string; name: string; setId: string | null }[] }>(
    `projects/${projectId}/baselines`,
  );
  let baselineId = baselines.find((b) => b.name === tag && !b.setId)?.id;
  if (!baselineId) {
    const made = await json<{ id: string }>(`projects/${projectId}/baselines`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: tag }),
    });
    baselineId = made.id;
    console.log(`Baseline ${tag} made.`);
  }

  const frozen = await json<Frozen>(`baselines/${baselineId}`);
  const report = await json<Report>(`projects/${projectId}/reports/verification`);
  const { linkTypes } = await json<{ linkTypes: { id: string; name: string }[] }>(`projects/${projectId}/types`);
  const typeNames = Object.fromEntries(linkTypes.map((t) => [t.id, t.name]));

  const { runs } = await json<{ runs: { id: string }[] }>(`projects/${projectId}/ci-runs`);
  const ciRunOf = new Map<string, CiRun["run"]>();
  for (const { id } of runs) {
    const { run, results } = await json<CiRun & { results: { id: string }[] }>(`ci-runs/${id}`);
    for (const r of results) ciRunOf.set(r.id, run);
  }

  const text = (s: string) => new TextEncoder().encode(s);
  const statuses = Object.entries(frozen.verification).filter(([id]) => report.requirements[id]);
  const count = (s: string) => statuses.filter(([, v]) => v.status === s).length;
  const sbom = e.SBOM ? readFileSync(e.SBOM) : undefined;
  const manifest = {
    version,
    tag,
    generatedAt: new Date().toISOString(),
    commit: e.GITHUB_SHA ?? "",
    image: e.IMAGE ?? "<image name>",
    imageDigest: e.IMAGE_DIGEST ?? "<sha256 digest of the released image>",
    sbom: sbom ? { file: "sbom.cdx.json", sha256: createHash("sha256").update(sbom).digest("hex") } : null,
    environment: { node: process.version },
    baseline: { id: baselineId, name: frozen.baseline.name, createdAt: frozen.baseline.createdAt },
    requirements: {
      total: statuses.length,
      passing: count("passing"),
      failing: count("failing"),
      notRun: count("not_run"),
      notCovered: count("not_covered"),
      outOfDate: statuses.filter(([, v]) => v.outOfDate).length,
    },
    ciRuns: runs.length,
  };

  const files = [
    { name: "manifest.json", data: text(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: `specification-${tag}.docx`, data: await bytes(`baselines/${baselineId}/docx`) },
    { name: `specification-${tag}.reqifz`, data: await bytes(`baselines/${baselineId}/reqif?format=reqifz`) },
    { name: `items-${tag}.csv`, data: await bytes(`baselines/${baselineId}/csv`) },
    { name: "traceability.csv", data: text(traceabilityCsv(frozen, typeNames)) },
    { name: "verification.csv", data: text(verificationCsv(frozen, report, ciRunOf)) },
    ...(sbom ? [{ name: "sbom.cdx.json", data: new Uint8Array(sbom) }] : []),
  ];
  const out = process.argv[2] ?? `validation-pack-${tag}.zip`;
  writeFileSync(out, await zip(files));
  console.log(
    `${out}: ${files.length} files, ${manifest.requirements.passing}/${manifest.requirements.total} passing.`,
  );
  if (e.REQ_STRICT === "1" && manifest.requirements.passing < manifest.requirements.total) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
