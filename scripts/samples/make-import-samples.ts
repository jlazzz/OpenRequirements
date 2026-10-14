// Writes the files in samples/import: imitations of what DOORS Classic, DOORS Next, Polarion and Jama export, and a
// Word specification. They are hand-made to the shapes those tools are known to produce, not real exports, so they
// test our importers against those shapes but cannot prove compatibility. Run: node scripts/samples/make-import-samples.ts

import { mkdir, writeFile } from "node:fs/promises";
import { zip } from "../../packages/reqif/src/zip.ts";

const out = new URL("../../samples/import/", import.meta.url);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const bytes = (s: string) => new TextEncoder().encode(s);
const save = async (name: string, data: string | Uint8Array) => {
  await writeFile(new URL(name, out), data);
  console.log(`samples/import/${name}`);
};

// ── ReqIF writer shared by the three tool styles ─────────────────────────────────────────────────────────────

type Attr =
  | { id: string; name: string; kind: "string" | "xhtml" | "integer" | "date" }
  | { id: string; name: string; kind: "enumeration"; values: string[]; multi?: boolean };
type Obj = { id: string; values: Record<string, string | number | string[]>; children?: Obj[] };
type Spec = { id: string; name: string; objects: Obj[] };
type Style = {
  tool: string;
  title: string;
  /** Identifiers as the tool writes them. */
  prefix: string;
  /** XHTML element prefix: DOORS writes reqif-xhtml:, some tools xhtml:. */
  xhtml: string;
  objectType: string;
  attrs: Attr[];
  specs: Spec[];
  relationType: string;
  relations: [string, string][];
};

