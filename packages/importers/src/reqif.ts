import {
  type Reqif,
  type ReqifAttribute,
  type ReqifKind,
  type ReqifNode,
  type ReqifObject,
  type ReqifType,
  type ReqifValue,
  type ReqifValues,
  textOf,
  type XmlElement,
  type XmlNode,
} from "@app/reqif";
import { docToText, type RichNode, type Step, stepsToText, textToDoc } from "@app/shared";
import { coerce, type ImportField, type Target } from "./mapping.ts";

const x = (name: string, attrs: Record<string, string> = {}, children: XmlNode[] = []): XmlElement => ({
  name,
  attrs,
  children,
});

// ReqIF's XHTML has no <u> or <s>, so those two are written as styled spans.
const MARK_TAGS: Record<string, [string, Record<string, string>]> = {
  bold: ["b", {}],
  italic: ["i", {}],
  code: ["code", {}],
  underline: ["span", { style: "text-decoration: underline;" }],
  strike: ["span", { style: "text-decoration: line-through;" }],
};
const BLOCK_TAGS: Record<string, string> = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  blockquote: "blockquote",
  codeBlock: "pre",
  horizontalRule: "hr",
  hardBreak: "br",
  table: "table",
  tableRow: "tr",
  tableHeader: "th",
  tableCell: "td",
};

/**
 * A rich-text document as the XHTML that ReqIF carries. `image` says where an embedded image will sit in the
 * archive and what it is; an image it does not know is written as its alternative text.
 * An equation is written as its LaTeX source in an element with class "math".
 */
export function docToXhtml(doc: RichNode, image: (src: string) => { data: string; type: string } | null): XmlElement {
  const kids = (node: RichNode) => (node.content ?? []).map(convert);
  const convert = (node: RichNode): XmlNode => {
    const attrs = node.attrs ?? {};
    switch (node.type) {
      case "text": {
        let out: XmlNode = node.text ?? "";
        for (const mark of [...(node.marks ?? [])].reverse()) {
          const tag = MARK_TAGS[mark.type];
          if (mark.type === "link") out = x("a", { href: String(mark.attrs?.href ?? "") }, [out]);
          else if (tag) out = x(tag[0], tag[1], [out]);
        }
        return out;
      }
      case "heading":
        return x(`h${Math.min(6, Math.max(1, Number(attrs.level) || 1))}`, {}, kids(node));
      case "tableHeader":
      case "tableCell": {
        const span: Record<string, string> = {};
        if (Number(attrs.colspan) > 1) span.colspan = String(attrs.colspan);
        if (Number(attrs.rowspan) > 1) span.rowspan = String(attrs.rowspan);
        return x(BLOCK_TAGS[node.type] as string, span, kids(node));
      }
      case "image": {
        const file = image(String(attrs.src ?? ""));
        const alt = String(attrs.alt ?? "");
        return file ? x("object", file, alt ? [alt] : []) : alt;
      }
      case "inlineMath":
        return x("span", { class: "math" }, [String(attrs.latex ?? "")]);
      case "blockMath":
        return x("div", { class: "math" }, [String(attrs.latex ?? "")]);
      default:
        return x(BLOCK_TAGS[node.type] ?? "div", {}, kids(node));
    }
  };
  return x("div", {}, kids(doc));
}

type Marks = NonNullable<RichNode["marks"]>;
const MARKS: Record<string, string> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  cite: "italic",
  u: "underline",
  ins: "underline",
  s: "strike",
  strike: "strike",
  del: "strike",
  code: "code",
  tt: "code",
};
const STYLES: [RegExp, string][] = [
  [/text-decoration[^;]*underline/i, "underline"],
  [/text-decoration[^;]*line-through/i, "strike"],
  [/font-weight\s*:\s*(bold|[6-9]00)/i, "bold"],
  [/font-style\s*:\s*italic/i, "italic"],
];
const BLOCKS = new Set(
  "p div h1 h2 h3 h4 h5 h6 ul ol li dl dt dd blockquote pre hr table thead tbody tfoot tr td th caption address".split(
    " ",
  ),
);
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const paragraph = (content: RichNode[] = []): RichNode =>
  content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };

