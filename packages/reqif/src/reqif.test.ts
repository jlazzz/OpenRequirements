import { expect, test } from "vitest";
import { parseReqif, type Reqif, serializeReqif } from "./reqif.ts";
import { parseXml, textOf, writeXml } from "./xml.ts";
import { unzip, zip } from "./zip.ts";

test("XML is read into a tree without prefixes, and written back escaped", () => {
  const root = parseXml(
    `﻿<?xml version="1.0"?>\n<!-- note --><a:doc xmlns:a="urn:a" title='5 &lt; 6 &amp; "x"'>one <b>t&#233;xt</b><![CDATA[<raw>&amp;]]><c/></a:doc>\n`,
  );
  expect(root).toEqual({
    name: "doc",
    attrs: { "xmlns:a": "urn:a", title: '5 < 6 & "x"' },
    children: [
      "one ",
      { name: "b", attrs: {}, children: ["téxt"] },
      "<raw>&amp;",
      { name: "c", attrs: {}, children: [] },
    ],
  });
  expect(textOf(root)).toBe("one téxt<raw>&amp;");
  expect(
    writeXml({
      name: "p",
      attrs: { t: 'a"<b\n' },
      children: ["x < y & z\u0000", { name: "br", attrs: {}, children: [] }],
    }),
  ).toBe('<p t="a&quot;&lt;b&#10;">x &lt; y &amp; z<br/></p>');
});

test("broken XML and document type declarations are refused", () => {
  expect(() => parseXml("<a><b></a>")).toThrow("Unexpected </a>");
  expect(() => parseXml("<a>")).toThrow("never closed");
  expect(() => parseXml("<a/><b/>")).toThrow("Not an XML document");
  expect(() => parseXml('<a b="1>')).toThrow("Malformed XML");
  // No DTD means no declared entities: the classic expansion and file-reading attacks have nothing to work with.
  expect(() => parseXml('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>')).toThrow("document type");
  expect(parseXml("<a>&unknown;</a>").children).toEqual(["&unknown;"]);
  expect(() => parseXml("<a>".repeat(300) + "</a>".repeat(300))).toThrow("nested too deeply");
});

test("a zip archive is written and read back", async () => {
  const text = new TextEncoder().encode("hello ".repeat(1000));
  const packed = await zip([
    { name: "spec.reqif", data: text },
    { name: "files/ä.png", data: new Uint8Array([1, 2, 3]) },
  ]);
  expect(packed.length).toBeLessThan(text.length);
  const files = await unzip(packed);
  expect([...files.keys()]).toEqual(["spec.reqif", "files/ä.png"]);
  expect(files.get("spec.reqif")).toEqual(text);
  expect(files.get("files/ä.png")).toEqual(new Uint8Array([1, 2, 3]));
  await expect(unzip(new Uint8Array(100))).rejects.toThrow("Not a zip archive");
});

const sample: Reqif = {
  title: "Pump <1>",
  types: [
    {
      id: "_t1",
      name: "Requirement",
      kind: "object",
      attributes: [
        { id: "_a_name", name: "ReqIF.Name", kind: "string" },
        { id: "_a_text", name: "ReqIF.Text", kind: "xhtml" },
        { id: "_a_n", name: "Count", kind: "integer" },
        { id: "_a_r", name: "Weight", kind: "real" },
        { id: "_a_b", name: "Safety", kind: "boolean" },
        { id: "_a_d", name: "Due", kind: "date" },
        {
          id: "_a_e",
          name: "Status",
          kind: "enumeration",
          multi: false,
          values: [
            { id: "_v1", name: "Draft" },
            { id: "_v2", name: "Approved" },
          ],
        },
      ],
    },
    { id: "_t2", name: "Set", kind: "specification", attributes: [] },
    { id: "_t3", name: "Verified by", kind: "relation", attributes: [] },
  ],
  objects: [
    {
      id: "_o1",
      name: "SYS-001",
      typeId: "_t1",
      values: {
        _a_name: 'Flow & "rate"',
        _a_text: {
          name: "div",
          attrs: {},
          children: [
            {
              name: "p",
              attrs: {},
              children: ["The pump ", { name: "b", attrs: {}, children: ["shall"] }, " deliver."],
            },
          ],
        },
        _a_n: 3,
        _a_r: 1.5,
        _a_b: true,
        _a_d: "2026-10-13T00:00:00Z",
        _a_e: ["_v2"],
      },
    },
    { id: "_o2", name: "", typeId: "_t1", values: {} },
  ],
  specifications: [
    {
      id: "_s1",
      name: "System Requirements",
      typeId: "_t2",
      values: {},
      children: [{ objectId: "_o1", children: [{ objectId: "_o2", children: [] }] }],
    },
  ],
  relations: [{ id: "_r1", typeId: "_t3", sourceId: "_o2", targetId: "_o1" }],
};

