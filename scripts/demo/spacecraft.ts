// Builds "Kestrel-EO (demo)", a large example project for a fictional Earth-observation satellite, through the
// public API only, as an integration would. It shows every feature: three levels of requirements, interfaces,
// hazards, tests at five levels, baselines, signed and open reviews, test plans, cycles with step results and
// evidence, CI results with a flaky test, suspect relationships, comments, references, drafts and the trash.
//
//   DEMO_URL=http://localhost:3000 DEMO_EMAIL=you@example.com DEMO_PASSWORD=... node scripts/demo/spacecraft.ts
//
// DEMO_EMAIL and DEMO_PASSWORD are an instance administrator's; on a fresh instance the account is created.
// Seven demo people are invited, all with the password in TEAM_PASSWORD below. Run it again for a second copy.
// The content is in spacecraft-data.ts.

import { crc32, deflateSync } from "node:zlib";
import {
  componentTests,
  type Folder,
  fswUnitTests,
  hazards,
  type Item,
  interfaces,
  missionNeeds,
  missionRequirements,
  subsystemRequirements,
  subsystemTests,
  systemRequirements,
  systemTests,
  validationTests,
} from "./spacecraft-data.ts";

const BASE = (process.env.DEMO_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.DEMO_EMAIL;
const ADMIN_PASSWORD = process.env.DEMO_PASSWORD;
// Demo only: every invited person gets this password, so the owner can sign in as any of them.
const TEAM_PASSWORD = "kestrel-demo-2026";
const PROJECT = "Kestrel-EO (demo)";

// ── API client ───────────────────────────────────────────────────────────────────────────────────────────────

type Person = { id: string; name: string; email: string; call: Call };
// biome-ignore lint/suspicious/noExplicitAny: a script reading many response shapes types only the ones it needs
type Call = <T = any>(
  method: string,
  path: string,
  body?: unknown,
  raw?: { type: string; data: Buffer | string },
) => Promise<T>;

function client(): { call: Call; status: <T>(method: string, path: string, body?: unknown) => Promise<[number, T]> } {
  let cookie = "";
  const status = async <T>(
    method: string,
    path: string,
    body?: unknown,
    raw?: { type: string; data: Buffer | string },
  ) => {
    const res = await fetch(`${BASE}/api/${path}`, {
      method,
      headers: {
        ...(raw ? { "content-type": raw.type } : body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        origin: BASE,
      },
      body: raw
        ? typeof raw.data === "string"
          ? raw.data
          : new Uint8Array(raw.data)
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0] ?? "";
    const text = await res.text();
    return [res.status, (text ? JSON.parse(text) : null) as T] as [number, T];
  };
  const call: Call = async (method, path, body, raw) => {
    const [code, data] = await status<{ error?: string; message?: string }>(method, path, body, raw);
    if (code >= 300) throw new Error(`${method} ${path}: ${code} ${data?.error ?? data?.message ?? ""}`);
    return data as never;
  };
  return { call, status };
}

async function signIn(email: string, password: string) {
  const c = client();
  let [code, data] = await c.status<{ user: { id: string; name: string } }>("POST", "login", { email, password });
  // Sign-ins are limited per minute: wait for the window to pass.
  if (code === 429) {
    console.log("· Waiting a minute for the sign-in limit");
    await new Promise((done) => setTimeout(done, 61_000));
    [code, data] = await c.status<{ user: { id: string; name: string } }>("POST", "login", { email, password });
  }
  return code === 200 ? { ...data.user, email, call: c.call } : null;
}

// ── Rich text from the plain text in the data file ───────────────────────────────────────────────────────────

type Node = { type: string; text?: string; content?: Node[]; attrs?: Record<string, unknown> };
const textNode = (text: string): Node[] => (text ? [{ type: "text", text }] : []);
const para = (text: string): Node => ({ type: "paragraph", content: textNode(text) });

function doc(text = "", image?: string): Node {
  const content: Node[] = [];
  let table: string[][] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (table.length) {
      content.push({
        type: "table",
        content: table.map((cells, row) => ({
          type: "tableRow",
          content: cells.map((cell) => ({ type: row === 0 ? "tableHeader" : "tableCell", content: [para(cell)] })),
        })),
      });
    }
    if (bullets.length) {
      content.push({ type: "bulletList", content: bullets.map((b) => ({ type: "listItem", content: [para(b)] })) });
    }
    table = [];
    bullets = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("| ")) {
      table.push(
        line
          .slice(2)
          .split(" | ")
          .map((cell) => cell.replace(/ \|$/, "").trim()),
      );
      continue;
    }
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (line.startsWith("$$")) content.push({ type: "blockMath", attrs: { latex: line.slice(2) } });
    else if (line.trim()) content.push(para(line));
  }
  flush();
  if (image) content.push({ type: "paragraph", content: [{ type: "image", attrs: { src: image } }] });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

// ── Generated evidence files ─────────────────────────────────────────────────────────────────────────────────

/** A PNG of bars, one per value, scaled to the largest. Enough for a chart in a requirement or as test evidence. */
function barChart(values: number[], colors: [number, number, number][]): Buffer {
  const width = 480;
  const height = 240;
  const max = Math.max(...values);
  const slot = Math.floor(width / values.length);
  const raw = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const bar = Math.floor(x / slot);
      const top = height - 20 - Math.round(((values[bar] ?? 0) / max) * (height - 40));
      const inside = bar < values.length && x % slot > 6 && x % slot < slot - 6 && y >= top && y < height - 20;
      const axis = y === height - 20;
      const [r, g, b] = axis ? [80, 80, 80] : inside ? (colors[bar % colors.length] ?? [0, 0, 0]) : [255, 255, 255];
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A one-page PDF with lines of text. */
function pdf(lines: string[]): Buffer {
  const pdfText = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const stream = `BT /F1 11 Tf 56 780 Td 14 TL ${lines.map((l) => `(${pdfText(l)}) '`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const csv = (header: string, rows: (string | number)[][]) => `${header}\n${rows.map((r) => r.join(",")).join("\n")}\n`;

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────────────────

const team = [
  { key: "maya", name: "Maya Okafor", role: "editor", title: "Systems engineer" },
  { key: "lars", name: "Lars Eriksen", role: "editor", title: "ADCS lead" },
  { key: "priya", name: "Priya Raman", role: "editor", title: "Power subsystem lead" },
  { key: "tomas", name: "Tomás Ruiz", role: "editor", title: "AIT test engineer" },
  { key: "hannah", name: "Hannah Becker", role: "reviewer", title: "Product assurance" },
  { key: "kenji", name: "Kenji Watanabe", role: "reviewer", title: "Customer representative" },
  { key: "ana", name: "Ana Costa", role: "viewer", title: "Programme manager" },
] as const;
type Key = (typeof team)[number]["key"];

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Set DEMO_EMAIL and DEMO_PASSWORD (an administrator's)");
  const log = (text: string) => console.log(`· ${text}`);

  // An instance with no account yet gets its first administrator.
  let admin = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!admin) {
    const c = client();
    const [code] = await c.status("POST", "setup", {
      email: ADMIN_EMAIL,
      name: "Administrator",
      password: ADMIN_PASSWORD,
    });
    if (code >= 300) throw new Error("Could not sign in with DEMO_EMAIL and DEMO_PASSWORD");
    admin = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!admin) throw new Error("Sign-in failed after setup");
  }
  const domain = ADMIN_EMAIL.split("@")[1] ?? "example.com";

  // People: invited once, reused on later runs.
  const people = {} as Record<Key, Person>;
  for (const member of team) {
    const email = `${member.key}.demo@${domain}`;
    let person = await signIn(email, TEAM_PASSWORD);
    if (!person) {
      const invite = await admin.call<{ token: string }>("POST", "invitations", { email });
      // Accepting signs the new person in.
      const c = client();
      const { user } = await c.call<{ user: { id: string; name: string } }>("POST", "invitations/accept", {
        token: invite.token,
        name: member.name,
        password: TEAM_PASSWORD,
      });
      person = { ...user, email, call: c.call };
    }
    people[member.key] = person;
  }
  const { maya, lars, priya, tomas, hannah, kenji } = people;
  log(`People ready: ${team.map((m) => `${m.name} (${m.title}, ${m.role})`).join(", ")}`);

  const { project } = await admin.call<{ project: { id: string } }>("POST", "projects", {
    name: PROJECT,
    templateId: "spacecraft",
  });
  const pid = project.id;
  for (const member of team) {
    await admin.call("PUT", `projects/${pid}/members/${people[member.key].id}`, { role: member.role });
  }
  log(`Project created: ${PROJECT}`);

  const { sets } = await admin.call<{ sets: { id: string; name: string }[] }>("GET", `projects/${pid}`);
  const setId = (name: string) => {
    const found = sets.find((s) => s.name === name);
    if (!found) throw new Error(`No set named ${name}`);
    return found.id;
  };
  const fieldsOf = new Map<string, { id: string; name: string }[]>();
  for (const set of sets) fieldsOf.set(set.id, (await admin.call("GET", `sets/${set.id}/items`)).fields);
  const attrs = (set: string, values: Record<string, unknown>) => {
    const fields = fieldsOf.get(set) ?? [];
    return Object.fromEntries(
      Object.entries(values).map(([name, value]) => {
        const field = fields.find((f) => f.name === name);
        if (!field) throw new Error(`No field ${name}`);
        return [field.id, value];
      }),
    );
  };
  const { linkTypes } = await admin.call<{ linkTypes: { id: string; name: string }[] }>("GET", `projects/${pid}/links`);
  const linkType = (name: string) => linkTypes.find((t) => t.name === name)?.id ?? "";

  // ── One import: every folder, item and relationship ──────────────────────────────────────────────────────

  const parts: { set: string; folders: { folder: string; items: (Item & Record<string, unknown>)[] }[] }[] = [
    { set: "Mission Needs", folders: missionNeeds },
    { set: "Mission Requirements", folders: missionRequirements },
    { set: "System Requirements", folders: systemRequirements },
    { set: "Subsystem Requirements", folders: subsystemRequirements },
    { set: "Interfaces", folders: interfaces },
    { set: "Hazards", folders: hazards },
    {
      set: "Component Tests",
      folders: [{ folder: "Flight software unit tests (CI)", items: fswUnitTests }, ...componentTests],
    },
    { set: "Subsystem Tests", folders: subsystemTests },
    { set: "System Tests", folders: systemTests },
    { set: "Mission Validation", folders: validationTests },
  ];
  const order: { ref: string; set: string }[] = [];
  const links: { typeId: string; upstream: string; downstream: string }[] = [];
  const pairs = new Set<string>();
  const link = (type: string, upstream: string, downstream: string) => {
    const pair = [upstream, downstream].sort().join();
    if (pairs.has(pair)) return;
    pairs.add(pair);
    links.push({ typeId: linkType(type), upstream, downstream });
  };
  for (const part of parts) {
    for (const folder of part.folders) {
      for (const item of folder.items) {
        order.push({ ref: item.ref, set: part.set });
        for (const up of item.from ?? []) link("Derived from", up, item.ref);
        for (const up of (item.verifies as string[] | undefined) ?? []) link("Verified by", up, item.ref);
        for (const down of (item.mitigates as string[] | undefined) ?? []) link("Mitigated by", item.ref, down);
        for (const down of (item.links as string[] | undefined) ?? []) link("Interfaces with", item.ref, down);
      }
    }
  }
  const known = new Set(order.map((o) => o.ref));
  for (const l of links) {
    for (const ref of [l.upstream, l.downstream]) if (!known.has(ref)) throw new Error(`Unknown ref ${ref}`);
  }

  const imported = await maya.call<{ items: { uid: string }[] }>("POST", `projects/${pid}/import`, {
    sets: parts.map((part) => {
      const id = setId(part.set);
      return {
        setId: id,
        nodes: part.folders.map((folder) => ({
          kind: "folder",
          name: folder.folder,
          children: folder.items.map((item) => ({
            kind: "item",
            ref: item.ref,
            externalId: `kestrel:${item.ref}`,
            name: item.name,
            description: doc(item.text),
            attributes: attrs(id, item.attrs),
          })),
        })),
      };
    }),
    links,
  });
  // The import answers in the order the items were sent.
  const uidOf = new Map(order.map((o, i) => [o.ref, imported.items[i]?.uid ?? ""]));
  const idOf = new Map<string, string>();
  for (const set of sets) {
    const { items } = await admin.call<{ items: { id: string; uid: string }[] }>("GET", `sets/${set.id}/items`);
    for (const item of items) idOf.set(item.uid, item.id);
  }
  const id = (ref: string) => {
    const found = idOf.get(uidOf.get(ref) ?? "");
    if (!found) throw new Error(`No item for ${ref}`);
    return found;
  };
  const uid = (ref: string) => uidOf.get(ref) ?? ref;
  log(`Imported ${order.length} items and ${links.length} relationships`);

  // A new version of an item, by whoever changes it.
  const revise = async (
    who: Person,
    ref: string,
    reason: string,
    change: { name?: string; text?: string; image?: string; attrs?: Record<string, unknown> },
  ) => {
    const { item } = await who.call("GET", `items/${id(ref)}`);
    await who.call("POST", `items/${id(ref)}/revisions`, {
      baseRevision: item.revision,
      name: change.name ?? item.name,
      description: change.text !== undefined ? doc(change.text, change.image) : item.description,
      attributes: { ...item.attributes, ...(change.attrs ? attrs(item.setId, change.attrs) : {}) },
      changeReason: reason,
    });
  };
  const upload = async (who: Person, name: string, type: string, data: Buffer | string) =>
    (await who.call<{ id: string; src: string }>(
      "POST",
      `projects/${pid}/attachments?name=${encodeURIComponent(name)}`,
      undefined,
      {
        type,
        data,
      },
    )) as { id: string; src: string };

  // ── SRR: the first baseline ──────────────────────────────────────────────────────────────────────────────

  await maya.call("POST", `projects/${pid}/baselines`, {
    name: "SRR: System Requirements Review",
  });
  log("Baseline: SRR");

  // ── Component level: CI results for flight software, manual results for unit acceptance ─────────────────

  // Five CI runs. U17 flips between pass and fail (a flaky test); U16 starts failing in the last two.
  for (let run = 1; run <= 5; run++) {
    const cases = fswUnitTests.map((t) => {
      const failing = (t.ref === "U17" && run % 2 === 0) || (t.ref === "U16" && run >= 4);
      const name = `${uid(t.ref)} ${t.name}`.replace(/[<&"]/g, "");
      return failing
        ? `<testcase classname="fsw" name="${name}" time="0.42"><failure message="assertion failed">${
            t.ref === "U16" ? "boot to safe mode took 63.4 s, limit 60 s" : "propagated error 131 m, limit 100 m"
          }</failure></testcase>`
        : `<testcase classname="fsw" name="${name}" time="0.05"/>`;
    });
    const xml = `<?xml version="1.0"?><testsuites><testsuite name="kestrel-fsw build ${1040 + run}" tests="${cases.length}">${cases.join("")}</testsuite></testsuites>`;
    await tomas.call("POST", `projects/${pid}/verification-results/junit`, undefined, {
      type: "application/xml",
      data: xml,
    });
  }
  log("CI: five JUnit reports for the flight software unit tests");

  const batteryCsv = csv(
    "cycle,capacity_wh,min_cell_v,max_cell_v,spread_mv",
    [1, 2, 3, 4, 5].map((c) => [c, 968 - c * 0.6, 2.701, 4.199, 12 + c]),
  );
  const batteryLog = await upload(priya, "battery-capacity-FM1.csv", "text/csv", batteryCsv);
  const results: [string, "pass" | "fail" | "blocked", string, string, string[]?][] = [
    ["CA1", "pass", "2026-03-04", "Head SN 1043: 1.6 arcsec cross-boresight."],
    ["CA2", "pass", "2026-03-06", "ARW 0.0031 °/√h."],
    ["CA3", "pass", "2026-03-10", "All four wheels within 3 % of torque."],
    ["CA4", "fail", "2026-03-12", "Wheel 3 shows a 1.8 µrad peak at 4,200 rpm. Isolator to be retuned."],
    ["CA4", "pass", "2026-04-02", "After isolator retune: 0.7 µrad worst case."],
    ["CA5", "pass", "2026-03-11", "Dipole 15.8 Am² on all rods."],
    ["CA7", "pass", "2026-03-18", "Lock in 64 s; 6.2 m (3σ)."],
    ["CA8", "pass", "2026-03-20", "All 16 panels within 1.4 % of prediction."],
    ["CA9", "pass", "2026-03-25", "968 Wh measured; cell spread 17 mV.", [batteryLog.id]],
    ["CA10", "pass", "2026-04-08", "2.3 W, EVM 5.9 %."],
    ["CA12", "blocked", "2026-04-10", "Test set firmware did not support the 1.2 Gbit/s pattern."],
    ["CA13", "pass", "2026-04-15", "168 h burn-in without failure."],
    ["CA14", "pass", "2026-04-22", "Thrust 0.98 N; minimum impulse bit 0.041 Ns."],
    ["CA15", "pass", "2026-02-27", "Held 36 bar for 5 min; no indication."],
  ];
  for (const [ref, outcome, date, note, evidence] of results) {
    await tomas.call("POST", `items/${id(ref)}/results`, {
      outcome,
      runAt: `${date}T10:00:00Z`,
      note,
      ...(evidence ? { attachmentIds: evidence } : {}),
    });
  }
  log("Unit acceptance results recorded");

  // ── Subsystem level: engineering model qualification, then a retest of what failed ──────────────────────

  const plan = async (name: string, folders: Folder[]) => {
    const { id: planId } = await tomas.call<{ id: string }>("POST", `projects/${pid}/test-plans`, { name });
    for (const folder of folders) {
      await tomas.call("POST", `test-plans/${planId}/cases`, {
        itemIds: folder.items.map((t) => id(t.ref)),
        group: folder.folder,
      });
    }
    return planId;
  };
  type Run = { id: string; uid: string; group: string; total: number };
  const cycle = async (planId: string, body: Record<string, unknown>) => {
    const created = await tomas.call<{ id: string }>("POST", `test-plans/${planId}/cycles`, body);
    const { runs } = await tomas.call<{ runs: Run[] }>("GET", `test-cycles/${created.id}`);
    return { id: created.id, runs, run: (ref: string) => runs.find((r) => r.uid === uid(ref)) as Run };
  };
  // Every step passes, except where `stop` says which step ends the run, how, and what was seen.
  const execute = async (
    who: Person,
    run: Run,
    stop?: { step: number; outcome: "fail" | "blocked"; actual: string; defect?: string },
    finish = true,
  ) => {
    const last = stop ? stop.step - 1 : run.total;
    if (last > 0) {
      await who.call("POST", `test-runs/${run.id}/steps`, {
        steps: Array.from({ length: last }, (_, i) => i + 1),
        outcome: "pass",
      });
    }
    if (stop) {
      await who.call("POST", `test-runs/${run.id}/steps`, {
        steps: [stop.step],
        outcome: stop.outcome,
        actual: stop.actual,
      });
    }
    if (finish) {
      await who.call("POST", `test-runs/${run.id}/finish`, {
        ...(stop?.defect ? { defectUrl: stop.defect } : {}),
        ...(stop ? { note: stop.actual } : {}),
      });
    }
  };
  const assign = (cycleId: string, runs: Run[], who: Person) =>
    runs.length
      ? tomas.call("POST", `test-cycles/${cycleId}/assign`, { runIds: runs.map((r) => r.id), assigneeId: who.id })
      : null;

  const subsystemPlan = await plan("Subsystem qualification (engineering model)", subsystemTests);
  const em = await cycle(subsystemPlan, {
    name: "EM qualification campaign",
    environment: "Engineering model, integration lab",
  });
  await assign(
    em.id,
    em.runs.filter((r) => r.group === "ADCS"),
    lars,
  );
  await assign(
    em.id,
    em.runs.filter((r) => r.group === "EPS"),
    priya,
  );
  await assign(
    em.id,
    em.runs.filter((r) => r.group !== "ADCS" && r.group !== "EPS"),
    tomas,
  );
  const emStops: Record<string, Parameters<typeof execute>[2]> = {
    SA4: {
      step: 2,
      outcome: "fail",
      actual: "Sun acquired after 41 min (limit 30 min).",
      defect: "https://jira.example.com/browse/KEO-218",
    },
    SE2: {
      step: 3,
      outcome: "fail",
      actual: "Safe mode with one wing failed is power negative by 6 W in the longest eclipse.",
      defect: "https://jira.example.com/browse/KEO-231",
    },
    SC2: { step: 1, outcome: "blocked", actual: "Programmable attenuator out of calibration." },
  };
  const owner = (group: string) => (group === "ADCS" ? lars : group === "EPS" ? priya : tomas);
  for (const run of em.runs) {
    const ref = [...uidOf].find(([, u]) => u === run.uid)?.[0] ?? "";
    await execute(owner(run.group), run, emStops[ref]);
  }
  const powerLog = await upload(
    priya,
    "SE2-safe-mode-power.csv",
    "text/csv",
    csv(
      "minute,generation_w,consumption_w,soc_pct",
      Array.from({ length: 95 }, (_, m) => [m, m > 60 ? 0 : 118, 124, Math.round(78 - m * 0.21)]),
    ),
  );
  const sunPlot = await upload(
    lars,
    "SA4-sun-angle.png",
    "image/png",
    barChart([88, 74, 61, 50, 38, 27, 19, 14, 11], [[220, 90, 60]]),
  );
  await maya.call("POST", `test-cycles/${em.id}/close`);
  log("Cycle closed: EM qualification campaign (2 failed, 1 blocked)");

  const retest = await cycle(subsystemPlan, {
    name: "EM retest of failed runs",
    scope: "failed",
    environment: "Engineering model",
  });
  await assign(retest.id, retest.runs, tomas);
  await execute(tomas, retest.run("SA4"), undefined, false);
  await tomas.call("POST", `test-runs/${retest.run("SA4").id}/attachments`, { attachmentId: sunPlot.id, step: 2 });
  await tomas.call("POST", `test-runs/${retest.run("SA4").id}/finish`, {
    note: "Sun acquired in 26 min after the gain retune.",
  });
  await tomas.call("POST", `test-runs/${retest.run("SE2").id}/attachments`, { attachmentId: powerLog.id });
  await execute(tomas, retest.run("SC2"), undefined, false);
  log("Cycle open: EM retest (one passed, one waiting to finish, one not started)");

  // ── PDR: baselines and a signed review of the system requirements ───────────────────────────────────────

  await maya.call("POST", `projects/${pid}/baselines`, { name: "PDR: Preliminary Design Review" });
  const pdrSys = await maya.call<{ id: string }>("POST", `projects/${pid}/baselines`, {
    name: "PDR: System Requirements",
    setId: setId("System Requirements"),
  });
  const pdrReview = await maya.call<{ id: string }>("POST", `projects/${pid}/reviews`, {
    name: "PDR review: System Requirements",
    baselineId: pdrSys.id,
    reviewers: [kenji.id, lars.id, priya.id],
    approvers: [hannah.id, maya.id],
  });
  const systemIds = systemRequirements.flatMap((f) => f.items.map((i) => id(i.ref)));
  await kenji.call("POST", `reviews/${pdrReview.id}/marks`, { itemIds: systemIds, mark: "reviewed" });
  await lars.call("POST", `reviews/${pdrReview.id}/marks`, { itemIds: systemIds.slice(0, 12), mark: "reviewed" });
  await priya.call("POST", `reviews/${pdrReview.id}/marks`, { itemIds: systemIds.slice(12, 19), mark: "reviewed" });
  await kenji.call("POST", `items/${id("S2")}/comments`, {
    body: "@Lars Eriksen is 2 µrad achievable with the current wheels, or does this assume the isolators?",
    reviewId: pdrReview.id,
  });
  await lars.call("POST", `items/${id("S2")}/comments`, {
    body: "It assumes the isolators. CA4 showed 1.8 µrad without them, 0.7 µrad after the retune.",
    reviewId: pdrReview.id,
  });
  await hannah.call("POST", `items/${id("S40")}/comments`, {
    body: "Two independent protections per failure case is consistent with the launch provider's battery safety requirements.",
    reviewId: pdrReview.id,
  });
  for (const approver of [hannah, maya]) {
    await approver.call("POST", `reviews/${pdrReview.id}/marks`, { itemIds: systemIds, mark: "approved" });
    await approver.call("POST", `reviews/${pdrReview.id}/sign`, { password: TEAM_PASSWORD });
  }
  await maya.call("POST", `reviews/${pdrReview.id}/close`, { setStatus: true });
  log("Review signed and closed: PDR review of the System Requirements");

  // ── Design changes after PDR: new versions, suspect relationships, out-of-date results ──────────────────

  const powerChart = await upload(
    maya,
    "power-budget.png",
    "image/png",
    barChart(
      [85, 42, 38, 30, 24, 22, 18],
      [
        [46, 110, 200],
        [60, 160, 90],
        [230, 150, 40],
        [150, 90, 200],
        [200, 70, 70],
        [90, 170, 190],
        [130, 130, 130],
      ],
    ),
  );
  await revise(maya, "S14", "CDR update after EM test SE2 (KEO-231): safe-mode case added", {
    text: "In the worst-case imaging orbit at end of life, orbit-average power generation shall be at least 1.2 times orbit-average consumption. In safe mode with one wing failed, it shall be at least 1.05 times.\n\n| Consumer | Imaging orbit (W) |\n| Payload | 85 |\n| ADCS | 42 |\n| C&DH | 38 |\n| COMMS | 30 |\n| Thermal | 24 |\n| EPS losses | 22 |\n| Propulsion | 18 |\n| Total | 259 |\nThe chart shows the same consumers in the same order.",
    image: powerChart.src,
    attrs: { "Margin (%)": 18 },
  });
  await revise(priya, "E3", "CDR action EPS-04: capacity raised to close the safe-mode case", {
    text: "The Li-ion battery shall store at least 1,150 Wh at beginning of life, with depth of discharge kept below 30 % in nominal operations.",
  });
  await revise(priya, "E7", "Clarified the eclipse season covered", {
    text: "The satellite shall stay power positive in safe mode with one array wing failed, in every eclipse season of the 5-year mission.",
    attrs: { "Verification method": "Test" },
  });
  await revise(lars, "A9", "Waiver W-012 agreed with the customer: magnetorquer-only acquisition may take 45 minutes", {
    text: "Safe mode sun pointing shall work with reaction wheels within 30 minutes, or with magnetorquers alone within 45 minutes if the wheels have failed.",
  });
  await revise(lars, "A8", "Tightened after the agility trade-off", {
    text: "A 30° roll slew shall complete within 40 s and settle to imaging stability within 15 s.",
  });
  await revise(tomas, "EV4", "Eight cycles to match the launch provider's qualification rule", {
    name: "Thermal vacuum, eight cycles",
  });
  await revise(maya, "MR7", "Customer change request CR-007: capacity raised", {
    text: "The mission shall image at least 180,000 km² of land per day.",
  });
  log("New versions: S14, E3, E7, A9, A8, EV4, MR7 (relationships become suspect, some results go out of date)");

  // Maya checks the relationships around S14 and confirms the ones the change does not affect.
  const { links: live } = await maya.call<{
    links: {
      id: string;
      upstreamId: string;
      downstreamId: string;
      current: { upstream: number; downstream: number };
      changed: { upstream: boolean; downstream: boolean };
    }[];
  }>("GET", `projects/${pid}/links`);
  const confirm = live.filter(
    (l) =>
      (l.changed.upstream || l.changed.downstream) &&
      ((l.downstreamId === id("S14") && l.upstreamId === id("MR10")) ||
        (l.upstreamId === id("S14") && [id("E2"), id("E4"), id("E11")].includes(l.downstreamId))),
  );
  await maya.call("POST", `projects/${pid}/links/confirm`, {
    links: confirm.map((l) => ({
      id: l.id,
      upstreamRevision: l.current.upstream,
      downstreamRevision: l.current.downstream,
    })),
  });
  log(`Confirmed ${confirm.length} suspect relationships; the rest stay suspect for review`);

  // Ground segment requirements move from Draft to In review together: one bulk edit, status-only versions.
  const groundIds = subsystemRequirements
    .find((f) => f.folder.startsWith("GROUND"))
    ?.items.map((i) => id(i.ref)) as string[];
  await maya.call("POST", `sets/${setId("Subsystem Requirements")}/bulk`, {
    action: "edit",
    itemIds: groundIds,
    attributes: attrs(setId("Subsystem Requirements"), { Status: "In review" }),
    changeReason: "Ground segment PDR closed",
  });

  // ── CDR: baselines and a review still in progress ───────────────────────────────────────────────────────

  const cdr = await maya.call<{ id: string }>("POST", `projects/${pid}/baselines`, {
    name: "CDR: Critical Design Review",
  });
  const cdrSub = await maya.call<{ id: string }>("POST", `projects/${pid}/baselines`, {
    name: "CDR: Subsystem Requirements",
    setId: setId("Subsystem Requirements"),
  });
  const cdrReview = await maya.call<{ id: string }>("POST", `projects/${pid}/reviews`, {
    name: "CDR review: Subsystem Requirements",
    baselineId: cdrSub.id,
    reviewers: [kenji.id, tomas.id],
    approvers: [hannah.id],
  });
  const subIds = subsystemRequirements.flatMap((f) => f.items.map((i) => id(i.ref)));
  await kenji.call("POST", `reviews/${cdrReview.id}/marks`, { itemIds: subIds.slice(0, 45), mark: "reviewed" });
  await tomas.call("POST", `reviews/${cdrReview.id}/marks`, { itemIds: subIds.slice(0, 20), mark: "reviewed" });
  await hannah.call("POST", `reviews/${cdrReview.id}/marks`, {
    itemIds: subIds.slice(0, 30).filter((i) => i !== id("E7")),
    mark: "approved",
  });
  await hannah.call("POST", `reviews/${cdrReview.id}/marks`, { itemIds: [id("E7")], mark: "rejected" });
  await hannah.call("POST", `items/${id("E7")}/comments`, {
    body: "@Priya Raman the analysis covers years 1 to 3 only. Please add the year 4 and 5 eclipse seasons before I can approve.",
    reviewId: cdrReview.id,
  });
  log("Review open: CDR review of the Subsystem Requirements (one item rejected)");

  // ── System level: the protoflight campaign, against the CDR baseline ────────────────────────────────────

  const systemPlan = await plan("System verification (protoflight model)", systemTests);
  const pfm = await cycle(systemPlan, {
    name: "PFM qualification campaign",
    environment: "Protoflight model, Environmental test centre",
    baselineId: cdr.id,
  });
  await assign(pfm.id, pfm.runs, tomas);
  await assign(pfm.id, [pfm.run("FF5")], hannah);
  for (const ref of ["FF1", "FF2", "FF6", "EV1", "EV3"]) await execute(tomas, pfm.run(ref));
  const report = await upload(
    tomas,
    "EV2-random-vibration-report.pdf",
    "application/pdf",
    pdf([
      "Kestrel-EO PFM random vibration test report (demo)",
      "",
      "Levels: 14.1 g rms, 20 to 2,000 Hz, 2 minutes per axis.",
      "First mode shift after test: X 1.2 %, Y 0.8 %, Z 2.1 % (limit 5 %).",
      "Result: pass.",
    ]),
  );
  await execute(tomas, pfm.run("EV2"), undefined, false);
  await tomas.call("POST", `test-runs/${pfm.run("EV2").id}/attachments`, { attachmentId: report.id });
  await tomas.call("POST", `test-runs/${pfm.run("EV2").id}/finish`, {});

  await execute(tomas, pfm.run("EV6"), {
    step: 1,
    outcome: "fail",
    actual: "RE102 exceeded by 4 dB at 8.21 GHz, second harmonic of the X-band local oscillator.",
    defect: "https://jira.example.com/browse/KEO-305",
  });
  // TVAC is under way: three steps passed, evidence attached, not finished.
  const tvac = pfm.run("EV4");
  await tomas.call("POST", `test-runs/${tvac.id}/steps`, {
    steps: [1, 2, 3],
    outcome: "pass",
    actual: "Within limits.",
  });
  const thermocouples = await upload(
    tomas,
    "EV4-thermocouples-cycle1.csv",
    "text/csv",
    csv(
      "hour,tc01_battery_c,tc07_focal_plane_c,tc12_obc_c,tc19_tank_c",
      Array.from({ length: 48 }, (_, h) =>
        [
          h,
          12 + 14 * Math.sin(h / 7),
          20 + 0.6 * Math.sin(h / 5),
          25 + 30 * Math.sin(h / 7),
          18 + 6 * Math.sin(h / 7),
        ].map((v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)),
      ),
    ),
  );
  const tvacLog = await upload(
    tomas,
    "EV4-chamber-log.txt",
    "text/plain",
    "2026-09-28 08:00 Pump down started\n2026-09-28 14:20 1.2e-6 mbar reached\n2026-09-29 02:00 Hot plateau +55 °C, FFT passed\n2026-09-30 06:00 Cold plateau -25 °C, FFT passed\n",
  );
  await tomas.call("POST", `test-runs/${tvac.id}/attachments`, { attachmentId: thermocouples.id, step: 2 });
  await tomas.call("POST", `test-runs/${tvac.id}/attachments`, { attachmentId: tvacLog.id });
  await tomas.call("POST", `items/${id("EV2")}/comments`, { body: "Test report attached to the PFM campaign run." });
  log("Cycle in progress: PFM qualification campaign (TVAC under way, EMC failed)");

  // ── Mission validation: an operations rehearsal ─────────────────────────────────────────────────────────

  const validationPlan = await plan("Mission validation", validationTests);
  const rehearsal = await cycle(validationPlan, {
    name: "Operations readiness rehearsal 1",
    environment: "Mission control centre with the satellite simulator",
  });
  await assign(rehearsal.id, rehearsal.runs, tomas);
  await execute(tomas, rehearsal.run("V1"));
  await execute(tomas, rehearsal.run("V2"), {
    step: 3,
    outcome: "fail",
    actual: "Product delivered 27 h after the request: the processing queue was not prioritised.",
    defect: "https://jira.example.com/browse/KEO-322",
  });
  await tomas.call("POST", `test-runs/${rehearsal.run("V3").id}/steps`, { steps: [1], outcome: "pass" });
  log("Cycle in progress: Operations readiness rehearsal 1");

  // ── Collaboration: comments, references, code tags, a draft, a deleted item ─────────────────────────────

  await priya.call("POST", `items/${id("E3")}/comments`, {
    body: "@Maya Okafor the larger battery adds 1.6 kg. Still inside the S13 margin, but please update the mass budget.",
  });
  await maya.call("POST", `items/${id("E3")}/comments`, { body: "Done in the next mass budget issue. Thanks." });
  await hannah.call("POST", `items/${id("H9")}/comments`, {
    body: "@Tomás Ruiz please make sure the penetration test (FF5) also tries replays across an OBC switch-over.",
  });
  await tomas.call("POST", `items/${id("EV6")}/comments`, {
    body: "Harmonic traced to the local oscillator. Filter redesign tracked in KEO-305.",
  });
  await priya.call("POST", `items/${id("E3")}/references`, {
    url: "https://jira.example.com/browse/KEO-231",
    title: "Safe mode power negative with one wing failed",
  });
  await maya.call("POST", `items/${id("S45")}/references`, {
    url: "https://gitlab.example.com/kestrel/security/-/issues/14",
    title: "Threat model: command link",
  });
  await maya.call("POST", `items/${id("MR7")}/references`, {
    url: "https://jira.example.com/browse/KEO-CR-007",
    title: "Customer change request CR-007",
  });
  await tomas.call("PUT", `projects/${pid}/code-references`, {
    source: "kestrel-fsw (main)",
    references: [
      ["F1", "src/modes/mode_manager.c"],
      ["F2", "src/fdir/monitor.c"],
      ["F3", "src/cmd/queue.c"],
      ["F4", "src/boot/image_select.c"],
      ["F6", "src/cmd/authenticate.c"],
      ["F7", "src/log/event_log.c"],
      ["F9", "src/boot/startup.c"],
      ["F10", "src/gnc/propagator.c"],
      ["F11", "src/payload/imaging_task.c"],
      ["F14", "src/modes/separation.c"],
      ["A12", "src/gnc/bdot.c"],
      ["A14", "src/gnc/yaw_steering.c"],
    ].map(([ref = "", file = ""]) => ({
      uid: uid(ref),
      url: `https://github.com/kestrel-eo/fsw/blob/4f2c9e1/${file}`,
      title: file,
    })),
  });

  // Lars is part-way through an edit of A5 and has not saved a version yet.
  const a5 = (await lars.call("GET", `items/${id("A5")}`)).item;
  await lars.call("PUT", `items/${id("A5")}/draft`, {
    baseRevision: a5.revision,
    name: a5.name,
    description: doc(
      "Wheel-induced microvibration at the payload interface shall be below 1 µrad, with the isolators fitted.",
    ),
    attributes: a5.attributes,
  });

  // A requirement written by mistake, then deleted: it waits in the trash.
  const { node: obsolete } = await maya.call<{ node: { id: string } }>(
    "POST",
    `sets/${setId("System Requirements")}/nodes`,
    {
      kind: "item",
      name: "Panchromatic band",
    },
  );
  await maya.call("DELETE", `nodes/${obsolete.id}`);
  log("Comments, references, code tags, a draft and a deleted item added");

  console.log(`\nDone. Open ${BASE} and choose "${PROJECT}".`);
  console.log(
    `Demo people sign in as <name>.demo@${domain} with the password in scripts/demo/spacecraft.ts (TEAM_PASSWORD).`,
  );
}

await main();