/**
 * XHTML from a ReqIF file as a rich-text document. Trust boundary: the file comes from outside, so only known
 * elements become structure; anything else keeps its text and loses its formatting. `image` returns the address of
 * an embedded file once it is stored here, or null when it is not an image we accept. `dropped` counts those.
 * White space is collapsed as a browser would, except in <pre>.
 */
export function xhtmlToDoc(
  div: XmlElement,
  image: (data: string) => string | null,
): { doc: RichNode; dropped: number } {
  let dropped = 0;

  const inline = (node: XmlNode, marks: Marks): RichNode[] => {
    if (typeof node === "string") {
      const text = node.replace(/\s+/g, " ");
      return text ? [marks.length > 0 ? { type: "text", text, marks } : { type: "text", text }] : [];
    }
    const all = (with_: Marks = marks) => node.children.flatMap((kid) => inline(kid, with_));
    const add = (type: string, attrs?: Record<string, unknown>): Marks =>
      marks.some((m) => m.type === type) ? marks : [...marks, attrs ? { type, attrs } : { type }];
    if (node.name === "br") return [{ type: "hardBreak" }];
    if (node.name === "script" || node.name === "style") return [];
    if (node.name === "object" || node.name === "img") {
      const src = image(node.attrs.data ?? node.attrs.src ?? "");
      const alt = (node.attrs.alt ?? textOf(node)).replace(/\s+/g, " ").trim().slice(0, 500);
      if (src) return [{ type: "image", attrs: alt ? { src, alt } : { src } }];
      // What cannot be shown falls back to what it holds: tools nest a picture inside an embedded document.
      const inside = all();
      if (!inside.some((n) => n.type === "image")) dropped++;
      return inside;
    }
    if (node.attrs.class === "math") return [{ type: "inlineMath", attrs: { latex: textOf(node).slice(0, 2000) } }];
    if (MARKS[node.name]) return all(add(MARKS[node.name] as string));
    if (node.name === "a" && SAFE_LINK.test(node.attrs.href ?? "")) return all(add("link", { href: node.attrs.href }));
    if (node.name === "span" && node.attrs.style) {
      const styled = STYLES.filter(([pattern]) => pattern.test(node.attrs.style ?? "")).map(([, type]) => ({ type }));
      return all([...marks, ...styled.filter((mark) => !marks.some((m) => m.type === mark.type))]);
    }
    return all();
  };

  /** Inline content as blocks made by `make`: images stand alone, and white space at both ends is removed. */
  const textBlocks = (
    run: RichNode[],
    explicit: boolean,
    make: (content: RichNode[]) => RichNode = paragraph,
  ): RichNode[] => {
    const out: RichNode[] = [];
    let part: RichNode[] = [];
    const flush = () => {
      const first = part[0];
      if (first?.type === "text") part[0] = { ...first, text: (first.text ?? "").trimStart() };
      const last = part.at(-1);
      if (last?.type === "text") part[part.length - 1] = { ...last, text: (last.text ?? "").trimEnd() };
      const content = part.filter((n) => n.type !== "text" || n.text);
      if (content.length > 0) out.push(make(content));
      part = [];
    };
    for (const node of run) {
      const before = part.at(-1);
      if (node.type === "image") {
        flush();
        out.push(node);
      } else if (
        node.type === "text" &&
        before?.type === "text" &&
        JSON.stringify(before.marks) === JSON.stringify(node.marks)
      ) {
        // Neighbours with the same formatting are one piece of text; doubled spaces at the join collapse too.
        part[part.length - 1] = { ...before, text: `${before.text}${node.text}`.replace(/ {2,}/g, " ") };
      } else part.push(node);
    }
    flush();
    return out.length === 0 && explicit ? [make([])] : out;
  };
  const filled = (content: RichNode[]) => (content.length > 0 ? content : [paragraph()]);

  const block = (node: XmlElement): RichNode[] => {
    const run = () => node.children.flatMap((kid) => inline(kid, []));
    const heading = /^h([1-6])$/.exec(node.name);
    if (heading) {
      const attrs = { level: Number(heading[1]) };
      return textBlocks(run(), true, (content) => ({ type: "heading", attrs, ...(content.length ? { content } : {}) }));
    }
    switch (node.name) {
      case "p":
        return textBlocks(run(), true);
      case "div":
        if (node.attrs.class === "math") return [{ type: "blockMath", attrs: { latex: textOf(node).slice(0, 2000) } }];
        return blocks(node.children);
      case "hr":
        return [{ type: "horizontalRule" }];
      case "pre": {
        const text = textOf(node);
        return [text ? { type: "codeBlock", content: [{ type: "text", text }] } : { type: "codeBlock" }];
      }
      case "blockquote":
        return [{ type: "blockquote", content: filled(blocks(node.children)) }];
      case "ul":
      case "ol": {
        const items = node.children
          .filter((kid): kid is XmlElement => typeof kid !== "string" && kid.name === "li")
          .map((li) => {
            const content = blocks(li.children);
            // A list entry starts with a paragraph, even when the file starts it with a nested list.
            return {
              type: "listItem",
              content: content[0]?.type === "paragraph" ? content : [paragraph(), ...content],
            };
          });
        return items.length > 0 ? [{ type: node.name === "ul" ? "bulletList" : "orderedList", content: items }] : [];
      }
      case "table": {
        const elementsOf = (parent: XmlElement) =>
          parent.children.filter((kid): kid is XmlElement => typeof kid !== "string");
        const rows = elementsOf(node)
          .flatMap((kid) =>
            kid.name === "tr" ? [kid] : ["thead", "tbody", "tfoot"].includes(kid.name) ? elementsOf(kid) : [],
          )
          .filter((row) => row.name === "tr")
          .map((row) => ({
            type: "tableRow",
            content: elementsOf(row)
              .filter((cell) => cell.name === "td" || cell.name === "th")
              .map((cell) => {
                const attrs: Record<string, number> = {};
                for (const key of ["colspan", "rowspan"]) {
                  const span = Number(cell.attrs[key]);
                  if (Number.isInteger(span) && span > 1 && span <= 1000) attrs[key] = span;
                }
                return {
                  type: cell.name === "th" ? "tableHeader" : "tableCell",
                  ...(Object.keys(attrs).length ? { attrs } : {}),
                  content: filled(blocks(cell.children)),
                };
              }),
          }))
          .filter((row) => row.content.length > 0);
        const captions = elementsOf(node).filter((kid) => kid.name === "caption");
        return [...captions.flatMap(block), ...(rows.length > 0 ? [{ type: "table", content: rows }] : [])];
      }
      default:
        return blocks(node.children);
    }
  };

  /** Mixed content: block elements become blocks, and each stretch of text between them becomes a paragraph. */
  const blocks = (nodes: XmlNode[]): RichNode[] => {
    const out: RichNode[] = [];
    let run: RichNode[] = [];
    for (const node of nodes) {
      if (typeof node !== "string" && BLOCKS.has(node.name)) {
        out.push(...textBlocks(run, false), ...block(node));
        run = [];
      } else run.push(...inline(node, []));
    }
    out.push(...textBlocks(run, false));
    return out;
  };

  return { doc: { type: "doc", content: filled(blocks(div.children)) }, dropped };
}

