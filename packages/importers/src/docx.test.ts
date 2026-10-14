import { parseXml, unzip, zip } from "@app/reqif";
import type { RichNode } from "@app/shared";
import { expect, test } from "vitest";
import { imageSize, imagesOf, readDocx, toDocx, wordRows, wordTree } from "./docx.ts";
import type { ExportSet } from "./reqif.ts";

const text = (value: string, marks?: RichNode["marks"]): RichNode => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const para = (...content: RichNode[]): RichNode => ({ type: "paragraph", content });
const png = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};
const image = "/api/attachments/11111111-1111-4111-8111-111111111111";

const description: RichNode = {
  type: "doc",
  content: [
    para(
      text("The pump "),
      text("shall", [{ type: "bold" }]),
      text(" stop & "),
      text("see", [{ type: "link", attrs: { href: "https://example.com/?a=1&b=2" } }]),
    ),
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            para(text("one")),
            { type: "orderedList", content: [{ type: "listItem", content: [para(text("one.a"))] }] },
          ],
        },
        { type: "listItem", content: [para(text("two"))] },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [para(text("Mode"))] },
            { type: "tableHeader", content: [para(text("Rate"))] },
          ],
        },
        { type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 2 }, content: [para(text("Bolus"))] }] },
      ],
    },
    { type: "image", attrs: { src: image, alt: "Diagram" } },
    para(text("Second line", [{ type: "italic" }, { type: "underline" }])),
  ],
};
const set: ExportSet = {
  id: "s",
  name: "System Requirements",
  itemTypeId: "t",
  itemType: "Requirement",
  fields: [
    { id: "f-status", name: "Status", type: "enum", options: ["Draft", "Approved"] },
    { id: "f-safe", name: "Safety", type: "boolean", options: null },
  ],
  nodes: [
    { id: "f1", parentId: null, kind: "folder", name: "Power", uid: null, description: null, attributes: null },
    { id: "f2", parentId: "f1", kind: "folder", name: "Battery", uid: null, description: null, attributes: null },
    {
      id: "i1",
      parentId: "f1",
      kind: "item",
      name: "Supply voltage",
      uid: "SYS-001",
      description,
      attributes: { "f-status": "Approved", "f-safe": true },
    },
    { id: "i2", parentId: "f2", kind: "item", name: "Charge", uid: "SYS-002", description: null, attributes: {} },
    { id: "i3", parentId: null, kind: "item", name: "Loose", uid: "SYS-003", description: null, attributes: null },
  ],
};

test("image sizes are read from PNG, GIF and JPEG headers", () => {
  expect(imageSize(png(640, 480))).toEqual([640, 480]);
  expect(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x20, 0x00]))).toEqual([16, 32]);
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03,
  ]);
  expect(imageSize(jpeg)).toEqual([64, 48]);
  expect(imageSize(new Uint8Array([0x89, 0x50]))).toBeNull();
  expect(imagesOf([set])).toEqual(new Set(["11111111-1111-4111-8111-111111111111"]));
});

test("a set exported to Word reads back as the same folders, items and rich text", async () => {
  const bytes = await toDocx(
    { title: "System Requirements", lines: ["Project P", "Exported 2026-10-14"], header: "System Requirements" },
    [set],
    new Map([["11111111-1111-4111-8111-111111111111", { data: png(1600, 800), type: "image/png" }]]),
  );
  const files = await unzip(bytes);
  // Every part is well-formed XML.
  for (const [name, data] of files)
    if (name.endsWith(".xml") || name.endsWith(".rels")) parseXml(new TextDecoder().decode(data));
  expect([...files.keys()].sort()).toEqual([
    "[Content_Types].xml",
    "_rels/.rels",
    "word/_rels/document.xml.rels",
    "word/document.xml",
    "word/footer1.xml",
    "word/header1.xml",
    "word/media/image1.png",
    "word/numbering.xml",
    "word/styles.xml",
  ]);
  const document = new TextDecoder().decode(files.get("word/document.xml"));
  // Scaled to the page width, keeping its proportions.
  expect(document).toContain('<wp:extent cx="5760720" cy="2880360"/>');
  expect(document).toContain("Approved");

  const stored: string[] = [];
  const { blocks, dropped } = readDocx(files, (path) => {
    stored.push(path);
    return image;
  });
  expect(dropped).toBe(0);
  expect(stored).toEqual(["word/media/image1.png"]);
  const rows = wordRows(blocks, "paragraph", new Set(["SYS-001", "SYS-003"]));
  expect(rows.map((r) => (r.kind === "folder" ? `${r.level} ${r.name}` : `${r.uid ?? "new"} ${r.name}`))).toEqual([
    "1 Power",
    "2 Battery",
    "new SYS-002 Charge",
    "SYS-001 Supply voltage",
    "SYS-003 Loose",
  ]);
  const supply = rows[3];
  expect(supply?.kind === "item" && { type: "doc", content: supply.content }).toEqual(description);
});

