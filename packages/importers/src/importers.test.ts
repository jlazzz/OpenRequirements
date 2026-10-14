import { docToText, textToDoc } from "@app/shared";
import { expect, test } from "vitest";
import { parseCsv, toCsv } from "./csv.ts";
import { cellToDoc, guessTargets, mapRows } from "./mapping.ts";

test("CSV parsing handles quotes, embedded separators and line breaks, and other separators", () => {
  expect(parseCsv('\uFEFFName,Text\r\n"Voltage, supply","He said ""5 V""\nexactly"\r\n\r\nLast,\n')).toEqual([
    ["Name", "Text"],
    ["Voltage, supply", 'He said "5 V"\nexactly'],
    ["Last", ""],
  ]);
  expect(parseCsv("a;b;c\n1,5;2;3")).toEqual([
    ["a", "b", "c"],
    ["1,5", "2", "3"],
  ]);
  expect(parseCsv("a\tb\n1\t2")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ]);
  expect(parseCsv("")).toEqual([]);
});

test("written CSV reads back the same, and cells that look like formulas are made plain text", () => {
  const rows = [
    ["ID", "Name", "Count"],
    ["SYS-001", 'Say "hi", twice\nplease', 3],
  ];
  expect(parseCsv(toCsv(rows))).toEqual(rows.map((row) => row.map(String)));
  expect(toCsv([["=1+1", "@cmd", -5]])).toBe("\uFEFF'=1+1,'@cmd,-5\r\n");
});

const fields = [
  { id: "f-status", name: "Status", type: "enum", options: ["Draft", "Approved"] },
  { id: "f-weight", name: "Weight", type: "number", options: null },
  { id: "f-safety", name: "Safety", type: "boolean", options: null },
  { id: "f-due", name: "Due", type: "date", options: null },
  { id: "f-tags", name: "Tags", type: "multi_enum", options: ["Red", "Blue"] },
  { id: "f-note", name: "Note", type: "text", options: null },
];

test("column headers are matched to the name, the description and fields of the same name", () => {
  const row = ["", "", "", "", "", "REQ-001", ""];
  expect(
    guessTargets(["Title", " STATUS ", "Text", "Owner", "Name", "ID", "Folder"], fields, [row], new Set(["REQ-001"])),
  ).toEqual(["name", "f-status", "description", "", "", "uid", "folder"]);
});

test("rows become items with typed field values; bad cells are reported by spreadsheet row", () => {
  const targets = ["name", "description", "f-status", "f-weight", "f-safety", "f-due", "f-tags", "f-note", ""];
  const { nodes, items, errors } = mapRows(
    [
      ["Supply", "5 V DC", "approved", "1.5", "Yes", "2026-10-13T00:00:00.000Z", "blue; Red", "n/a", "ignored"],
      ["Bare", "", "", "", "", "", "", "", ""],
      ["", "no name", "", "", "", "", "", "", ""],
      ["Bad", "", "Maybe", "heavy", "perhaps", "13/10/2026", "Green", "", ""],
    ],
    targets,
    fields,
  );
  expect(items).toBe(3);
  expect(nodes.slice(0, 2)).toEqual([
    {
      kind: "item",
      name: "Supply",
      description: textToDoc("5 V DC"),
      attributes: {
        "f-status": "Approved",
        "f-weight": 1.5,
        "f-safety": true,
        "f-due": "2026-10-13",
        "f-tags": ["Blue", "Red"],
        "f-note": "n/a",
      },
    },
    { kind: "item", name: "Bare" },
  ]);
  expect(errors.map((e) => e.slice(0, 13))).toEqual([
    "Row 4: the na",
    "Row 5: Status",
    "Row 5: Weight",
    "Row 5: Safety",
    'Row 5: Due "1',
    'Row 5: Tags "',
  ]);
  expect(mapRows([["x"]], [""], fields).errors).toEqual(["Choose the column that holds the item name."]);
});

test("a Folder column builds folders, reusing existing ones; a UID column names the item to update", () => {
  const existing = [
    { id: "f1", parentId: null, name: "Power" },
    { id: "f2", parentId: "f1", name: "Supply" },
    { id: "f3", parentId: null, name: "Supply" },
  ];
  const { nodes, errors } = mapRows(
    [
      ["SYS-001", "Power / Supply", "Voltage"],
      ["", "Power/ Supply /New", "Current"],
      ["", "", "Loose"],
      ["", "Other", "Elsewhere"],
      ["", " Power ", "Direct"],
    ],
    ["uid", "folder", "name"],
    [],
    existing,
  );
  expect(errors).toEqual([]);
  expect(nodes).toEqual([
    {
      kind: "folder",
      name: "Power",
      id: "f1",
      children: [
        {
          kind: "folder",
          name: "Supply",
          id: "f2",
          children: [
            { kind: "item", uid: "SYS-001", name: "Voltage" },
            { kind: "folder", name: "New", children: [{ kind: "item", name: "Current" }] },
          ],
        },
        { kind: "item", name: "Direct" },
      ],
    },
    { kind: "item", name: "Loose" },
    { kind: "folder", name: "Other", children: [{ kind: "item", name: "Elsewhere" }] },
  ]);
  // Paths start at the folder imported into.
  expect(mapRows([["Supply", "X"]], ["folder", "name"], [], existing, "f1").nodes[0]).toMatchObject({ id: "f2" });
});

// Rows of samples/import/jama-customer-requirements.csv.
const JAMA = [
  ["ID", "Global ID", "Item Type", "Name", "Description", "Status", "Priority", "Location", "Folder"],
  [
    "CUST-2",
    "GID-88215",
    "Stakeholder Requirement",
    "Land coverage",
    "<p>The system <b>shall</b> image all land between 82° S and 82° N.</p>",
    "Approved",
    "High",
    "Customer Requirements/Imaging",
    "Imaging",
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
    "Imaging",
  ],
];

test("an ID column of another tool's ids is not taken as the UID; one of this set's UIDs is", () => {
  const [header = [], ...rows] = JAMA;
  expect(guessTargets(header, fields, rows, new Set(["STK-001"]))[0]).toBe("");
  expect(guessTargets(header, fields, rows, new Set(["CUST-2", "CUST-4"]))[0]).toBe("uid");
  expect(guessTargets(["ID", "Name"], fields, [["", "New"]], new Set())[0]).toBe("");
});

test("a description cell in HTML becomes formatted text; broken HTML keeps its text", () => {
  const [header = [], ...rows] = JAMA;
  const { nodes, errors } = mapRows(rows, guessTargets(header, fields, rows, new Set()), fields);
  expect(errors).toEqual([]);
  expect(nodes[0]).toMatchObject({ kind: "folder", name: "Imaging" });
  expect(nodes[0]?.children?.[1]?.description).toEqual({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Images " },
          { type: "text", text: "shall", marks: [{ type: "bold" }] },
          { type: "text", text: " resolve 4 m on the ground." },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "Measured at nadir." }] },
    ],
  });
  expect(docToText(cellToDoc("<p>One<br>two&nbsp;three</p>"))).toBe("One\ntwo three");
  expect(cellToDoc("<p>Open <b>bold</p>")).toEqual(textToDoc("Open bold"));
  expect(cellToDoc("a < b")).toEqual(textToDoc("a < b"));
});
