// Measures the performance budgets of CLAUDE.md against a running instance, through the public API only.
//
//   PERF_URL=http://localhost:3000 PERF_EMAIL=you@example.com PERF_PASSWORD=... npm run perf
//
// Creates a new project "Perf <time>" with PERF_ITEMS requirements (default 2000), a fifth as many tests and needs,
// and relationships between them; then times the document load, search, trace and baseline creation, prints a
// table and exits 1 when a budget is missed. Needs an instance administrator's account (created on a fresh
// instance). Use a scratch instance: it leaves the project behind. The time is the API's, from a client on the
// same machine; it does not include the browser drawing the rows.

const BASE = (process.env.PERF_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.PERF_EMAIL;
const PASSWORD = process.env.PERF_PASSWORD;
const ITEMS = Number(process.env.PERF_ITEMS) || 2000;
const RUNS = 5;

let cookie = "";
async function call<T>(method: string, path: string, body?: unknown, allow?: number): Promise<[number, T]> {
  const res = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      origin: BASE,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0] ?? "";
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status >= 300 && res.status !== allow)
    throw new Error(`${method} ${path}: ${res.status} ${data?.error ?? ""}`);
  return [res.status, data as T];
}

/** Milliseconds `RUNS` calls take, slowest and median. The first call is not discarded: a cold start counts. */
async function time(run: () => Promise<unknown>): Promise<{ median: number; max: number }> {
  const taken: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await run();
    taken.push(performance.now() - start);
  }
  taken.sort((a, b) => a - b);
  return { median: taken[Math.floor(RUNS / 2)] ?? 0, max: taken[RUNS - 1] ?? 0 };
}

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const words = ["thrust", "battery", "telemetry", "antenna", "latency", "throughput", "operator", "payload", "sensor"];
const sentence = (n: number) =>
  `The system shall handle ${words[n % words.length]} and ${words[(n * 7) % words.length]} within ${(n % 90) + 10} ms under load case ${n}.`;

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("Set PERF_EMAIL and PERF_PASSWORD (an administrator's)");
  const login = { email: EMAIL, password: PASSWORD };
  const [code] = await call("POST", "login", login, 401);
  if (code === 401) {
    await call("POST", "setup", { ...login, name: "Administrator" });
    await call("POST", "login", login);
  }
  const [, created] = await call<{ project: { id: string } }>("POST", "projects", {
    name: `Perf ${new Date().toISOString()}`,
    templateId: "standard",
  });
  const pid = created.project.id;
  const [, detail] = await call<{ sets: { id: string; name: string }[] }>("GET", `projects/${pid}`);
  const setId = (name: string) => detail.sets.find((s) => s.name === name)?.id as string;
  const [, linkList] = await call<{ linkTypes: { id: string; name: string }[] }>("GET", `projects/${pid}/links`);
  const typeId = (name: string) => linkList.linkTypes.find((t) => t.name === name)?.id as string;

  const needCount = Math.max(1, Math.round(ITEMS / 10));
  const testCount = Math.max(1, Math.round(ITEMS / 4));
  const folderOf = (count: number, prefix: string, build: (n: number) => object) =>
    Array.from({ length: Math.ceil(count / 50) }, (_, f) => ({
      kind: "folder",
      name: `${prefix} ${f + 1}`,
      children: Array.from({ length: Math.min(50, count - f * 50) }, (_, i) => build(f * 50 + i)),
    }));
  const item = (prefix: string) => (n: number) => ({
    kind: "item",
    ref: `${prefix}${n}`,
    externalId: `perf:${prefix}${n}`,
    name: `${prefix === "R" ? "Requirement" : prefix === "N" ? "Need" : "Test"} ${n} ${words[n % words.length]}`,
    description: {
      type: "doc",
      content: [para(sentence(n)), para(sentence(n + 1)), para(sentence(n + 2))],
    },
    attributes: {},
  });
  const links: { typeId: string; upstream: string; downstream: string }[] = [];
  for (let n = 0; n < ITEMS; n++) {
    links.push({ typeId: typeId("Derived from"), upstream: `N${n % needCount}`, downstream: `R${n}` });
    if (n < testCount * 4)
      links.push({ typeId: typeId("Verified by"), upstream: `R${n}`, downstream: `T${n % testCount}` });
  }
  const loadStart = performance.now();
  await call("POST", `projects/${pid}/import`, {
    sets: [
      { setId: setId("User Needs"), nodes: folderOf(needCount, "Needs", item("N")) },
      { setId: setId("System Requirements"), nodes: folderOf(ITEMS, "Group", item("R")) },
      { setId: setId("Verification Tests"), nodes: folderOf(testCount, "Tests", item("T")) },
    ],
    links,
  });
  console.log(
    `Loaded ${needCount + ITEMS + testCount} items and ${links.length} relationships in ${((performance.now() - loadStart) / 1000).toFixed(1)} s`,
  );

  const reqs = setId("System Requirements");
  const rows: { name: string; budget: number | null; median: number; max: number }[] = [];
  const add = async (name: string, budget: number | null, run: () => Promise<unknown>) => {
    rows.push({ name, budget, ...(await time(run)) });
  };
  // What opening a document asks for: the project (tree) and the set's items.
  await add(`Open document (${ITEMS} items)`, 2000, async () => {
    await call("GET", `projects/${pid}`);
    await call("GET", `sets/${reqs}/items`);
  });
  // A word in most items, one in some, a UID, and nothing.
  for (const [label, q] of [
    ["common word", "shall"],
    ["two words", "telemetry latency"],
    ["UID", "SYS-1"],
    ["no match", "zzzzqq"],
  ] as const)
    await add(`Search: ${label}`, 500, () => call("GET", `projects/${pid}/search?q=${encodeURIComponent(q)}`));
  // These two have no budget in CLAUDE.md; the figures are targets of this script, reported so they are known.
  await add("Trace view of the set (2 down)", 5000, () => call("GET", `sets/${reqs}/trace?up=1&down=2`));
  let n = 0;
  await add("Create a project baseline", 10000, () =>
    call("POST", `projects/${pid}/baselines`, { name: `Perf ${++n}` }),
  );

  const pad = (s: string, w: number) => s.padEnd(w);
  console.log(`\n${pad("Measure", 36)}${pad("Budget", 10)}${pad("Median", 10)}${pad("Slowest", 10)}Result`);
  let failed = false;
  for (const r of rows) {
    const ok = r.budget === null || r.max <= r.budget;
    failed ||= !ok;
    console.log(
      `${pad(r.name, 36)}${pad(r.budget === null ? "-" : `${r.budget} ms`, 10)}${pad(`${r.median.toFixed(0)} ms`, 10)}${pad(`${r.max.toFixed(0)} ms`, 10)}${ok ? "pass" : "FAIL"}`,
    );
  }
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