test("a heading with text below it is an item in heading mode, and the review step skips and merges rows", () => {
  const blocks = [
    { kind: "heading", level: 1, text: "Power" },
    { kind: "heading", level: 2, text: "Voltage" },
    { kind: "content", node: para(text("5 V")), text: "5 V" },
    { kind: "content", node: para(text("±5 %")), text: "±5 %" },
    { kind: "heading", level: 2, text: "Current" },
    { kind: "heading", level: 1, text: "Other" },
  ] as const;
  const rows = wordRows([...blocks], "heading", new Set());
  expect(rows).toEqual([
    { kind: "folder", level: 1, name: "Power" },
    { kind: "item", name: "Voltage", content: [para(text("5 V")), para(text("±5 %"))] },
    { kind: "item", name: "Current", content: [] },
    { kind: "item", name: "Other", content: [] },
  ]);
  expect(wordRows([...blocks], "paragraph", new Set()).map((r) => r.name)).toEqual([
    "Power",
    "Voltage",
    "5 V",
    "±5 %",
    "Current",
    "Other",
  ]);

  const flat = wordRows([...blocks], "paragraph", new Set());
  // Skip the "Voltage" folder (its items move up to Power), merge "±5 %" into "5 V", reuse the existing Power folder.
  const tree = wordTree(flat, new Set([1]), new Set([3]), [{ id: "p", parentId: null, name: "Power" }]);
  expect(tree).toMatchObject({ items: 1, folders: 2 });
  expect(tree.nodes).toEqual([
    {
      kind: "folder",
      name: "Power",
      id: "p",
      children: [
        { kind: "item", name: "5 V", description: { type: "doc", content: [para(text("5 V")), para(text("±5 %"))] } },
        { kind: "folder", name: "Current", children: [] },
      ],
    },
    { kind: "folder", name: "Other", children: [] },
  ]);
});

test("a Word file's own styles, numbering, merged cells, links and tracked changes are read", async () => {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="r"';
  const p = (inner: string, props = "") => `<w:p><w:pPr>${props}</w:pPr>${inner}</w:p>`;
  const r = (value: string, props = "") => `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${value}</w:t></w:r>`;
  const document = `<w:document ${w}><w:body>
    ${p(r("Cover"), '<w:pStyle w:val="Titel"/>')}
    ${p(r("Einleitung"), '<w:pStyle w:val="berschrift1"/>')}
    ${p(r("Outline only"), '<w:outlineLvl w:val="1"/>')}
    ${p(`${r("Bold ", "<w:b/>")}${r("not", '<w:b w:val="0"/>')}<w:del><w:r><w:delText>gone</w:delText></w:r></w:del><w:ins>${r(" kept")}</w:ins><w:hyperlink r:id="rIdLink">${r("link")}</w:hyperlink><w:hyperlink r:id="rIdBad">${r(" bad")}</w:hyperlink>`)}
    ${p("")}
    ${p(r("first"), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr>')}
    ${p(r("nested"), '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="5"/></w:numPr>')}
    ${p(r("styled bullet"), '<w:pStyle w:val="ListBullet"/>')}
    <w:tbl><w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>${p(r("tall"))}</w:tc><w:tc>${p(r("a"))}</w:tc></w:tr>
      <w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr>${p("")}</w:tc><w:tc>${p(r("b"))}</w:tc></w:tr></w:tbl>
    <w:tbl><w:tblPr><w:tblStyle w:val="ItemFields"/></w:tblPr><w:tr><w:tc>${p(r("Status"))}</w:tc></w:tr></w:tbl>
    <w:sdt><w:sdtContent>${p(r("In a control"))}</w:sdtContent></w:sdt>
  </w:body></w:document>`;
  const styles = `<w:styles ${w}>
    <w:style w:styleId="Titel"><w:name w:val="Title"/></w:style>
    <w:style w:styleId="berschrift1"><w:name w:val="heading 1"/></w:style>
    <w:style w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:numId w:val="6"/></w:numPr></w:pPr></w:style>
    <w:style w:styleId="ItemFields"><w:name w:val="Item Fields"/></w:style>
  </w:styles>`;
  const numbering = `<w:numbering ${w}>
    <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
    <w:num w:numId="5"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="6"><w:abstractNumId w:val="1"/></w:num>
  </w:numbering>`;
  const rels = `<Relationships><Relationship Id="rIdLink" Target="https://example.com" TargetMode="External"/><Relationship Id="rIdBad" Target="javascript:alert(1)" TargetMode="External"/></Relationships>`;
  const encode = (value: string) => new TextEncoder().encode(value);
  const files = await unzip(
    await zip([
      { name: "word/document.xml", data: encode(document) },
      { name: "word/styles.xml", data: encode(styles) },
      { name: "word/numbering.xml", data: encode(numbering) },
      { name: "word/_rels/document.xml.rels", data: encode(rels) },
    ]),
  );
  const { blocks } = readDocx(files, () => null);
  expect(blocks.map((b) => (b.kind === "content" ? b.node.type : `${b.kind} ${b.text}`))).toEqual([
    "heading Einleitung",
    "heading Outline only",
    "paragraph",
    "orderedList",
    "bulletList",
    "table",
    "paragraph",
  ]);
  const content = blocks.flatMap((b) => (b.kind === "content" ? [b.node] : []));
  expect(content[0]).toEqual(
    para(
      text("Bold ", [{ type: "bold" }]),
      text("not kept"),
      text("link", [{ type: "link", attrs: { href: "https://example.com" } }]),
      text(" bad"),
    ),
  );
  expect(content[1]).toEqual({
    type: "orderedList",
    content: [
      {
        type: "listItem",
        content: [
          para(text("first")),
          { type: "bulletList", content: [{ type: "listItem", content: [para(text("nested"))] }] },
        ],
      },
    ],
  });
  expect(content[3]).toEqual({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableCell", attrs: { rowspan: 2 }, content: [para(text("tall"))] },
          { type: "tableCell", content: [para(text("a"))] },
        ],
      },
      { type: "tableRow", content: [{ type: "tableCell", content: [para(text("b"))] }] },
    ],
  });
  expect(() => readDocx(new Map(), () => null)).toThrow("not a Word document");
});