/** A folder or item to export. Nodes of a set are given in sibling order. */
export type ExportNode = {
  id: string;
  parentId: string | null;
  kind: "folder" | "item";
  name: string;
  uid: string | null;
  description: RichNode | null;
  attributes: Record<string, unknown> | null;
};
export type ExportSet = {
  id: string;
  name: string;
  itemTypeId: string;
  itemType: string;
  fields: ImportField[];
  nodes: ExportNode[];
};
export type ExportLink = { id: string; typeId: string; upstreamId: string; downstreamId: string };

const FIELD_KINDS: Record<string, ReqifKind> = {
  text: "string",
  number: "real",
  boolean: "boolean",
  date: "date",
  enum: "enumeration",
  multi_enum: "enumeration",
};
const ATTACHMENT = /^\/api\/attachments\/([0-9a-f-]{36})$/;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Sets, their items and the relationships among them as ReqIF: one specification per set, one object type per item
 * type, folders as objects of a "Folder" type holding ReqIF.ChapterName. A relationship is written from its
 * downstream item (source) to its upstream item (target), and only when both ends are in the given sets.
 * `imageTypes` gives the content type of each attachment id. `images` returns archive path → attachment id.
 */
export function toReqif(
  title: string,
  sets: ExportSet[],
  links: ExportLink[],
  linkTypes: { id: string; name: string }[],
  imageTypes: Map<string, string>,
): { reqif: Reqif; images: Map<string, string> } {
  const images = new Map<string, string>();
  const image = (src: string) => {
    const id = ATTACHMENT.exec(src)?.[1];
    const type = id ? imageTypes.get(id) : undefined;
    if (!id || !type || !EXTENSIONS[type]) return null;
    const data = `files/${id}.${EXTENSIONS[type]}`;
    images.set(data, id);
    return { data, type };
  };

  const types = new Map<string, ReqifType>();
  const folderType: ReqifType = {
    id: "_folder",
    name: "Folder",
    kind: "object",
    attributes: [{ id: "_folder_name", name: "ReqIF.ChapterName", kind: "string" }],
  };
  const objects: ReqifObject[] = [];
  const exported = new Set<string>();
  const specifications = sets.map((set) => {
    const prefix = `_${set.itemTypeId}_`;
    if (!types.has(set.itemTypeId)) {
      types.set(set.itemTypeId, {
        id: `_${set.itemTypeId}`,
        name: set.itemType,
        kind: "object",
        attributes: [
          { id: `${prefix}uid`, name: "ReqIF.ForeignID", kind: "string" },
          { id: `${prefix}name`, name: "ReqIF.Name", kind: "string" },
          { id: `${prefix}text`, name: "ReqIF.Text", kind: "xhtml" },
          ...set.fields.map((field): ReqifAttribute => {
            const kind = FIELD_KINDS[field.type] ?? "string";
            if (kind !== "enumeration") return { id: prefix + field.id, name: field.name, kind };
            return {
              id: prefix + field.id,
              name: field.name,
              kind,
              multi: field.type === "multi_enum",
              values: (field.options ?? []).map((name, index) => ({ id: `${prefix}${field.id}_${index}`, name })),
            };
          }),
        ],
      });
    }
    const present = new Set(set.nodes.map((node) => node.id));
    const hierarchy = (parentId: string | null): ReqifNode[] =>
      set.nodes
        // A node whose folder is not in the export sits at the top.
        .filter((node) => (node.parentId && present.has(node.parentId) ? node.parentId : null) === parentId)
        .map((node) => ({ objectId: `_${node.id}`, children: hierarchy(node.id) }));
    for (const node of set.nodes) {
      if (node.kind === "folder") {
        objects.push({
          id: `_${node.id}`,
          name: node.name,
          typeId: folderType.id,
          values: { _folder_name: node.name },
        });
        continue;
      }
      exported.add(node.id);
      const values: ReqifValues = {
        [`${prefix}uid`]: node.uid ?? "",
        [`${prefix}name`]: node.name,
        [`${prefix}text`]: docToXhtml(node.description ?? { type: "doc" }, image),
      };
      for (const field of set.fields) {
        const value = node.attributes?.[field.id];
        if (value === undefined || value === null) continue;
        const index = (option: unknown) => (field.options ?? []).indexOf(String(option));
        values[prefix + field.id] =
          field.type === "enum" || field.type === "multi_enum"
            ? (Array.isArray(value) ? value : [value])
                .filter((option) => index(option) >= 0)
                .map((option) => `${prefix}${field.id}_${index(option)}`)
            : field.type === "date"
              ? `${String(value)}T00:00:00Z`
              : field.type === "number" || field.type === "boolean"
                ? (value as number | boolean)
                : field.type === "steps"
                  ? stepsToText(value as Step[])
                  : String(value);
      }
      objects.push({ id: `_${node.id}`, name: node.uid ?? "", typeId: `_${set.itemTypeId}`, values });
    }
    return { id: `_${set.id}`, name: set.name, typeId: "_set", values: {}, children: hierarchy(null) };
  });

  const relations = links
    .filter((link) => exported.has(link.upstreamId) && exported.has(link.downstreamId))
    .map((link) => ({
      id: `_${link.id}`,
      typeId: `_${link.typeId}`,
      sourceId: `_${link.downstreamId}`,
      targetId: `_${link.upstreamId}`,
    }));
  const used = new Set(relations.map((relation) => relation.typeId));
  const reqif: Reqif = {
    title,
    types: [
      ...types.values(),
      ...(objects.some((object) => object.typeId === folderType.id) ? [folderType] : []),
      { id: "_set", name: "Set", kind: "specification", attributes: [] },
      ...linkTypes
        .filter((type) => used.has(`_${type.id}`))
        .map((type): ReqifType => ({ id: `_${type.id}`, name: type.name, kind: "relation", attributes: [] })),
    ],
    objects,
    specifications,
    relations,
  };
  return { reqif, images };
}