function reqif(s: Style): string {
  const id = (x: string) => `${s.prefix}${x}`;
  const time = "2026-09-30T09:14:22.000+02:00";
  const datatypes = [
    `<DATATYPE-DEFINITION-STRING IDENTIFIER="${id("DT-String")}" LONG-NAME="String" LAST-CHANGE="${time}" MAX-LENGTH="32000"/>`,
    `<DATATYPE-DEFINITION-XHTML IDENTIFIER="${id("DT-XHTML")}" LONG-NAME="XHTML" LAST-CHANGE="${time}"/>`,
    `<DATATYPE-DEFINITION-INTEGER IDENTIFIER="${id("DT-Integer")}" LONG-NAME="Integer" LAST-CHANGE="${time}" MAX="2147483647" MIN="-2147483648"/>`,
    `<DATATYPE-DEFINITION-DATE IDENTIFIER="${id("DT-Date")}" LONG-NAME="Date" LAST-CHANGE="${time}"/>`,
    ...s.attrs.flatMap((a) =>
      a.kind === "enumeration"
        ? [
            `<DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="${id(`DT-${a.id}`)}" LONG-NAME="${esc(a.name)}" LAST-CHANGE="${time}"><SPECIFIED-VALUES>${a.values
              .map(
                (v, i) =>
                  `<ENUM-VALUE IDENTIFIER="${id(`EV-${a.id}-${i}`)}" LONG-NAME="${esc(v)}" LAST-CHANGE="${time}"><PROPERTIES><EMBEDDED-VALUE KEY="${i}" OTHER-CONTENT=""/></PROPERTIES></ENUM-VALUE>`,
              )
              .join("")}</SPECIFIED-VALUES></DATATYPE-DEFINITION-ENUMERATION>`,
          ]
        : [],
    ),
  ];
  const dtRef = (a: Attr) =>
    a.kind === "enumeration"
      ? `<DATATYPE-DEFINITION-ENUMERATION-REF>${id(`DT-${a.id}`)}</DATATYPE-DEFINITION-ENUMERATION-REF>`
      : `<DATATYPE-DEFINITION-${a.kind.toUpperCase()}-REF>${id(`DT-${{ string: "String", xhtml: "XHTML", integer: "Integer", date: "Date" }[a.kind]}`)}</DATATYPE-DEFINITION-${a.kind.toUpperCase()}-REF>`;
  const definitions = s.attrs
    .map(
      (a) =>
        `<ATTRIBUTE-DEFINITION-${a.kind.toUpperCase()} IDENTIFIER="${id(`AD-${a.id}`)}" LONG-NAME="${esc(a.name)}" LAST-CHANGE="${time}"${a.kind === "enumeration" ? ` MULTI-VALUED="${a.multi ? "true" : "false"}"` : ""}><TYPE>${dtRef(a)}</TYPE></ATTRIBUTE-DEFINITION-${a.kind.toUpperCase()}>`,
    )
    .join("");
  const value = (a: Attr, v: string | number | string[]) => {
    const def = `<DEFINITION><ATTRIBUTE-DEFINITION-${a.kind.toUpperCase()}-REF>${id(`AD-${a.id}`)}</ATTRIBUTE-DEFINITION-${a.kind.toUpperCase()}-REF></DEFINITION>`;
    switch (a.kind) {
      case "xhtml": {
        const p = s.xhtml;
        // Paragraphs split on blank lines; **bold** becomes <b>.
        const body = String(v)
          .split("\n\n")
          .map((para) => `<${p}p>${esc(para).replace(/\*\*(.+?)\*\*/g, `<${p}b>$1</${p}b>`)}</${p}p>`)
          .join("");
        return `<ATTRIBUTE-VALUE-XHTML>${def}<THE-VALUE><${p}div>${body}</${p}div></THE-VALUE></ATTRIBUTE-VALUE-XHTML>`;
      }
      case "enumeration": {
        const chosen = (Array.isArray(v) ? v : [String(v)]).map(
          (name) => `<ENUM-VALUE-REF>${id(`EV-${a.id}-${a.values.indexOf(name)}`)}</ENUM-VALUE-REF>`,
        );
        return `<ATTRIBUTE-VALUE-ENUMERATION>${def}<VALUES>${chosen.join("")}</VALUES></ATTRIBUTE-VALUE-ENUMERATION>`;
      }
      default:
        return `<ATTRIBUTE-VALUE-${a.kind.toUpperCase()} THE-VALUE="${esc(String(v))}">${def}</ATTRIBUTE-VALUE-${a.kind.toUpperCase()}>`;
    }
  };
  const all: Obj[] = [];
  const walk = (list: Obj[]) => {
    for (const o of list) {
      all.push(o);
      walk(o.children ?? []);
    }
  };
  for (const spec of s.specs) walk(spec.objects);
  const objects = all
    .map(
      (o) =>
        `<SPEC-OBJECT IDENTIFIER="${id(o.id)}" LAST-CHANGE="${time}"><VALUES>${Object.entries(o.values)
          .map(([key, v]) => {
            const a = s.attrs.find((x) => x.id === key);
            if (!a) throw new Error(`No attribute ${key}`);
            return value(a, v);
          })
          .join("")}</VALUES><TYPE><SPEC-OBJECT-TYPE-REF>${id("OT")}</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT>`,
    )
    .join("");
  const hierarchy = (list: Obj[]): string =>
    list
      .map(
        (o) =>
          `<SPEC-HIERARCHY IDENTIFIER="${id(`SH-${o.id}`)}" LAST-CHANGE="${time}"><OBJECT><SPEC-OBJECT-REF>${id(o.id)}</SPEC-OBJECT-REF></OBJECT>${o.children?.length ? `<CHILDREN>${hierarchy(o.children)}</CHILDREN>` : ""}</SPEC-HIERARCHY>`,
      )
      .join("");
  const specs = s.specs
    .map(
      (spec) =>
        `<SPECIFICATION IDENTIFIER="${id(spec.id)}" LONG-NAME="${esc(spec.name)}" LAST-CHANGE="${time}"><TYPE><SPECIFICATION-TYPE-REF>${id("ST")}</SPECIFICATION-TYPE-REF></TYPE><CHILDREN>${hierarchy(spec.objects)}</CHILDREN></SPECIFICATION>`,
    )
    .join("");
  const relations = s.relations
    .map(
      ([from, to], i) =>
        `<SPEC-RELATION IDENTIFIER="${id(`REL-${i + 1}`)}" LAST-CHANGE="${time}"><SOURCE><SPEC-OBJECT-REF>${id(from)}</SPEC-OBJECT-REF></SOURCE><TARGET><SPEC-OBJECT-REF>${id(to)}</SPEC-OBJECT-REF></TARGET><TYPE><SPEC-RELATION-TYPE-REF>${id("RT")}</SPEC-RELATION-TYPE-REF></TYPE></SPEC-RELATION>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:reqif-xhtml="http://www.w3.org/1999/xhtml" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<THE-HEADER><REQ-IF-HEADER IDENTIFIER="${id("HEADER")}"><CREATION-TIME>${time}</CREATION-TIME><REQ-IF-TOOL-ID>${esc(s.tool)}</REQ-IF-TOOL-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION><SOURCE-TOOL-ID>${esc(s.tool)}</SOURCE-TOOL-ID><TITLE>${esc(s.title)}</TITLE></REQ-IF-HEADER></THE-HEADER>
<CORE-CONTENT><REQ-IF-CONTENT>
<DATATYPES>${datatypes.join("")}</DATATYPES>
<SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="${id("OT")}" LONG-NAME="${esc(s.objectType)}" LAST-CHANGE="${time}"><SPEC-ATTRIBUTES>${definitions}</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE><SPECIFICATION-TYPE IDENTIFIER="${id("ST")}" LONG-NAME="Module Type" LAST-CHANGE="${time}"/><SPEC-RELATION-TYPE IDENTIFIER="${id("RT")}" LONG-NAME="${esc(s.relationType)}" LAST-CHANGE="${time}"/></SPEC-TYPES>
<SPEC-OBJECTS>${objects}</SPEC-OBJECTS>
<SPEC-RELATIONS>${relations}</SPEC-RELATIONS>
<SPECIFICATIONS>${specs}</SPECIFICATIONS>
</REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>
`;
}

// ── DOORS Classic: a launch provider's interface module ──────────────────────────────────────────────────────
// DOORS Classic marks headings with ReqIF.ChapterName and no text, numbers objects with an absolute number in
// ReqIF.ForeignID, and writes rich text under the reqif-xhtml: prefix.

const doorsAttrs: Attr[] = [
  { id: "ForeignID", name: "ReqIF.ForeignID", kind: "string" },
  { id: "Chapter", name: "ReqIF.ChapterName", kind: "string" },
  { id: "Text", name: "ReqIF.Text", kind: "xhtml" },
  { id: "Status", name: "Status", kind: "enumeration", values: ["Proposed", "Agreed", "Deleted"] },
  {
    id: "Verification",
    name: "Verification Method",
    kind: "enumeration",
    values: ["Test", "Analysis", "Review of Design", "Inspection"],
    multi: true,
  },
  { id: "Created", name: "Created On", kind: "date" },
];
const heading = (n: number, title: string, children: Obj[]): Obj => ({
  id: `obj-${n}`,
  values: { ForeignID: String(n), Chapter: title },
  children,
});
const shall = (n: number, text: string, status = "Agreed", verification = ["Test"]): Obj => ({
  id: `obj-${n}`,
  values: {
    ForeignID: String(n),
    Text: text,
    Status: status,
    Verification: verification,
    Created: "2026-05-12T10:00:00.000+02:00",
  },
});
const launcherV1: Obj[] = [
  heading(1, "Scope", [
    shall(
      2,
      "This module states the requirements the launch service places on a passenger satellite of up to 200 kg.",
      "Agreed",
      ["Review of Design"],
    ),
  ]),
  heading(3, "Mechanical interface", [
    shall(4, "The satellite **shall** mate to the 15-inch separation system provided by the launch service."),
    shall(5, "The satellite centre of mass **shall** lie within 25 mm of the separation axis.", "Agreed", [
      "Test",
      "Analysis",
    ]),
    shall(
      6,
      "The first lateral natural frequency **shall** be above 25 Hz with the satellite hard-mounted.",
      "Agreed",
      ["Test"],
    ),
    shall(7, "The first axial natural frequency **shall** be above 45 Hz with the satellite hard-mounted."),
  ]),
  heading(8, "Environment", [
    heading(9, "Mechanical environment", [
      shall(
        10,
        "The satellite **shall** withstand quasi-static loads of 8.5 g axial and 3.0 g lateral.\n\nLoads are applied together, at the satellite centre of mass.",
        "Agreed",
        ["Analysis", "Test"],
      ),
      shall(
        11,
        "The satellite **shall** withstand random vibration of 14.1 g rms, 20 to 2,000 Hz, 2 minutes per axis.",
      ),
      shall(12, "The satellite **shall** withstand a separation shock of 2,000 g SRS."),
    ]),
    heading(13, "Electromagnetic environment", [
      shall(14, "No satellite transmitter **shall** radiate until 45 minutes after separation.", "Agreed", [
        "Test",
        "Review of Design",
      ]),
      shall(
        15,
        "Radiated emissions **shall** stay below the launcher susceptibility limits in the user manual, table 4-7.",
      ),
    ]),
  ]),
  heading(16, "Safety", [
    shall(17, "Each hazardous function **shall** be controlled by at least three independent inhibits.", "Agreed", [
      "Inspection",
    ]),
    shall(
      18,
      "Pressure vessels **shall** be proof tested at 1.5 times their maximum expected operating pressure.",
      "Agreed",
      ["Test"],
    ),
    shall(19, "The satellite **shall** be delivered with its battery below 30 % state of charge.", "Proposed", [
      "Inspection",
    ]),
  ]),
];
const doors = (objects: Obj[], title: string) =>
  reqif({
    tool: "DOORS 9.7",
    title,
    prefix: "_DOORS_",
    xhtml: "reqif-xhtml:",
    objectType: "Launcher ICD Object Type",
    attrs: doorsAttrs,
    specs: [{ id: "module-LV-ICD", name: "Launcher interface requirements", objects }],
    relationType: "satisfies",
    relations: [
      ["obj-10", "obj-6"],
      ["obj-11", "obj-6"],
      ["obj-14", "obj-15"],
    ],
  });

// v2: what the next delivery of the same module looks like. One object reworded, one new, one marked deleted.
const launcherV2 = structuredClone(launcherV1);
const find = (list: Obj[], id: string): Obj | undefined => {
  for (const o of list) {
    if (o.id === id) return o;
    const found = find(o.children ?? [], id);
    if (found) return found;
  }
  return undefined;
};
(find(launcherV2, "obj-11") as Obj).values.Text =
  "The satellite **shall** withstand random vibration of 12.8 g rms, 20 to 2,000 Hz, 2 minutes per axis.";
(find(launcherV2, "obj-19") as Obj).values.Status = "Deleted";
find(launcherV2, "obj-16")?.children?.push(
  shall(20, "Hydrazine loading **shall** be performed by the launch service's propellant team only.", "Proposed", [
    "Inspection",
  ]),
);

// ── DOORS Next: a payload software module, zipped as .reqifz ─────────────────────────────────────────────────
// DOORS Next writes ReqIF.Name and ReqIF.Description, an artifact type per object, and long generated identifiers.

const dngAttrs: Attr[] = [
  { id: "Identifier", name: "Identifier", kind: "integer" },
  { id: "Name", name: "ReqIF.Name", kind: "string" },
  { id: "Description", name: "ReqIF.Description", kind: "xhtml" },
  {
    id: "ArtifactType",
    name: "Artifact Type",
    kind: "enumeration",
    values: ["Heading", "Software Requirement", "Information"],
  },
  { id: "Priority", name: "Priority", kind: "enumeration", values: ["High", "Medium", "Low"] },
  { id: "Releases", name: "Planned In", kind: "enumeration", values: ["R1.0", "R1.1", "R2.0"], multi: true },
];
const dng = (n: number, name: string, text: string, priority = "Medium", releases = ["R1.0"]): Obj => ({
  id: `_rq${String(n).padStart(4, "0")}Lk9xAe2QnB`,
  values: {
    Identifier: 41000 + n,
    Name: name,
    Description: text,
    ArtifactType: "Software Requirement",
    Priority: priority,
    Releases: releases,
  },
});
const dngHeading = (n: number, name: string, children: Obj[]): Obj => ({
  id: `_hd${String(n).padStart(4, "0")}Lk9xAe2QnB`,
  values: { Identifier: 41000 + n, Name: name, ArtifactType: "Heading" },
  children,
});
const payloadSoftware = reqif({
  tool: "IBM Engineering Requirements Management DOORS Next 7.0.3",
  title: "Payload software requirements",
  prefix: "",
  xhtml: "xhtml:",
  objectType: "Software Requirement",
  attrs: dngAttrs,
  specs: [
    {
      id: "_mod0001Lk9xAe2QnB",
      name: "Payload software requirements",
      objects: [
        dngHeading(1, "Acquisition", [
          dng(
            2,
            "Line rate control",
            "The payload software shall set the detector line rate from the ground speed, between 1,200 and 2,000 lines per second.",
            "High",
          ),
          dng(
            3,
            "Band selection",
            "The payload software shall acquire any subset of the five bands, as commanded per imaging task.",
          ),
          dng(
            4,
            "Dark frames",
            "The payload software shall record 256 dark lines with the shutter closed before every acquisition.",
            "High",
          ),
        ]),
        dngHeading(5, "Processing on board", [
          dng(
            6,
            "Compression",
            "The payload software shall compress every band with CCSDS 122.0 at the commanded ratio.",
            "High",
          ),
          dng(
            7,
            "Cloud flag",
            "The payload software shall flag each scene with an estimated cloud fraction.\n\nThe estimate uses the blue and near-infrared bands only.",
            "Low",
            ["R1.1", "R2.0"],
          ),
        ]),
        dngHeading(8, "Health", [
          dng(
            9,
            "Detector temperature",
            "The payload software shall stop an acquisition when the focal plane leaves 18 to 22 °C.",
          ),
          dng(10, "Event reporting", "The payload software shall report every refused task with a reason code.", "Low"),
        ]),
      ],
    },
  ],
  relationType: "Elaborated By",
  relations: [[`_rq0004Lk9xAe2QnB`, `_rq0009Lk9xAe2QnB`]],
});

// ── Polarion: ground segment requirements ────────────────────────────────────────────────────────────────────
// Polarion exports work items with their id (GS-123) as ReqIF.ForeignID, a title, a description and its
// enumerations with ids like must_have.

const polarionAttrs: Attr[] = [
  { id: "ForeignID", name: "ReqIF.ForeignID", kind: "string" },
  { id: "Title", name: "Title", kind: "string" },
  { id: "Description", name: "Description", kind: "xhtml" },
  { id: "Status", name: "Status", kind: "enumeration", values: ["draft", "reviewed", "approved"] },
  { id: "Severity", name: "Severity", kind: "enumeration", values: ["must_have", "should_have", "nice_to_have"] },
  { id: "Type", name: "Type", kind: "enumeration", values: ["heading", "systemRequirement"] },
];
const gs = (n: number, title: string, text: string, status = "approved", severity = "must_have"): Obj => ({
  id: `GS-${n}`,
  values: {
    ForeignID: `GS-${n}`,
    Title: title,
    Description: text,
    Status: status,
    Severity: severity,
    Type: "systemRequirement",
  },
});
const gsHeading = (n: number, title: string, children: Obj[]): Obj => ({
  id: `GS-${n}`,
  values: { ForeignID: `GS-${n}`, Title: title, Type: "heading" },
  children,
});
const polarion = reqif({
  tool: "Polarion ALM 2410",
  title: "Ground segment requirements",
  prefix: "polarion_",
  xhtml: "xhtml:",
  objectType: "System Requirement",
  attrs: polarionAttrs,
  specs: [
    {
      id: "doc-ground-segment",
      name: "Ground Segment Requirements",
      objects: [
        gsHeading(100, "Mission planning", [
          gs(
            101,
            "Plan generation",
            "The planning system shall produce a conflict-free plan for the next 48 hours every 6 hours.",
          ),
          gs(
            102,
            "Urgent tasking",
            "An urgent request shall be planned in the next plan cycle, displacing routine tasks if needed.",
          ),
          gs(103, "Plan upload", "Each plan shall be uploaded at the first pass after it is generated.", "reviewed"),
        ]),
        gsHeading(110, "Data processing", [
          gs(
            111,
            "Level 1 products",
            "Level 1C orthorectified products shall be produced within 2 hours of reception.",
          ),
          gs(
            112,
            "Quality report",
            "Each product shall carry a quality report with cloud cover and geolocation estimate.",
            "draft",
            "should_have",
          ),
        ]),
        gsHeading(120, "Operations security", [
          gs(121, "Two-factor login", "Operators shall sign in with two-factor authentication."),
          gs(
            122,
            "Command log",
            "Every telecommand sent shall be logged with operator, time and pass.",
            "approved",
            "must_have",
          ),
          gs(123, "Session timeout", "An idle operator session shall lock after 15 minutes.", "draft", "nice_to_have"),
        ]),
      ],
    },
  ],
  relationType: "depends_on",
  relations: [
    ["GS-102", "GS-101"],
    ["GS-103", "GS-101"],
  ],
});

// ── Jama: a customer requirements export ─────────────────────────────────────────────────────────────────────
// Jama's Excel export has one row per item, its project ID (CUST-12), a parent path, rich text as HTML, and an
// item type column that also lists folders.

const jamaRows: string[][] = [
  ["ID", "Global ID", "Item Type", "Name", "Description", "Status", "Priority", "Location"],
  ["CUST-1", "GID-88214", "Folder", "Imaging", "", "", "", "Customer Requirements"],
  [
    "CUST-2",
    "GID-88215",
    "Stakeholder Requirement",
    "Land coverage",
    "<p>The system <b>shall</b> image all land between 82° S and 82° N.</p>",
    "Approved",
    "High",
    "Customer Requirements/Imaging",
  ],
  [
    "CUST-3",
    "GID-88216",
    "Stakeholder Requirement",
    "Revisit",
    "<p>Any point <b>shall</b> be revisited at least every 5 days.</p>",
    "Approved",
    "High",
    "Customer Requirements/Imaging",
  ],
  [
    "CUST-4",
    "GID-88217",
    "Stakeholder Requirement",
    "Ground sampling distance",
    "<p>Images <b>shall</b> resolve 4 m on the ground.</p><p>Measured at nadir.</p>",
    "Approved",
    "High",
    "Customer Requirements/Imaging",
  ],
  ["CUST-5", "GID-88218", "Folder", "Delivery", "", "", "", "Customer Requirements"],
  [
    "CUST-6",
    "GID-88219",
    "Stakeholder Requirement",
    "Same-day delivery",
    "<p>90 % of products <b>shall</b> be delivered within 6 hours.</p>",
    "Draft",
    "High",
    "Customer Requirements/Delivery",
  ],
  [
    "CUST-7",
    "GID-88220",
    "Stakeholder Requirement",
    "Emergency tasking",
    "<p>During a disaster, an image <b>shall</b> be delivered within 24 hours of a request.</p>",
    "Approved",
    "Medium",
    "Customer Requirements/Delivery",
  ],
  [
    "CUST-8",
    "GID-88221",
    "Stakeholder Requirement",
    "Delivery formats",
    "<ul><li>GeoTIFF</li><li>JPEG 2000</li><li>Cloud-optimised GeoTIFF</li></ul>",
    "Draft",
    "Low",
    "Customer Requirements/Delivery",
  ],
  ["CUST-9", "GID-88222", "Folder", "Service", "", "", "", "Customer Requirements"],
  [
    "CUST-10",
    "GID-88223",
    "Stakeholder Requirement",
    "Service life",
    "<p>The service <b>shall</b> run for 5 years.</p>",
    "Approved",
    "Medium",
    "Customer Requirements/Service",
  ],
  [
    "CUST-11",
    "GID-88224",
    "Stakeholder Requirement",
    "Archive",
    "<p>Products <b>shall</b> stay available for 10 years, including after the end of the mission.</p>",
    "Rejected",
    "Low",
    "Customer Requirements/Service",
  ],
];
// The importer's Folder column takes the path below the set: Jama's "Location" without the top folder.
const jamaItems = jamaRows.filter((r, i) => i === 0 || r[2] !== "Folder");
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const jamaCsv = jamaItems
  .map((r, i) =>
    (i === 0 ? [...r, "Folder"] : [...r, (r[7] ?? "").split("/").slice(1).join("/")]).map(csvCell).join(","),
  )
  .join("\r\n");

async function xlsx(rows: string[][]): Promise<Uint8Array> {
  const strings: string[] = [];
  const index = (s: string) => {
    const at = strings.indexOf(s);
    return at >= 0 ? at : strings.push(s) - 1;
  };
  const col = (n: number) => String.fromCharCode(65 + n);
  const sheet = rows
    .map(
      (r, y) =>
        `<row r="${y + 1}">${r.map((cell, x) => `<c r="${col(x)}${y + 1}" t="s"><v>${index(cell)}</v></c>`).join("")}</row>`,
    )
    .join("");
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`,
  };
  files["xl/sharedStrings.xml"] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`;
  return zip(Object.entries(files).map(([name, data]) => ({ name, data: bytes(data) })));
}

// ── Word: a customer's technical annex, written in Word with heading styles ──────────────────────────────────

async function docx(): Promise<Uint8Array> {
  const p = (text: string, style?: string) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${text
      .split(/(\*\*.+?\*\*)/)
      .filter(Boolean)
      .map((part) =>
        part.startsWith("**")
          ? `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(part.slice(2, -2))}</w:t></w:r>`
          : `<w:r><w:t xml:space="preserve">${esc(part)}</w:t></w:r>`,
      )
      .join("")}</w:p>`;
  const bullet = (text: string) =>
    `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${esc(text)}</w:t></w:r></w:p>`;
  const table = (rows: string[][]) =>
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${rows[0]?.map(() => `<w:gridCol w:w="3000"/>`).join("")}</w:tblGrid>${rows
      .map(
        (r) =>
          `<w:tr>${r.map((c) => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${p(c)}</w:tc>`).join("")}</w:tr>`,
      )
      .join("")}</w:tbl>`;
  const body = [
    p("Technical Annex A: Earth Observation Service", "Title"),
    p("Issue 2, September 2026. Synthetic sample for import testing.", "Subtitle"),
    p("Imaging", "Heading1"),
    p("The contractor **shall** provide imagery of all land between 82° S and 82° N."),
    p("Each location **shall** be revisited at least once every five days."),
    p("Spectral bands", "Heading2"),
    p("The imagery **shall** contain the following bands:"),
    table([
      ["Band", "From (nm)", "To (nm)"],
      ["Blue", "450", "520"],
      ["Green", "520", "600"],
      ["Red", "630", "690"],
      ["Near infrared", "770", "900"],
    ]),
    p("Image quality", "Heading2"),
    p("The ground sampling distance **shall** be 4 m or better at nadir."),
    p("The signal-to-noise ratio **shall** be at least 100 for a 30 % reflectance target."),
    p("Delivery", "Heading1"),
    p("Products **shall** be delivered in these formats:"),
    bullet("GeoTIFF"),
    bullet("Cloud-optimised GeoTIFF"),
    p("90 % of products **shall** reach the customer within 6 hours of acquisition."),
    p("Security", "Heading1"),
    p("Images of sites on the customer's restricted list **shall** be encrypted end to end."),
    p("The contractor **shall** report any security incident within 24 hours."),
  ].join("");
  const styles = [
    ["Normal", "Normal", ""],
    ["Title", "Title", ""],
    ["Subtitle", "Subtitle", ""],
    ["Heading1", "heading 1", `<w:outlineLvl w:val="0"/>`],
    ["Heading2", "heading 2", `<w:outlineLvl w:val="1"/>`],
    ["ListParagraph", "List Paragraph", ""],
  ]
    .map(
      ([id, name, ppr]) =>
        `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${id === "Normal" ? "" : `<w:basedOn w:val="Normal"/>`}${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}</w:style>`,
    )
    .join("");
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles}</w:styles>`,
    "word/numbering.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  };
  return zip(Object.entries(files).map(([name, data]) => ({ name, data: bytes(data) })));
}

// ── Write everything ─────────────────────────────────────────────────────────────────────────────────────────

await mkdir(out, { recursive: true });
await save("doors-classic-launcher-icd.reqif", doors(launcherV1, "Launcher interface requirements"));
await save("doors-classic-launcher-icd-v2.reqif", doors(launcherV2, "Launcher interface requirements, issue 2"));
await save(
  "doors-next-payload-software.reqifz",
  await zip([{ name: "payload-software.reqif", data: bytes(payloadSoftware) }]),
);
await save("polarion-ground-segment.reqif", polarion);
await save("jama-customer-requirements.csv", `${jamaCsv}\r\n`);
await save(
  "jama-customer-requirements.xlsx",
  await xlsx(
    jamaItems.map((r, i) => (i === 0 ? [...r, "Folder"] : [...r, (r[7] ?? "").split("/").slice(1).join("/")])),
  ),
);
await save("customer-technical-annex.docx", await docx());
