import { expect, test } from "vitest";
import { parseCsv, toCsv } from "./csv.ts";
import { guessTargets, mapRows } from "./mapping.ts";

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
  expect(guessTargets(["Title", " STATUS ", "Text", "Owner", "Name"], fields)).toEqual([
    "name",
    "f-status",
    "description",
    "",
    "",
  ]);
});

test("rows become items with typed field values; bad cells are reported by spreadsheet row", () => {
  const targets = ["name", "description", "f-status", "f-weight", "f-safety", "f-due", "f-tags", "f-note", ""];
  const { items, errors } = mapRows(
    [
      ["Supply", "5 V DC", "approved", "1.5", "Yes", "2026-10-13T00:00:00.000Z", "blue; Red", "n/a", "ignored"],
      ["Bare", "", "", "", "", "", "", "", ""],
      ["", "no name", "", "", "", "", "", "", ""],
      ["Bad", "", "Maybe", "heavy", "perhaps", "13/10/2026", "Green", "", ""],
    ],
    targets,
    fields,
  );
  expect(items.slice(0, 2)).toEqual([
    {
      name: "Supply",
      description: "5 V DC",
      attributes: {
        "f-status": "Approved",
        "f-weight": 1.5,
        "f-safety": true,
        "f-due": "2026-10-13",
        "f-tags": ["Blue", "Red"],
        "f-note": "n/a",
      },
    },
    { name: "Bare", description: "", attributes: {} },
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