/** How a value reads as plain text. An enumeration reads as the names of its values. */
function valueText(attribute: ReqifAttribute, value: ReqifValue | undefined): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((id) => attribute.values?.find((v) => v.id === id)?.name ?? id).join("; ");
  }
  if (typeof value === "object") return docToText(xhtmlToDoc(value, () => null).doc).trim();
  return String(value);
}

/** What a ReqIF file holds, as the mapping screen shows it. `sample` is the first value found for an attribute. */
export type ReqifSummary = {
  specifications: {
    id: string;
    name: string;
    objects: number;
    attributes: { id: string; name: string; kind: ReqifKind; sample: string }[];
  }[];
  relationTypes: { id: string; name: string; count: number }[];
};

export function summarizeReqif(reqif: Reqif): ReqifSummary {
  const objects = new Map(reqif.objects.map((object) => [object.id, object]));
  const types = new Map(reqif.types.map((type) => [type.id, type]));
  return {
    specifications: reqif.specifications.map((spec, index) => {
      const used: ReqifObject[] = [];
      const walk = (nodes: ReqifNode[]) => {
        for (const node of nodes) {
          const object = objects.get(node.objectId);
          if (object) used.push(object);
          walk(node.children);
        }
      };
      walk(spec.children);
      const attributes = [...new Set(used.map((object) => object.typeId))]
        .flatMap((typeId) => types.get(typeId)?.attributes ?? [])
        .map((attribute) => {
          const holder = used.find((object) => valueText(attribute, object.values[attribute.id]) !== "");
          const sample = valueText(attribute, holder?.values[attribute.id]).slice(0, 80);
          return { id: attribute.id, name: attribute.name, kind: attribute.kind, sample };
        });
      return { id: spec.id, name: spec.name || `Specification ${index + 1}`, objects: used.length, attributes };
    }),
    relationTypes: reqif.types
      .filter((type) => type.kind === "relation")
      .map((type) => ({
        id: type.id,
        name: type.name,
        count: reqif.relations.filter((relation) => relation.typeId === type.id).length,
      })),
  };
}

