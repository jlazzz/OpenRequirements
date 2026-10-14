import { parseReqif, parseXml, serializeReqif, writeXml } from "@app/reqif";
import type { RichNode } from "@app/shared";
import { expect, test } from "vitest";
import {
  docToXhtml,
  guessReqifMapping,
  mapReqif,
  type ReqifTargetSet,
  summarizeReqif,
  toReqif,
  xhtmlToDoc,
} from "./reqif.ts";

const text = (value: string, ...marks: string[]): RichNode =>
  marks.length ? { type: "text", text: value, marks: marks.map((type) => ({ type })) } : { type: "text", text: value };
const p = (...content: RichNode[]): RichNode =>
  content.length ? { type: "paragraph", content } : { type: "paragraph" };
const SRC = "/api/attachments/11111111-1111-4111-8111-111111111111";

const rich: RichNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [text("Flow")] },
    p(
      text("The pump "),
      text("shall", "bold", "italic"),
      text(" deliver "),
      text("x", "underline"),
      text("y", "strike"),
      text("z", "code"),
      { type: "text", text: "a link", marks: [{ type: "link", attrs: { href: "https://example.com/a?b=1&c=2" } }] },
      { type: "hardBreak" },
      { type: "inlineMath", attrs: { latex: "V = I \\cdot R" } },
    ),
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            p(text("one")),
            { type: "orderedList", content: [{ type: "listItem", content: [p(text("nested"))] }] },
          ],
        },
      ],
    },
    { type: "blockquote", content: [p(text("quoted"))] },
    { type: "codeBlock", content: [text("  two  spaces\n<kept>")] },
    { type: "horizontalRule" },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 2 }, content: [p(text("Head"))] }] },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [p(text("a"))] },
            { type: "tableCell", content: [p()] },
          ],
        },
      ],
    },
    { type: "image", attrs: { src: SRC, alt: "Diagram" } },
    { type: "blockMath", attrs: { latex: "E = mc^2" } },
    p(),
  ],
};

test("rich text survives the trip to XHTML and back", () => {
  const xhtml = docToXhtml(rich, (src) => (src === SRC ? { data: "files/a.png", type: "image/png" } : null));
  const written = writeXml(xhtml);
  expect(written).toContain("<p>The pump <b><i>shall</i></b> deliver ");
  expect(written).toContain('<object data="files/a.png" type="image/png">Diagram</object>');
  expect(written).toContain('<span class="math">V = I \\cdot R</span>');
  expect(written).toContain('<th colspan="2"><p>Head</p></th>');
  // Through real XML text, as in a file.
  const back = xhtmlToDoc(parseXml(written), (data) => (data === "files/a.png" ? SRC : null));
  expect(back).toEqual({ doc: rich, dropped: 0 });
});

test("XHTML from other tools keeps its text; unknown formatting, scripts and unsafe links are dropped", () => {
  const read = (xml: string, image: (data: string) => string | null = () => null) =>
    xhtmlToDoc(parseXml(`<div>${xml}</div>`), image);

  expect(read("  loose <strong>text</strong>\n  <p>\n    A   paragraph\n  </p>  ").doc.content).toEqual([
    p(text("loose "), text("text", "bold")),
    p(text("A paragraph")),
  ]);
  expect(
    read(
      `<p><span style="color: red; font-weight: bold">red</span><font size="7"> big</font><sub>2</sub>` +
        `<a href="javascript:alert(1)">bad</a><script>alert(2)</script></p>`,
    ).doc.content,
  ).toEqual([p(text("red", "bold"), text(" big2bad"))]);

  // DOORS embeds an OLE object with a picture of it inside. The picture is used; with no picture, the text is.
  const ole = `<p>See <object data="x.ole" type="application/oleobject"><object data="x.png" type="image/png">Figure 1</object></object> here</p>`;
  expect(read(ole, (data) => (data === "x.png" ? SRC : null))).toEqual({
    doc: {
      type: "doc",
      content: [p(text("See")), { type: "image", attrs: { src: SRC, alt: "Figure 1" } }, p(text("here"))],
    },
    dropped: 0,
  });
  expect(read(ole)).toEqual({ doc: { type: "doc", content: [p(text("See Figure 1 here"))] }, dropped: 2 });

  expect(
    read("<ul><li><ul><li>deep</li></ul></li></ul><table><tbody><tr><td>cell</td></tr><tr/></tbody></table>").doc
      .content,
  ).toEqual([
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [p(), { type: "bulletList", content: [{ type: "listItem", content: [p(text("deep"))] }] }],
        },
      ],
    },
    { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [p(text("cell"))] }] }] },
  ]);
  expect(read("").doc).toEqual({ type: "doc", content: [p()] });
});

