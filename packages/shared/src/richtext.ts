/** A rich-text document in the editor's (ProseMirror/TipTap) JSON form. See docs/adr/0005. */
export type RichNode = {
  type: string;
  text?: string;
  content?: RichNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
};

export const emptyDoc: RichNode = { type: "doc", content: [{ type: "paragraph" }] };

// Extend these lists when the editor gains a feature.
const NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "image",
  "inlineMath",
  "blockMath",
]);
const MARKS = new Set(["bold", "italic", "underline", "strike", "code", "link"]);
const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
// Images must be files uploaded to this server: no external or data: URLs.
const ATTACHMENT_SRC = /^\/api\/attachments\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const MAX_LATEX = 2000;
const MAX_DEPTH = 30;

/** Returns why a value is not an acceptable document, or null when it is. Trust boundary: run on everything a client sends. */
export function docError(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "Malformed text";
  const check = (node: unknown, depth: number): string | null => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return "Malformed text";
    const { type, text, content, marks, attrs } = node as Record<string, unknown> & { attrs?: Record<string, unknown> };
    if (typeof type !== "string" || !NODES.has(type)) return `Unsupported content: ${String(type)}`;
    if (depth > MAX_DEPTH) return "Text is nested too deeply";
    if (type === "text" ? typeof text !== "string" : text !== undefined) return "Malformed text";
    if (type === "image" && !(typeof attrs?.src === "string" && ATTACHMENT_SRC.test(attrs.src))) {
      return "Images must be uploaded, not linked from elsewhere";
    }
    if (
      (type === "inlineMath" || type === "blockMath") &&
      !(typeof attrs?.latex === "string" && attrs.latex.length <= MAX_LATEX)
    ) {
      return "Malformed equation";
    }
    for (const mark of Array.isArray(marks) ? marks : marks === undefined ? [] : [null]) {
      const { type: markType, attrs: markAttrs } = (mark ?? {}) as { type?: unknown; attrs?: Record<string, unknown> };
      if (typeof markType !== "string" || !MARKS.has(markType)) return `Unsupported formatting: ${String(markType)}`;
      // Only web and email links: blocks javascript: and data: URLs.
      if (markType === "link" && !(typeof markAttrs?.href === "string" && SAFE_LINK.test(markAttrs.href))) {
        return "Links must start with http://, https:// or mailto:";
      }
    }
    if (content === undefined) return null;
    if (!Array.isArray(content)) return "Malformed text";
    for (const child of content) {
      const problem = check(child, depth + 1);
      if (problem) return problem;
    }
    return null;
  };
  if ((value as RichNode | null)?.type !== "doc") return "Malformed text";
  return check(value, 0);
}

/** The plain text of a document, one line per paragraph, heading or list entry. Used for diffs, search and export. */
export function docToText(node: RichNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  // An equation reads as its LaTeX source; an image as its alternative text.
  if (node.type === "inlineMath" || node.type === "blockMath") return String(node.attrs?.latex ?? "");
  if (node.type === "image") return String(node.attrs?.alt ?? "");
  const parts = (node.content ?? []).map(docToText);
  return TEXT_BLOCKS.has(node.type) ? parts.join("") : parts.filter((part) => part !== "").join("\n");
}

/** A document with one paragraph per line of plain text. */
export function textToDoc(text: string): RichNode {
  if (text === "") return emptyDoc;
  return {
    type: "doc",
    content: text
      .split("\n")
      .map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
  };
}
