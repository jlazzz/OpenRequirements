// Loads this tool's own requirements (requirements.ts) into an instance through the public API, as an integration
// would. Safe to run again: items are matched by external id, so a second run updates and never duplicates.
//
//   DOGFOOD_URL=http://localhost:3000 DOGFOOD_EMAIL=you@example.com DOGFOOD_PASSWORD=... npm run dogfood
//
// Needs an instance administrator's account (it creates the project on the first run). DOGFOOD_PROJECT names the
// project; the default is "Open Requirements (own requirements)". On a fresh instance the account is created.
// Tag code with the UID printed for a test (`// @req VER-001`) and run packages/cli to link it to the repository.

import { needs, requirements, tests } from "./requirements.ts";

const BASE = (process.env.DOGFOOD_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.DOGFOOD_EMAIL;
const PASSWORD = process.env.DOGFOOD_PASSWORD;
const PROJECT = process.env.DOGFOOD_PROJECT ?? "Open Requirements (own requirements)";

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

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("Set DOGFOOD_EMAIL and DOGFOOD_PASSWORD (an administrator's)");
  const login = { email: EMAIL, password: PASSWORD };
  let [code] = await call("POST", "login", login, 401);
  if (code === 401) {
    await call("POST", "setup", { ...login, name: "Administrator" });
    [code] = await call("POST", "login", login);
  }

  const [, list] = await call<{ projects: { id: string; name: string }[] }>("GET", "projects");
  let projectId = list.projects.find((p) => p.name === PROJECT)?.id;
  if (!projectId) {
    const [, created] = await call<{ project: { id: string } }>("POST", "projects", {
      name: PROJECT,
      templateId: "standard",
    });
    projectId = created.project.id;
    console.log(`· Project created: ${PROJECT}`);
  }

  const [, detail] = await call<{ sets: { id: string; name: string }[] }>("GET", `projects/${projectId}`);
  const setOf = async (name: string) => {
    const set = detail.sets.find((s) => s.name === name);
    if (!set) throw new Error(`The project has no set named "${name}"`);
    const [, items] = await call<{ fields: { id: string; name: string }[] }>("GET", `sets/${set.id}/items`);
    const attrs = (values: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(values).map(([field, value]) => {
          const found = items.fields.find((f) => f.name === field);
          if (!found) throw new Error(`Set "${name}" has no field "${field}"`);
          return [found.id, value];
        }),
      );
    return { id: set.id, attrs };
  };
  const [un, sys, ver] = [
    await setOf("User Needs"),
    await setOf("System Requirements"),
    await setOf("Verification Tests"),
  ];
  const [, lt] = await call<{ linkTypes: { id: string; name: string }[] }>("GET", `projects/${projectId}/links`);
  const type = (name: string) => {
    const id = lt.linkTypes.find((t) => t.name === name)?.id;
    if (!id) throw new Error(`No relationship type "${name}"`);
    return id;
  };

  const node = (externalId: string, name: string, text: string, attributes: Record<string, unknown>) => ({
    kind: "item" as const,
    externalId,
    ref: externalId,
    name,
    description: { type: "doc", content: [para(text)] },
    attributes,
  });
  const links = [
    ...requirements.flatMap((r) =>
      r.from.map((n) => ({ typeId: type("Derived from"), upstream: n, downstream: r.id })),
    ),
    ...tests.flatMap((t) => t.verifies.map((r) => ({ typeId: type("Verified by"), upstream: r, downstream: t.id }))),
  ];
  const body = {
    sets: [
      {
        setId: un.id,
        nodes: needs.map((n) => node(n.id, n.name, n.text, un.attrs({ Status: "Draft", Priority: n.priority }))),
      },
      {
        setId: sys.id,
        nodes: requirements.map((r) =>
          node(
            r.id,
            r.name,
            r.text,
            sys.attrs({
              Status: "Draft",
              Priority: r.priority ?? "Medium",
              "Verification method": r.method,
              ...(r.why ? { Rationale: r.why } : {}),
            }),
          ),
        ),
      },
      {
        setId: ver.id,
        nodes: tests.map((t) =>
          node(
            t.id,
            t.name,
            t.do,
            ver.attrs({
              Status: "Draft",
              "Verification method": "Test",
              "Expected result": t.expected,
              Steps: [{ action: t.do, expected: t.expected }],
            }),
          ),
        ),
      },
    ],
    links,
  };
  const [, done] = await call<{
    created: { items: number; links: number };
    changed: number;
    unchanged: number;
    items: { uid: string; name: string }[];
  }>("POST", `projects/${projectId}/import`, body);
  console.log(
    `· ${done.created.items} added, ${done.changed} changed, ${done.unchanged} unchanged, ${done.created.links} relationships added`,
  );
  console.log(`· Project id: ${projectId}`);
  const verStart = needs.length + requirements.length;
  console.log("· Test UIDs (tag code with `@req <UID>`):");
  for (const [i, t] of tests.entries())
    if (t.code) console.log(`  ${done.items[verStart + i]?.uid}  ${t.id}  ${t.code}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
