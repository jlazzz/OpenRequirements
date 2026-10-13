import { expect, test } from "vitest";
import { docError, docToText, emptyDoc, type RichNode, textToDoc } from "./richtext.ts";

const text = (value: string, ...marks: NonNullable<RichNode["marks"]>): RichNode => ({
  type: "text",
  text: value,
  marks,
});
const doc = (...content: RichNode[]): RichNode => ({ type: "doc", content });
const p = (...content: RichNode[]): RichNode => ({ type: "paragraph", content });

test("plain text converts to a document and back", () => {
  expect(docToText(textToDoc("one\n\nthree"))).toBe("one\nthree");
  expect(docToText(textToDoc("single"))).toBe("single");
  expect(textToDoc("")).toEqual(emptyDoc);
  expect(docToText(emptyDoc)).toBe("");
});

test("docToText flattens headings, lists and line breaks", () => {
  const rich = doc(
    { type: "heading", attrs: { level: 2 }, content: [text("Power")] },
    p(text("The device "), text("shall", { type: "bold" }), text(" run."), { type: "hardBreak" }, text("Always.")),
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [p(text("a"))] },
        { type: "listItem", content: [p(text("b"))] },
      ],
    },
  );
  expect(docToText(rich)).toBe("Power\nThe device shall run.\nAlways.\na\nb");
  expect(docError(rich)).toBeNull();
});

test("docError accepts safe links and the empty document", () => {
  expect(docError(emptyDoc)).toBeNull();
  for (const href of ["https://example.com", "http://example.com/a?b=1", "mailto:a@example.com"]) {
    expect(docError(doc(p(text("x", { type: "link", attrs: { href } })))), href).toBeNull();
  }
});

test.each([
  ["a string", "plain"],
  ["null", null],
  ["not a doc at the top", p(text("x"))],
  ["an unknown node", doc({ type: "script", content: [text("alert(1)")] })],
  ["an unknown mark", doc(p(text("x", { type: "style" })))],
  ["a javascript link", doc(p(text("x", { type: "link", attrs: { href: "javascript:alert(1)" } })))],
  ["a data link", doc(p(text("x", { type: "link", attrs: { href: " data:text/html,x" } })))],
  ["a link with no href", doc(p(text("x", { type: "link" })))],
  ["text that is not a string", doc(p({ type: "text", text: 5 as unknown as string }))],
  ["content that is not a list", doc({ type: "paragraph", content: "x" as unknown as RichNode[] })],
  ["marks that are not a list", doc(p({ type: "text", text: "x", marks: "bold" as unknown as [] }))],
])("docError rejects %s", (_name, value) => {
  expect(docError(value)).toEqual(expect.any(String));
});

test("docError rejects absurd nesting", () => {
  let node: RichNode = p(text("x"));
  for (let i = 0; i < 40; i++) node = { type: "blockquote", content: [node] };
  expect(docError(doc(node))).toBe("Text is nested too deeply");
});

test("tables, uploaded images and equations are accepted and read as text", () => {
  const cell = (type: string, value: string): RichNode => ({ type, content: [p(text(value))] });
  const rich = doc(
    { type: "table", content: [{ type: "tableRow", content: [cell("tableHeader", "Pin"), cell("tableCell", "VCC")] }] },
    p(text("E = "), { type: "inlineMath", attrs: { latex: "mc^2" } }),
    { type: "blockMath", attrs: { latex: "a^2+b^2" } },
    { type: "image", attrs: { src: "/api/attachments/123e4567-e89b-42d3-a456-426614174000", alt: "Block diagram" } },
  );
  expect(docError(rich)).toBeNull();
  expect(docToText(rich)).toBe("Pin\nVCC\nE = mc^2\na^2+b^2\nBlock diagram");
});

test.each([
  ["an external image", { type: "image", attrs: { src: "https://evil.example/track.png" } }],
  ["a data: image", { type: "image", attrs: { src: "data:image/png;base64,AAAA" } }],
  ["an image path outside attachments", { type: "image", attrs: { src: "/api/attachments/../session" } }],
  ["an image with no source", { type: "image" }],
  ["an equation with no source", { type: "inlineMath" }],
  ["an oversized equation", { type: "blockMath", attrs: { latex: "x".repeat(2001) } }],
])("docError rejects %s", (_name, node) => {
  expect(docError(doc(node))).toEqual(expect.any(String));
});
