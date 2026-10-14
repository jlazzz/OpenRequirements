// Loads the installation and operational qualification scripts (scripts.ts) into an instance through the public
// API: one test case each in the Verification Tests set of a project, and a test plan holding them. Safe to run
// again: test cases are matched by external id and the plan by name, so a second run updates and never duplicates.
//
//   QUAL_URL=http://localhost:3000 QUAL_EMAIL=you@example.com QUAL_PASSWORD=... npm run qualification
//
// Needs an instance administrator's account (it creates the project on the first run). QUAL_PROJECT names the
// project; the default is "Qualification scripts".

import { scripts } from "./scripts.ts";

const BASE = (process.env.QUAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.QUAL_EMAIL;
const PASSWORD = process.env.QUAL_PASSWORD;
const PROJECT = process.env.QUAL_PROJECT ?? "Qualification scripts";
const PLAN = "Installation and operational qualification";

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
  if (!EMAIL || !PASSWORD) throw new Error("Set QUAL_EMAIL and QUAL_PASSWORD (an administrator's)");
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
  const set = detail.sets.find((s) => s.name === "Verification Tests");
  if (!set) throw new Error('The project has no set named "Verification Tests"');
  const [, found] = await call<{ fields: { id: string; name: string }[] }>("GET", `sets/${set.id}/items`);
  const field = (name: string) => {
    const id = found.fields.find((f) => f.name === name)?.id;
    if (!id) throw new Error(`Set "Verification Tests" has no field "${name}"`);
    return id;
  };

  const [, done] = await call<{ created: { items: number }; changed: number; unchanged: number }>(
    "POST",
    `projects/${projectId}/import`,
    {
      sets: [
        {
          setId: set.id,
          nodes: scripts.map((s) => ({
            kind: "item",
            externalId: s.id,
            ref: s.id,
            name: s.name,
            description: { type: "doc", content: [para(s.purpose)] },
            attributes: {
              [field("Status")]: "Draft",
              [field("Verification method")]: "Demonstration",
              [field("Steps")]: s.steps,
            },
          })),
        },
      ],
      links: [],
    },
  );
  console.log(`· ${done.created.items} added, ${done.changed} changed, ${done.unchanged} unchanged`);

  // The plan keeps the scripts in order, IQ before OQ. A case already in it is skipped by the route.
  const [, plans] = await call<{ plans: { id: string; name: string }[] }>("GET", `projects/${projectId}/test-plans`);
  let planId = plans.plans.find((p) => p.name === PLAN)?.id;
  if (!planId) {
    const [, made] = await call<{ id: string }>("POST", `projects/${projectId}/test-plans`, { name: PLAN });
    planId = made.id;
    console.log(`· Test plan created: ${PLAN}`);
  }
  const [, items] = await call<{ items: { id: string; name: string }[] }>("GET", `sets/${set.id}/items`);
  const byName = new Map(items.items.map((n) => [n.name, n.id]));
  for (const group of ["IQ", "OQ"] as const) {
    const itemIds = scripts
      .filter((s) => s.group === group)
      .map((s) => byName.get(s.name))
      .filter((id): id is string => id !== undefined);
    const [, added] = await call<{ added: number }>("POST", `test-plans/${planId}/cases`, { itemIds, group });
    console.log(`· ${group}: ${added.added} added to the plan`);
  }
  console.log(`· Project id: ${projectId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