/** A set that can receive items, with the fields of its item type. */
export type ReqifTargetSet = { id: string; name: string; fields: ImportField[] };
/**
 * The user's choices. Per specification: the set it goes into ("" skips it) and what each attribute (by id) becomes:
 * "name", "description", a field id, or "" to skip. Several attributes may share a target; the first with a value wins.
 * Per relation type: the relationship type ("" skips it), and whether the source is the upstream item.
 */
export type ReqifMapping = {
  specifications: Record<string, { setId: string; targets: Record<string, Target> }>;
  relations: Record<string, { typeId: string; reverse: boolean }>;
};

const NAME_ATTRIBUTES = new Set(["reqif.name", "reqif.chaptername", "name", "title", "object heading"]);
const TEXT_ATTRIBUTES = new Set(["reqif.text", "description", "text", "object text"]);

/** Matches attributes to targets by name: the ReqIF and DOORS names for heading and text, then fields of the same name. */
export function guessReqifTargets(
  attributes: { id: string; name: string }[],
  fields: ImportField[],
): Record<string, Target> {
  return Object.fromEntries(
    attributes.map(({ id, name }) => {
      const title = name.trim().toLowerCase();
      const target = NAME_ATTRIBUTES.has(title)
        ? "name"
        : TEXT_ATTRIBUTES.has(title)
          ? "description"
          : (fields.find((f) => f.name.toLowerCase() === title)?.id ?? "");
      return [id, target];
    }),
  );
}