const fields = [
  { id: "f-status", name: "Status", type: "enum", options: ["Draft", "Approved"] },
  { id: "f-tags", name: "Tags", type: "multi_enum", options: ["Safety", "Legal"] },
  { id: "f-weight", name: "Weight", type: "number", options: null },
  { id: "f-due", name: "Due", type: "date", options: null },
  { id: "f-critical", name: "Critical", type: "boolean", options: null },
  { id: "f-why", name: "Rationale", type: "text", options: null },
];

test("sets export to ReqIF and import back through the guessed mapping as the same tree, values and relationships", () => {
  const node = (id: string, parentId: string | null, kind: "folder" | "item", name: string, more = {}) => ({
    id,
    parentId,
    kind,
    name,
    uid: kind === "item" ? `SYS-${id}` : null,
    description: null,
    attributes: null,
    ...more,
  });
  const sets = [
    {
      id: "set-sys",
      name: "System Requirements",
      itemTypeId: "type-req",
      itemType: "Requirement",
      fields,
      nodes: [
        node("1", null, "folder", "Power"),
        node("2", "1", "item", "Supply voltage", {
          description: rich,
          attributes: {
            "f-status": "Approved",
            "f-tags": ["Safety", "Legal"],
            "f-weight": 1.5,
            "f-due": "2026-10-13",
            "f-critical": true,
            "f-why": "Because",
          },
        }),
        node("3", null, "item", "Max current"),
        node("4", "gone", "item", "Orphan"),
      ],
    },
    {
      id: "set-un",
      name: "User Needs",
      itemTypeId: "type-need",
      itemType: "User Need",
      fields: [],
      nodes: [node("5", null, "item", "Portable")],
    },
  ];
  const linkTypes = [
    { id: "lt-derived", name: "Derived from" },
    { id: "lt-unused", name: "Related to" },
  ];
  const links = [
    { id: "l1", typeId: "lt-derived", upstreamId: "5", downstreamId: "2" },
    { id: "l2", typeId: "lt-derived", upstreamId: "5", downstreamId: "not-exported" },
  ];
  const { reqif, images } = toReqif(
    "Pump",
    sets,
    links,
    linkTypes,
    new Map([["11111111-1111-4111-8111-111111111111", "image/png"]]),
  );
  expect([...images]).toEqual([
    ["files/11111111-1111-4111-8111-111111111111.png", "11111111-1111-4111-8111-111111111111"],
  ]);
  expect(reqif.relations).toEqual([{ id: "_l1", typeId: "_lt-derived", sourceId: "_2", targetId: "_5" }]);
  expect(reqif.types.map((t) => t.name)).toEqual(["Requirement", "User Need", "Folder", "Set", "Derived from"]);

  const file = parseReqif(serializeReqif(reqif, new Date(0)));
  expect(file).toEqual(reqif);
  const summary = summarizeReqif(file);
  expect(summary.specifications[0]).toMatchObject({ name: "System Requirements", objects: 4 });
  expect(summary.specifications[0]?.attributes.find((a) => a.name === "Status")?.sample).toBe("Approved");

  const targets: ReqifTargetSet[] = sets.map((s) => ({ id: s.id, name: s.name, fields: s.fields }));
  const mapping = guessReqifMapping(summary, targets, linkTypes);
  const mapped = mapReqif(file, mapping, targets, () => SRC);
  expect(mapped.warnings).toEqual([]);
  expect(mapped).toMatchObject({ items: 4, folders: 1 });
  expect(mapped.body.links).toEqual([{ typeId: "lt-derived", upstream: "_5", downstream: "_2" }]);
  expect(mapped.body.sets[0]).toEqual({
    setId: "set-sys",
    nodes: [
      {
        kind: "folder",
        name: "Power",
        externalId: "_1",
        children: [
          {
            ref: "_2",
            externalId: "_2",
            kind: "item",
            name: "Supply voltage",
            description: rich,
            attributes: {
              "f-status": "Approved",
              "f-tags": ["Safety", "Legal"],
              "f-weight": 1.5,
              "f-due": "2026-10-13",
              "f-critical": true,
              "f-why": "Because",
            },
          },
        ],
      },
      { ref: "_3", externalId: "_3", kind: "item", name: "Max current", attributes: {} },
      { ref: "_4", externalId: "_4", kind: "item", name: "Orphan", attributes: {} },
    ],
  });
});

