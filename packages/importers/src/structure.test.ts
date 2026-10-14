import { readFileSync } from "node:fs";
import { parseReqif, unzip } from "@app/reqif";
import { expect, test } from "vitest";
import { parseCsv } from "./csv.ts";
import { summarizeReqif } from "./reqif.ts";
import {
  deriveReqifStructure,
  deriveSheetStructure,
  type Existing,
  inferFieldType,
  planStructure,
  uidPrefixFor,
} from "./structure.ts";

const sample = (name: string) => new URL(`../../../samples/import/${name}`, import.meta.url);
const empty: Existing = { itemTypes: [], sets: [], linkTypes: [], prefixes: [] };

test("prefixes are valid and never repeat", () => {
  expect(uidPrefixFor("Launcher ICD", [])).toBe("LI");
  expect(uidPrefixFor("Requirements", [])).toBe("REQU");
  expect(uidPrefixFor("Requirements", ["REQU"])).toBe("REQU2");
  expect(uidPrefixFor("123 数据", [])).toBe("ITM");
  for (const name of ["a", "Ground Segment Requirements", "x".repeat(50)]) {
    expect(uidPrefixFor(name, [])).toMatch(/^[A-Z][A-Z0-9]{0,9}$/);
  }
});

test.each(["doors-classic-launcher-icd.reqif", "doors-classic-launcher-icd-v2.reqif", "polarion-ground-segment.reqif"])(
  "%s gives a structure with a set per specification and fields from the attributes",
  (file) => {
    const summary = summarizeReqif(parseReqif(readFileSync(sample(file), "utf8")));
    const { proposal, fieldOf } = deriveReqifStructure(summary);
    expect(proposal.sets.length).toBe(summary.specifications.length);
    expect(new Set(proposal.sets.map((s) => s.uidPrefix)).size).toBe(proposal.sets.length);
    for (const set of proposal.sets) {
      expect(set.uidPrefix).toMatch(/^[A-Z][A-Z0-9]{0,9}$/);
      // Name and description are not fields.
      expect(set.fields.map((f) => f.name.toLowerCase())).not.toContain("chaptername");
      for (const f of set.fields)
        if (f.type === "enum" || f.type === "multi_enum") expect(f.options?.length).toBeGreaterThan(0);
    }
    expect(Object.keys(fieldOf).length).toBe(summary.specifications.length);
    const plan = planStructure(proposal, empty);
    expect(plan.sets.every((s) => s.id === null)).toBe(true);
  },
);

test("DOORS enumerations become enum fields with the datatype's values", async () => {
  const summary = summarizeReqif(parseReqif(readFileSync(sample("doors-classic-launcher-icd.reqif"), "utf8")));
  const fields = deriveReqifStructure(summary).proposal.sets.flatMap((s) => s.fields);
  expect(fields.some((f) => f.type === "enum" || f.type === "multi_enum")).toBe(true);
  expect(summary.relationTypes.length).toBeGreaterThan(0);
  expect(deriveReqifStructure(summary).proposal.linkTypes.length).toBeGreaterThan(0);
});

test("the DOORS Next archive gives a structure too", async () => {
  const files = await unzip(new Uint8Array(readFileSync(sample("doors-next-payload-software.reqifz"))));
  const name = [...files.keys()].find((n) => /\.reqif$/i.test(n)) as string;
  const summary = summarizeReqif(parseReqif(new TextDecoder().decode(files.get(name))));
  expect(deriveReqifStructure(summary).proposal.sets.length).toBeGreaterThan(0);
});

test("the Jama spreadsheet gives a set, a name and description, and typed fields", () => {
  const [header = [], ...rows] = parseCsv(readFileSync(sample("jama-customer-requirements.csv"), "utf8"));
  const { proposal, columns } = deriveSheetStructure(header, rows, "Customer requirements");
  expect(columns).toContain("name");
  expect(columns).toContain("description");
  expect(proposal.sets[0]?.name).toBe("Customer requirements");
  const names = proposal.sets[0]?.fields.map((f) => f.name) ?? [];
  expect(new Set(names).size).toBe(names.length);
  // Every field named by a column exists in the proposal.
  for (const c of columns) if (c && !["name", "description", "folder"].includes(c)) expect(names).toContain(c);
});

test("field types are inferred from values", () => {
  expect(inferFieldType(["1", "2.5"]).type).toBe("number");
  expect(inferFieldType(["yes", "No"]).type).toBe("boolean");
  expect(inferFieldType(["2026-01-02"]).type).toBe("date");
  expect(inferFieldType(["High", "Low", "High", "Low", "High"])).toMatchObject({
    type: "enum",
    options: ["High", "Low"],
  });
  expect(inferFieldType(["a", "b", "c", "d"]).type).toBe("text");
});

test("an existing project only gains what is missing", () => {
  const existing: Existing = {
    itemTypes: [
      {
        id: "t1",
        name: "Launcher ICD",
        fields: [
          { id: "f1", name: "Priority", type: "enum", options: ["High"] },
          { id: "f2", name: "Count", type: "number", options: null },
        ],
      },
    ],
    sets: [{ id: "s1", name: "launcher icd", uidPrefix: "LI", itemTypeId: "t1" }],
    linkTypes: [{ id: "l1", name: "derived from" }],
    prefixes: ["LI"],
  };
  const plan = planStructure(
    {
      sets: [
        {
          name: "Launcher ICD",
          uidPrefix: "LI2",
          fields: [
            { name: "priority", type: "enum", options: ["High", "Low"] },
            { name: "Count", type: "text" },
            { name: "Owner", type: "text" },
          ],
        },
        { name: "Other", uidPrefix: "LI", fields: [] },
      ],
      linkTypes: ["Derived from", "Satisfies"],
    },
    existing,
  );
  expect(plan.sets[0]).toMatchObject({ id: "s1", uidPrefix: "LI", itemType: { id: "t1" } });
  expect(plan.sets[0]?.fields.map((f) => [f.name, f.id, f.addOptions])).toEqual([
    ["Priority", "f1", ["Low"]],
    ["Count", "f2", []],
    ["Owner", null, []],
  ]);
  expect(plan.notes).toHaveLength(1);
  expect(plan.sets[1]).toMatchObject({ id: null, uidPrefix: "LI2" });
  expect(plan.linkTypes).toEqual([
    { name: "derived from", id: "l1" },
    { name: "Satisfies", id: null },
  ]);
});