/** A first mapping: specifications and relation types go to the set or relationship type of the same name. */
export function guessReqifMapping(
  summary: ReqifSummary,
  sets: ReqifTargetSet[],
  linkTypes: { id: string; name: string }[],
): ReqifMapping {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return {
    specifications: Object.fromEntries(
      summary.specifications.map((spec) => {
        const set = sets.find((s) => same(s.name, spec.name));
        return [spec.id, { setId: set?.id ?? "", targets: guessReqifTargets(spec.attributes, set?.fields ?? []) }];
      }),
    ),
    relations: Object.fromEntries(
      summary.relationTypes.map((type) => [
        type.id,
        { typeId: linkTypes.find((t) => same(t.name, type.name))?.id ?? "", reverse: false },
      ]),
    ),
  };
}

/** A folder or item to create. `ref` names an item so that a relationship in the same request can point at it. */
export type ImportNode = {
  ref?: string;
  kind: "folder" | "item";
  name: string;
  description?: RichNode;
  attributes?: Record<string, unknown>;
  children?: ImportNode[];
};
/** The body of `POST /api/projects/:projectId/import`. */
export type TreeImport = {
  sets: { setId: string; nodes: ImportNode[] }[];
  links: { typeId: string; upstream: string; downstream: string }[];
};

const MAX_NAME = 200;
const MAX_TEXT = 10_000;

/**
 * Turns a ReqIF file into the folders, items and relationships to create, following the mapping.
 * An object with objects below it becomes a folder; when it also has body text, that text becomes the first item
 * in the folder. A value that does not fit its field is left empty and reported in `warnings`.
 */