test("a module in DOORS style maps headings to folders, names items by their text, and reports what does not fit", () => {
  const value = (kind: string, id: string, inner: string, attr = "") =>
    `<ATTRIBUTE-VALUE-${kind}${attr}>${inner}<DEFINITION><ATTRIBUTE-DEFINITION-${kind}-REF>${id}</ATTRIBUTE-DEFINITION-${kind}-REF></DEFINITION></ATTRIBUTE-VALUE-${kind}>`;
  const xhtml = (id: string, inner: string) =>
    value("XHTML", id, `<THE-VALUE><reqif-xhtml:div>${inner}</reqif-xhtml:div></THE-VALUE>`);
  const object = (id: string, values: string) =>
    `<SPEC-OBJECT IDENTIFIER="${id}"><VALUES>${values}</VALUES><TYPE><SPEC-OBJECT-TYPE-REF>t</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT>`;
  const definition = (kind: string, id: string, name: string) =>
    `<ATTRIBUTE-DEFINITION-${kind} IDENTIFIER="${id}" LONG-NAME="${name}"><TYPE><DATATYPE-DEFINITION-${kind}-REF>d${kind}</DATATYPE-DEFINITION-${kind}-REF></TYPE></ATTRIBUTE-DEFINITION-${kind}>`;
  const entry = (id: string, children = "") =>
    `<SPEC-HIERARCHY IDENTIFIER="h${id}"><OBJECT><SPEC-OBJECT-REF>${id}</SPEC-OBJECT-REF></OBJECT>${children && `<CHILDREN>${children}</CHILDREN>`}</SPEC-HIERARCHY>`;
  const relation = (id: string, source: string, target: string) =>
    `<SPEC-RELATION IDENTIFIER="${id}"><TYPE><SPEC-RELATION-TYPE-REF>rt</SPEC-RELATION-TYPE-REF></TYPE><SOURCE><SPEC-OBJECT-REF>${source}</SPEC-OBJECT-REF></SOURCE><TARGET><SPEC-OBJECT-REF>${target}</SPEC-OBJECT-REF></TARGET></SPEC-RELATION>`;
  const file = parseReqif(`<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:reqif-xhtml="http://www.w3.org/1999/xhtml">
<CORE-CONTENT><REQ-IF-CONTENT>
<DATATYPES><DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="dENUMERATION"><SPECIFIED-VALUES>
  <ENUM-VALUE IDENTIFIER="v1" LONG-NAME="approved"/><ENUM-VALUE IDENTIFIER="v2" LONG-NAME="Obsolete"/>
</SPECIFIED-VALUES></DATATYPE-DEFINITION-ENUMERATION></DATATYPES>
<SPEC-TYPES>
  <SPEC-OBJECT-TYPE IDENTIFIER="t" LONG-NAME="Requirement Type"><SPEC-ATTRIBUTES>
    ${definition("XHTML", "heading", "ReqIF.ChapterName")}${definition("XHTML", "text", "ReqIF.Text")}
    ${definition("STRING", "id", "ReqIF.ForeignID")}${definition("ENUMERATION", "status", "Status")}
  </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>
  <SPEC-RELATION-TYPE IDENTIFIER="rt" LONG-NAME="satisfies"/>
</SPEC-TYPES>
<SPEC-OBJECTS>
  ${object("o1", xhtml("heading", "Introduction") + value("STRING", "id", "", ' THE-VALUE="1"'))}
  ${object("o2", xhtml("text", `<reqif-xhtml:p>The system shall start within 5 seconds of power on, in every mode. ${"More text. ".repeat(10)}</reqif-xhtml:p>`) + value("ENUMERATION", "status", "<VALUES><ENUM-VALUE-REF>v1</ENUM-VALUE-REF></VALUES>"))}
  ${object("o3", xhtml("heading", "Timing") + xhtml("text", "This section has its own text."))}
  ${object("o4", xhtml("text", "Shutdown takes 2 s.") + value("ENUMERATION", "status", "<VALUES><ENUM-VALUE-REF>v2</ENUM-VALUE-REF></VALUES>"))}
  ${object("o5", "")}
</SPEC-OBJECTS>
<SPEC-RELATIONS>${relation("r1", "o4", "o2")}${relation("r2", "o2", "o4")}${relation("r3", "o1", "o2")}${relation("r4", "o4", "elsewhere")}</SPEC-RELATIONS>
<SPECIFICATIONS><SPECIFICATION IDENTIFIER="s" LONG-NAME="SRS"><CHILDREN>
  ${entry("o1", entry("o2") + entry("o3", entry("o4")))}${entry("o5")}${entry("missing")}
</CHILDREN></SPECIFICATION></SPECIFICATIONS>
</REQ-IF-CONTENT></CORE-CONTENT></REQ-IF>`);

  const summary = summarizeReqif(file);
  expect(summary).toEqual({
    specifications: [
      {
        id: "s",
        name: "SRS",
        objects: 5,
        attributes: [
          { id: "heading", name: "ReqIF.ChapterName", kind: "xhtml", sample: "Introduction" },
          { id: "text", name: "ReqIF.Text", kind: "xhtml", sample: expect.stringContaining("The system shall start") },
          { id: "id", name: "ReqIF.ForeignID", kind: "string", sample: "1" },
          {
            id: "status",
            name: "Status",
            kind: "enumeration",
            sample: "approved",
            values: ["approved", "Obsolete"],
            multi: false,
          },
        ],
      },
    ],
    relationTypes: [{ id: "rt", name: "satisfies", count: 4 }],
  });

  const set: ReqifTargetSet = { id: "set", name: "System Requirements", fields };
  const guessed = guessReqifMapping(summary, [set], [{ id: "lt", name: "Derived from" }]);
  // Nothing has the same name, so nothing is imported until the user chooses.
  expect(guessed).toEqual({
    specifications: { s: { setId: "", targets: { heading: "name", text: "description", id: "", status: "" } } },
    relations: { rt: { typeId: "", reverse: false } },
  });
  expect(mapReqif(file, guessed, [set], () => null).body).toEqual({ sets: [], links: [] });

  const mapped = mapReqif(
    file,
    {
      specifications: {
        s: { setId: "set", targets: { heading: "name", text: "description", id: "f-why", status: "f-status" } },
      },
      relations: { rt: { typeId: "lt", reverse: false } },
    },
    [set],
    () => null,
  );
  const [intro] = mapped.body.sets[0]?.nodes ?? [];
  expect(intro).toMatchObject({ kind: "folder", name: "Introduction" });
  expect(intro?.children?.map((n) => [n.kind, n.name, n.ref])).toEqual([
    [
      "item",
      `${"The system shall start within 5 seconds of power on, in every mode. More text. More text. More text. ".slice(0, 99)}…`,
      "o2",
    ],
    ["folder", "Timing", undefined],
  ]);
  expect(intro?.children?.[0]?.attributes).toEqual({ "f-status": "Approved" });
  // A heading with its own text: the folder, then that text as its first item, then what was below it.
  expect(intro?.children?.[1]?.children).toEqual([
    {
      ref: "o3",
      externalId: "o3",
      kind: "item",
      name: "Timing",
      attributes: {},
      description: { type: "doc", content: [p(text("This section has its own text."))] },
    },
    {
      ref: "o4",
      externalId: "o4",
      kind: "item",
      name: "Shutdown takes 2 s.",
      attributes: {},
      description: { type: "doc", content: [p(text("Shutdown takes 2 s."))] },
    },
  ]);
  expect(mapped.body.sets[0]?.nodes[1]).toEqual({
    ref: "o5",
    externalId: "o5",
    kind: "item",
    name: "Untitled",
    attributes: {},
  });
  // The source is the downstream item unless the mapping says otherwise.
  expect(mapped.body.links).toEqual([{ typeId: "lt", upstream: "o2", downstream: "o4" }]);
  expect(mapped).toMatchObject({ items: 4, folders: 2 });
  expect(mapped.warnings.sort()).toEqual([
    '1 × Status: "Obsolete" must be one of: Draft, Approved. Left empty',
    "1 × entries point to an object that is not in the file and were left out",
    "1 × relationships repeat another one between the same two items and were left out",
    "2 × relationships have an end that is not among the imported items and were left out",
  ]);
});
