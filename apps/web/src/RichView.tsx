import "katex/dist/katex.min.css";
import type { RichNode } from "@app/shared";
import { Typography } from "@mantine/core";
import katex from "katex";
import type { ReactNode } from "react";

const BLOCK_TAGS = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  blockquote: "blockquote",
  tableRow: "tr",
} as const;

function Equation({ latex, block }: { latex: string; block: boolean }) {
  const html = katex.renderToString(latex, { displayMode: block, throwOnError: false });
  // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX builds this markup itself and escapes the LaTeX source
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function render(node: RichNode, key: number): ReactNode {
  const children = node.content?.map(render);
  const attrs = node.attrs ?? {};
  switch (node.type) {
    case "text":
      return (node.marks ?? []).reduce<ReactNode>((inner, mark) => {
        if (mark.type === "bold") return <strong key={key}>{inner}</strong>;
        if (mark.type === "italic") return <em key={key}>{inner}</em>;
        if (mark.type === "underline") return <u key={key}>{inner}</u>;
        if (mark.type === "strike") return <s key={key}>{inner}</s>;
        if (mark.type === "code") return <code key={key}>{inner}</code>;
        if (mark.type === "link") {
          return (
            <a key={key} href={String(mark.attrs?.href)} target="_blank" rel="noopener noreferrer">
              {inner}
            </a>
          );
        }
        return inner;
      }, node.text);
    case "heading": {
      // Item text sits under page headings, so its own headings start lower.
      const Tag = Number(attrs.level) <= 2 ? "h3" : "h4";
      return <Tag key={key}>{children}</Tag>;
    }
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "table":
      return (
        <table key={key} style={{ borderCollapse: "collapse" }}>
          <tbody>{children}</tbody>
        </table>
      );
    case "image":
      return <img key={key} src={String(attrs.src)} alt={String(attrs.alt ?? "")} style={{ maxWidth: "100%" }} />;
    case "inlineMath":
    case "blockMath":
      return <Equation key={key} latex={String(attrs.latex ?? "")} block={node.type === "blockMath"} />;
    case "tableHeader":
    case "tableCell": {
      const Cell = node.type === "tableHeader" ? "th" : "td";
      return (
        <Cell
          key={key}
          style={{ border: "1px solid var(--mantine-color-gray-4)", padding: "4px 8px", textAlign: "left" }}
        >
          {children}
        </Cell>
      );
    }
    default: {
      const Tag = BLOCK_TAGS[node.type as keyof typeof BLOCK_TAGS];
      // Unknown node types cannot be saved (see richtext.ts), so this only guards against a future mismatch.
      return Tag ? <Tag key={key}>{children}</Tag> : null;
    }
  }
}

/** Read-only rendering of a rich-text document, without loading an editor. */
export function RichView({ doc }: { doc: RichNode }) {
  return <Typography>{doc.content?.map(render)}</Typography>;
}