export function mapReqif(
  reqif: Reqif,
  mapping: ReqifMapping,
  sets: ReqifTargetSet[],
  image: (data: string) => string | null,
): { body: TreeImport; items: number; folders: number; warnings: string[] } {
  const objects = new Map(reqif.objects.map((object) => [object.id, object]));
  const types = new Map(reqif.types.map((type) => [type.id, type]));
  const problems = new Map<string, number>();
  const warn = (message: string, times = 1) => problems.set(message, (problems.get(message) ?? 0) + times);
  const placed = new Set<string>();
  let items = 0;
  let folders = 0;
  const bySet = new Map<string, ImportNode[]>();

  for (const spec of reqif.specifications) {
    const choice = mapping.specifications[spec.id];
    const set = sets.find((s) => s.id === choice?.setId);
    if (!choice || !set) continue;

    const read = (object: ReqifObject) => {
      let name = "";
      let description: RichNode | undefined;
      const attributes: Record<string, unknown> = {};
      for (const attribute of types.get(object.typeId)?.attributes ?? []) {
        const target = choice.targets[attribute.id];
        const value = object.values[attribute.id];
        if (!target || value === undefined) continue;
        if (target === "description") {
          if (description) continue;
          if (typeof value === "object" && !Array.isArray(value)) {
            const converted = xhtmlToDoc(value, image);
            if (converted.dropped)
              warn(
                "embedded objects are not images we accept (PNG, JPEG, GIF, WebP) and were left out",
                converted.dropped,
              );
            if (hasBody(converted.doc)) description = converted.doc;
          } else if (valueText(attribute, value).trim()) description = textToDoc(valueText(attribute, value));
          continue;
        }
        const text = valueText(attribute, value).trim();
        if (!text) continue;
        if (target === "name") name ||= text;
        else {
          const field = set.fields.find((f) => f.id === target);
          if (!field || attributes[target] !== undefined) continue;
          const result = coerce(field, text);
          if ("error" in result) warn(`${field.name}: "${text.slice(0, 60)}" ${result.error}. Left empty`);
          else if (typeof result.value === "string" && result.value.length > MAX_TEXT) {
            warn(`${field.name}: text longer than 10,000 characters was cut`);
            attributes[target] = result.value.slice(0, MAX_TEXT);
          } else attributes[target] = result.value;
        }
      }
      // Requirements often have no heading of their own: the start of the text names them.
      const firstLine = description ? (docToText(description).trim().split("\n")[0] ?? "") : "";
      const fallback = firstLine.length > 100 ? `${firstLine.slice(0, 99)}…` : firstLine;
      return { name: (name || fallback || object.name || "Untitled").slice(0, MAX_NAME), description, attributes };
    };

    const convert = (node: ReqifNode): ImportNode[] => {
      const object = objects.get(node.objectId);
      if (!object) {
        warn("entries point to an object that is not in the file and were left out");
        return node.children.flatMap(convert);
      }
      const { name, description, attributes } = read(object);
      const asItem = (): ImportNode => {
        items++;
        const item: ImportNode = { kind: "item", name, attributes };
        if (description) item.description = description;
        // An object listed twice becomes two items; relationships go to the first.
        if (!placed.has(object.id)) item.ref = object.id;
        placed.add(object.id);
        return item;
      };
      if (node.children.length === 0) return [asItem()];
      folders++;
      const first = description ? [asItem()] : [];
      return [{ kind: "folder", name, children: [...first, ...node.children.flatMap(convert)] }];
    };
    bySet.set(set.id, [...(bySet.get(set.id) ?? []), ...spec.children.flatMap(convert)]);
  }

  const links: TreeImport["links"] = [];
  const pairs = new Set<string>();
  for (const relation of reqif.relations) {
    const choice = mapping.relations[relation.typeId];
    if (!choice?.typeId) continue;
    const [upstream, downstream] = choice.reverse
      ? [relation.sourceId, relation.targetId]
      : [relation.targetId, relation.sourceId];
    const pair = [upstream, downstream].sort().join("\n");
    if (!placed.has(upstream) || !placed.has(downstream)) {
      warn("relationships have an end that is not among the imported items and were left out");
    } else if (upstream === downstream || pairs.has(pair)) {
      warn("relationships repeat another one between the same two items and were left out");
    } else {
      pairs.add(pair);
      links.push({ typeId: choice.typeId, upstream, downstream });
    }
  }

  return {
    body: { sets: [...bySet].map(([setId, nodes]) => ({ setId, nodes })).filter((s) => s.nodes.length > 0), links },
    items,
    folders,
    warnings: [...problems].map(([message, times]) => `${times} × ${message}`),
  };
}

const hasBody = (doc: RichNode) => docToText(doc).trim() !== "" || JSON.stringify(doc).includes('"type":"image"');