test("a ReqIF file is written and read back unchanged", () => {
  const xml = serializeReqif(sample, new Date("2026-10-13T12:00:00Z"));
  expect(xml).toContain("<xhtml:p>The pump <xhtml:b>shall</xhtml:b> deliver.</xhtml:p>");
  expect(xml).toContain('LAST-CHANGE="2026-10-13T12:00:00.000Z"');
  expect(parseReqif(xml)).toEqual(sample);
  expect(() => parseReqif("<html/>")).toThrow("Not a ReqIF file");
});

test("a file in another tool's style is read: other prefixes, bare XHTML content, unknown parts", () => {
  const reqif = parseReqif(`<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:reqif-xhtml="http://www.w3.org/1999/xhtml">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h"><TITLE>Module</TITLE></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES>
      <DATATYPE-DEFINITION-XHTML IDENTIFIER="dx" LONG-NAME="XHTML"/>
      <DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="de" LONG-NAME="Prio">
        <SPECIFIED-VALUES><ENUM-VALUE IDENTIFIER="high" LONG-NAME="High"/><ENUM-VALUE IDENTIFIER="low"/></SPECIFIED-VALUES>
      </DATATYPE-DEFINITION-ENUMERATION>
    </DATATYPES>
    <SPEC-TYPES>
      <SPEC-OBJECT-TYPE IDENTIFIER="t" LONG-NAME="Req">
        <SPEC-ATTRIBUTES>
          <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="text" LONG-NAME="ReqIF.Text"><TYPE><DATATYPE-DEFINITION-XHTML-REF>dx</DATATYPE-DEFINITION-XHTML-REF></TYPE></ATTRIBUTE-DEFINITION-XHTML>
          <ATTRIBUTE-DEFINITION-ENUMERATION IDENTIFIER="prio" LONG-NAME="Priority" MULTI-VALUED="true">
            <TYPE><DATATYPE-DEFINITION-ENUMERATION-REF>de</DATATYPE-DEFINITION-ENUMERATION-REF></TYPE>
          </ATTRIBUTE-DEFINITION-ENUMERATION>
        </SPEC-ATTRIBUTES>
      </SPEC-OBJECT-TYPE>
      <RELATION-GROUP-TYPE IDENTIFIER="g"/>
    </SPEC-TYPES>
    <SPEC-OBJECTS>
      <SPEC-OBJECT IDENTIFIER="o1">
        <TYPE><SPEC-OBJECT-TYPE-REF>t</SPEC-OBJECT-TYPE-REF></TYPE>
        <VALUES>
          <ATTRIBUTE-VALUE-XHTML>
            <THE-VALUE>bare <reqif-xhtml:b>text</reqif-xhtml:b></THE-VALUE>
            <DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>text</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION>
          </ATTRIBUTE-VALUE-XHTML>
          <ATTRIBUTE-VALUE-ENUMERATION>
            <VALUES><ENUM-VALUE-REF>high</ENUM-VALUE-REF><ENUM-VALUE-REF>low</ENUM-VALUE-REF></VALUES>
            <DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>prio</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION>
          </ATTRIBUTE-VALUE-ENUMERATION>
          <ATTRIBUTE-VALUE-STRING THE-VALUE="x"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>gone</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>
        </VALUES>
      </SPEC-OBJECT>
    </SPEC-OBJECTS>
    <SPECIFICATIONS>
      <SPECIFICATION IDENTIFIER="s" LONG-NAME="Module">
        <CHILDREN><SPEC-HIERARCHY IDENTIFIER="h1"><OBJECT><SPEC-OBJECT-REF>o1</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY></CHILDREN>
      </SPECIFICATION>
    </SPECIFICATIONS>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`);
  expect(reqif.title).toBe("Module");
  expect(reqif.types).toHaveLength(1);
  expect(reqif.types[0]?.attributes[1]).toEqual({
    id: "prio",
    name: "Priority",
    kind: "enumeration",
    multi: true,
    values: [
      { id: "high", name: "High" },
      { id: "low", name: "low" },
    ],
  });
  expect(reqif.objects[0]?.values).toEqual({
    text: { name: "div", attrs: {}, children: ["bare ", { name: "b", attrs: {}, children: ["text"] }] },
    prio: ["high", "low"],
  });
  expect(reqif.specifications[0]).toMatchObject({
    name: "Module",
    typeId: "",
    children: [{ objectId: "o1", children: [] }],
  });
});
