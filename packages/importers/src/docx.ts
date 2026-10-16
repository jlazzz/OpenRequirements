import { child, elements, parseXml, textOf, writeXml, type XmlElement, type XmlNode, zip } from "@app/reqif";
import { type RichNode, type Step, stepsToText } from "@app/shared";
import { type ExistingFolder, type ImportField, type ImportNode, nameFromText } from "./mapping.ts";
import type { ExportNode, ExportSet } from "./reqif.ts";

// Word files (.docx) are a zip of WordprocessingML parts. Both directions are written by hand, as ReqIF is (ADR 0015).

const el = (name: string, attrs: Record<string, string> = {}, children: XmlNode[] = []): XmlElement => ({
  name,
  attrs,
  children,
});
const xml = (root: XmlElement) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${writeXml(root)}`;
const NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  rel: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};
const val = (name: string, value: string | number) => el(name, { "w:val": String(value) });

// Styles: the import below recognises "Item Title" paragraphs and "Item Fields" tables, so an export reads back.
const ITEM_TITLE = "item title";
const ITEM_FIELDS = "item fields";
const CODE_FONT = el("w:rFonts", { "w:ascii": "Consolas", "w:hAnsi": "Consolas", "w:cs": "Consolas" });
const WORD_IMAGES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/gif": "gif" };
const ATTACHMENT = /^\/api\/attachments\/([0-9a-f-]{36})$/;
// A page is 6.3 inches wide inside the default margins; an English Metric Unit is 1/914,400 inch, 9,525 per pixel.
const MAX_WIDTH = 5_760_720;
const PIXEL = 9525;

/** Width and height in pixels of a PNG, GIF or JPEG image, or null. */
export function imageSize(data: Uint8Array): [number, number] | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (data[0] === 0x89 && data[1] === 0x50) return [view.getUint32(16), view.getUint32(20)];
    if (data[0] === 0x47 && data[1] === 0x49) return [view.getUint16(6, true), view.getUint16(8, true)];
    if (data[0] === 0xff && data[1] === 0xd8) {
      // JPEG: walk the segments to the frame header, which holds the size.
      let at = 2;
      while (at + 9 < data.length && data[at] === 0xff) {
        const marker = data[at + 1] as number;
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return [view.getUint16(at + 7), view.getUint16(at + 5)];
        }
        at += 2 + view.getUint16(at + 2);
      }
    }
  } catch {
    // A file shorter than its header says.
  }
  return null;
}

/** The attachment ids of the images in the descriptions of the given sets, so the caller can read just those. */
export function imagesOf(sets: ExportSet[]): Set<string> {
  const ids = new Set<string>();
  const walk = (node: RichNode) => {
    const id = node.type === "image" ? ATTACHMENT.exec(String(node.attrs?.src ?? ""))?.[1] : undefined;
    if (id) ids.add(id);
    node.content?.forEach(walk);
  };
  for (const set of sets) for (const node of set.nodes) if (node.description) walk(node.description);
  return ids;
}

/** How a field value reads in a document. */
function valueText(field: ImportField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "steps") return stepsToText(value as Step[]);
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export type DocxImage = { data: Uint8Array; type: string };
export type DocxCover = { title: string; lines: string[]; header: string };
/** `fields`: names of the fields in each item's table (all when absent). `uid`: where the UID sits in the title. */
export type DocxOptions = { fields?: string[]; uid?: "before" | "after"; cover?: boolean };

/**
 * Sets as a Word document: a cover page, folders as headings, each item as an "Item Title" paragraph with its UID and
 * name, its description, and a table of its fields that have a value. With more than one set, each set is a heading
 * of its own. `images` holds the bytes of the images to embed, by attachment id; any other image becomes its
 * alternative text. Tables keep column spans; row spans are flattened.
 */
export async function toDocx(
  cover: DocxCover,
  sets: ExportSet[],
  images: Map<string, DocxImage>,
  /** Plain rows (first row is the header) written as one table after the sets, e.g. a traceability matrix. */
  grid?: string[][],
  options: DocxOptions = {},
): Promise<Uint8Array> {
  const withCover = options.cover !== false;
  const rels: XmlElement[] = [];
  const media: { name: string; data: Uint8Array }[] = [];
  const relId = (type: string, target: string, external = false) => {
    const id = `rId${rels.length + 10}`;
    rels.push(
      el("Relationship", {
        Id: id,
        Type: `${NS.rel}/${type}`,
        Target: target,
        ...(external ? { TargetMode: "External" } : {}),
      }),
    );
    return id;
  };
  const embedded = new Map<string, { rel: string; cx: number; cy: number }>();
  let drawings = 0;
  // Ordered lists each get their own numbering instance, so each starts again at 1.
  const numbers: XmlElement[] = [el("w:num", { "w:numId": "1" }, [val("w:abstractNumId", 1)])];
  const orderedList = (level: number) => {
    const id = String(numbers.length + 1);
    numbers.push(
      el("w:num", { "w:numId": id }, [
        val("w:abstractNumId", 2),
        el("w:lvlOverride", { "w:ilvl": String(level) }, [val("w:startOverride", 1)]),
      ]),
    );
    return id;
  };

  const runProps = (marks: RichNode["marks"] = [], extra: XmlElement[] = []) => {
    const props: XmlElement[] = [...extra];
    for (const mark of marks) {
      if (mark.type === "bold") props.push(el("w:b"));
      if (mark.type === "italic") props.push(el("w:i"));
      if (mark.type === "underline") props.push(val("w:u", "single"));
      if (mark.type === "strike") props.push(el("w:strike"));
      if (mark.type === "code") props.push(CODE_FONT);
      if (mark.type === "link") props.push(val("w:rStyle", "Hyperlink"));
    }
    // The schema fixes the order of run properties.
    const order = ["w:rStyle", "w:rFonts", "w:b", "w:i", "w:strike", "w:u"];
    props.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    return props.length ? [el("w:rPr", {}, props)] : [];
  };
  const textRun = (text: string, marks?: RichNode["marks"], extra?: XmlElement[]) =>
    el("w:r", {}, [
      ...runProps(marks, extra),
      ...text
        .split("\n")
        .flatMap((line, index) => [
          ...(index > 0 ? [el("w:br")] : []),
          ...(line ? [el("w:t", { "xml:space": "preserve" }, [line])] : []),
        ]),
    ]);
  const imageRun = (node: RichNode): XmlElement => {
    const alt = String(node.attrs?.alt ?? "");
    const id = ATTACHMENT.exec(String(node.attrs?.src ?? ""))?.[1] ?? "";
    let picture = embedded.get(id);
    const image = images.get(id);
    const extension = image && WORD_IMAGES[image.type];
    const size = image && imageSize(image.data);
    if (!picture && image && extension && size && size[0] > 0 && size[1] > 0) {
      const name = `image${media.length + 1}.${extension}`;
      media.push({ name: `word/media/${name}`, data: image.data });
      const scale = Math.min(1, MAX_WIDTH / (size[0] * PIXEL));
      picture = { rel: relId("image", `media/${name}`), cx: Math.round(size[0] * PIXEL * scale), cy: 0 };
      picture.cy = Math.round(size[1] * PIXEL * scale);
      embedded.set(id, picture);
    }
    if (!picture) return textRun(alt ? `[${alt}]` : "[image]");
    drawings++;
    const extent = { cx: String(picture.cx), cy: String(picture.cy) };
    return el("w:r", {}, [
      el("w:drawing", {}, [
        el("wp:inline", { distT: "0", distB: "0", distL: "0", distR: "0" }, [
          el("wp:extent", extent),
          el("wp:docPr", { id: String(drawings), name: `Picture ${drawings}`, descr: alt }),
          el("a:graphic", { "xmlns:a": NS.a }, [
            el("a:graphicData", { uri: NS.pic }, [
              el("pic:pic", { "xmlns:pic": NS.pic }, [
                el("pic:nvPicPr", {}, [
                  el("pic:cNvPr", { id: String(drawings), name: `Picture ${drawings}` }),
                  el("pic:cNvPicPr"),
                ]),
                el("pic:blipFill", {}, [
                  el("a:blip", { "r:embed": picture.rel }),
                  el("a:stretch", {}, [el("a:fillRect")]),
                ]),
                el("pic:spPr", {}, [
                  el("a:xfrm", {}, [el("a:off", { x: "0", y: "0" }), el("a:ext", extent)]),
                  el("a:prstGeom", { prst: "rect" }, [el("a:avLst")]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]);
  };

  const inline = (nodes: RichNode[] = []): XmlElement[] =>
    nodes.flatMap((node): XmlElement[] => {
      if (node.type === "text") {
        const run = textRun(node.text ?? "", node.marks);
        const href = node.marks?.find((m) => m.type === "link")?.attrs?.href;
        return typeof href === "string"
          ? [el("w:hyperlink", { "r:id": relId("hyperlink", href, true) }, [run])]
          : [run];
      }
      if (node.type === "hardBreak") return [el("w:r", {}, [el("w:br")])];
      if (node.type === "inlineMath") return [textRun(String(node.attrs?.latex ?? ""), [], [CODE_FONT])];
      if (node.type === "image") return [imageRun(node)];
      // A file is written as its name: the file itself stays in the tool.
      if (node.type === "file") return [textRun(String(node.attrs?.name ?? ""))];
      return inline(node.content);
    });
  type Place = { list?: { numId: string; level: number }; indent: number };
  const paragraph = (runs: XmlElement[], place: Place, props: XmlElement[] = []) => {
    const all = [...props];
    if (place.list) {
      all.push(el("w:numPr", {}, [val("w:ilvl", place.list.level), val("w:numId", place.list.numId)]));
    } else if (place.indent) all.push(el("w:ind", { "w:left": String(place.indent) }));
    return el("w:p", {}, [...(all.length ? [el("w:pPr", {}, all)] : []), ...runs]);
  };
  const style = (id: string) => val("w:pStyle", id);

  const table = (node: RichNode, place: Place): XmlElement => {
    const rows = node.content ?? [];
    const width = (cell: RichNode) => Math.max(1, Number(cell.attrs?.colspan) || 1);
    const columns = Math.max(1, ...rows.map((row) => (row.content ?? []).reduce((sum, cell) => sum + width(cell), 0)));
    return el("w:tbl", {}, [
      el("w:tblPr", {}, [
        val("w:tblStyle", "TableGrid"),
        el("w:tblW", { "w:w": "0", "w:type": "auto" }),
        ...(place.indent ? [el("w:tblInd", { "w:w": String(place.indent), "w:type": "dxa" })] : []),
      ]),
      el(
        "w:tblGrid",
        {},
        Array.from({ length: columns }, () => el("w:gridCol", { "w:w": String(Math.floor(9000 / columns)) })),
      ),
      ...rows.map((row) => {
        const header = (row.content ?? []).every((cell) => cell.type === "tableHeader");
        return el("w:tr", {}, [
          ...(header ? [el("w:trPr", {}, [el("w:tblHeader")])] : []),
          ...(row.content ?? []).map((cell) => {
            const content = (cell.content ?? []).flatMap((kid) => blocks(kid, { indent: 0 }));
            const props = [
              ...(width(cell) > 1 ? [val("w:gridSpan", width(cell))] : []),
              ...(cell.type === "tableHeader"
                ? [el("w:shd", { "w:val": "clear", "w:color": "auto", "w:fill": "E7E6E6" })]
                : []),
            ];
            // A cell must end with a paragraph.
            if (content.at(-1)?.name !== "w:p") content.push(el("w:p"));
            return el("w:tc", {}, [...(props.length ? [el("w:tcPr", {}, props)] : []), ...content]);
          }),
        ]);
      }),
    ]);
  };

  const blocks = (node: RichNode, place: Place): XmlElement[] => {
    switch (node.type) {
      case "paragraph":
        return [paragraph(inline(node.content), place)];
      case "heading":
        return [paragraph(inline(bolden(node.content)), place, [el("w:keepNext")])];
      case "codeBlock":
        return [paragraph([textRun(node.content?.map((t) => t.text ?? "").join("") ?? "", [], [CODE_FONT])], place)];
      case "blockMath":
        return [paragraph([textRun(String(node.attrs?.latex ?? ""), [], [CODE_FONT])], place)];
      case "image":
        return [paragraph([imageRun(node)], place)];
      case "horizontalRule":
        return [
          paragraph([], place, [
            el("w:pBdr", {}, [el("w:bottom", { "w:val": "single", "w:sz": "6", "w:space": "1", "w:color": "auto" })]),
          ]),
        ];
      case "blockquote":
        return (node.content ?? []).flatMap((kid) => blocks(kid, { indent: place.indent + 720 }));
      case "table":
        return [table(node, place)];
      case "bulletList":
      case "orderedList": {
        const level = place.list ? place.list.level + 1 : 0;
        const numId = node.type === "bulletList" ? "1" : orderedList(Math.min(level, 8));
        return (node.content ?? []).flatMap((item) =>
          (item.content ?? []).flatMap((kid, index) =>
            // Only an entry's first paragraph has the bullet; the rest are indented under it.
            index === 0 || kid.type === "bulletList" || kid.type === "orderedList"
              ? blocks(kid, { list: { numId, level: Math.min(level, 8) }, indent: 0 })
              : blocks(kid, { indent: 720 * (level + 1) }),
          ),
        );
      }
      default:
        return (node.content ?? []).flatMap((kid) => blocks(kid, place));
    }
  };

  const fieldTable = (fields: ImportField[], attributes: Record<string, unknown> | null): XmlElement[] => {
    const rows = fields
      .filter((field) => !options.fields || options.fields.includes(field.name))
      .map((field) => [field.name, valueText(field, attributes?.[field.id])] as const)
      .filter(([, text]) => text !== "");
    if (rows.length === 0) return [];
    const cell = (text: string, width: number, bold = false) =>
      el("w:tc", {}, [
        el("w:tcPr", {}, [el("w:tcW", { "w:w": String(width), "w:type": "dxa" })]),
        paragraph([textRun(text, bold ? [{ type: "bold" }] : [])], { indent: 0 }),
      ]);
    return [
      el("w:tbl", {}, [
        el("w:tblPr", {}, [val("w:tblStyle", "ItemFields"), el("w:tblW", { "w:w": "0", "w:type": "auto" })]),
        el("w:tblGrid", {}, [el("w:gridCol", { "w:w": "2400" }), el("w:gridCol", { "w:w": "6600" })]),
        ...rows.map(([name, text]) => el("w:tr", {}, [cell(name, 2400, true), cell(text, 6600)])),
      ]),
    ];
  };

  const body: XmlElement[] = withCover
    ? [
        paragraph([textRun(cover.title)], { indent: 0 }, [style("Title")]),
        ...cover.lines.map((line) => paragraph([textRun(line)], { indent: 0 }, [style("Subtitle")])),
        paragraph([el("w:r", {}, [el("w:br", { "w:type": "page" })])], { indent: 0 }),
      ]
    : [];
  const headingLevel = (depth: number) => Math.min(9, depth + 1);
  for (const set of sets) {
    // With one set, the cover names it and its folders start at Heading 1.
    const base = sets.length > 1 ? 1 : 0;
    if (base) body.push(paragraph([textRun(set.name)], { indent: 0 }, [style("Heading1")]));
    const present = new Set(set.nodes.map((n) => n.id));
    const under = (parentId: string | null): ExportNode[] =>
      set.nodes.filter((n) => (n.parentId && present.has(n.parentId) ? n.parentId : null) === parentId);
    const write = (parentId: string | null, depth: number) => {
      for (const node of under(parentId)) {
        if (node.kind === "folder") {
          body.push(paragraph([textRun(node.name)], { indent: 0 }, [style(`Heading${headingLevel(base + depth)}`)]));
          write(node.id, depth + 1);
          continue;
        }
        const title = options.uid === "after" ? `${node.name} ${node.uid ?? ""}` : `${node.uid ?? ""} ${node.name}`;
        body.push(paragraph([textRun(title.trim())], { indent: 0 }, [style("ItemTitle")]));
        if (node.description) body.push(...blocks(node.description, { indent: 0 }));
        body.push(...fieldTable(set.fields, node.attributes));
        // Child items follow their parent.
        write(node.id, depth);
      }
    };
    write(null, 0);
  }

  if (grid && grid.length > 0) {
    const columns = Math.max(1, ...grid.map((r) => r.length));
    const width = Math.floor(9000 / columns);
    body.push(
      el("w:tbl", {}, [
        el("w:tblPr", {}, [val("w:tblStyle", "TableGrid"), el("w:tblW", { "w:w": "0", "w:type": "auto" })]),
        el(
          "w:tblGrid",
          {},
          Array.from({ length: columns }, () => el("w:gridCol", { "w:w": String(width) })),
        ),
        ...grid.map((row, index) =>
          el("w:tr", {}, [
            ...(index === 0 ? [el("w:trPr", {}, [el("w:tblHeader")])] : []),
            ...Array.from({ length: columns }, (_, c) =>
              el("w:tc", {}, [
                el("w:tcPr", {}, [
                  el("w:tcW", { "w:w": String(width), "w:type": "dxa" }),
                  ...(index === 0 ? [el("w:shd", { "w:val": "clear", "w:color": "auto", "w:fill": "E7E6E6" })] : []),
                ]),
                paragraph([textRun(row[c] ?? "", index === 0 ? [{ type: "bold" }] : [])], { indent: 0 }),
              ]),
            ),
          ]),
        ),
      ]),
      paragraph([], { indent: 0 }),
    );
  }

  const header = relId("header", "header1.xml");
  const footer = relId("footer", "footer1.xml");
  const document = el("w:document", { "xmlns:w": NS.w, "xmlns:r": NS.r, "xmlns:wp": NS.wp }, [
    el("w:body", {}, [
      ...body,
      el("w:sectPr", {}, [
        el("w:headerReference", { "w:type": "default", "r:id": header }),
        el("w:footerReference", { "w:type": "default", "r:id": footer }),
        el("w:pgMar", {
          "w:top": "1440",
          "w:right": "1440",
          "w:bottom": "1440",
          "w:left": "1440",
          "w:header": "708",
          "w:footer": "708",
          "w:gutter": "0",
        }),
        // The cover page has no header or footer.
        ...(withCover ? [el("w:titlePg")] : []),
      ]),
    ]),
  ]);
  const pageField = (instr: string) => el("w:fldSimple", { "w:instr": instr }, [el("w:r", {}, [el("w:t", {}, ["1"])])]);
  const headerPart = el("w:hdr", { "xmlns:w": NS.w }, [
    paragraph([textRun(cover.header)], { indent: 0 }, [style("Header")]),
  ]);
  const footerPart = el("w:ftr", { "xmlns:w": NS.w }, [
    el("w:p", {}, [
      el("w:pPr", {}, [style("Footer"), val("w:jc", "right")]),
      textRun("Page "),
      pageField("PAGE"),
      textRun(" of "),
      pageField("NUMPAGES"),
    ]),
  ]);

  const contentTypes = el("Types", { xmlns: "http://schemas.openxmlformats.org/package/2006/content-types" }, [
    el("Default", { Extension: "rels", ContentType: "application/vnd.openxmlformats-package.relationships+xml" }),
    el("Default", { Extension: "xml", ContentType: "application/xml" }),
    ...Object.entries(WORD_IMAGES).map(([type, extension]) =>
      el("Default", { Extension: extension, ContentType: type }),
    ),
    ...[
      ["document", "document.main"],
      ["styles", "styles"],
      ["numbering", "numbering"],
      ["header1", "header"],
      ["footer1", "footer"],
    ].map(([part, type]) =>
      el("Override", {
        PartName: `/word/${part}.xml`,
        ContentType: `application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml`,
      }),
    ),
  ]);
  const packageRels = el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" }, [
    el("Relationship", { Id: "rId1", Type: `${NS.rel}/officeDocument`, Target: "word/document.xml" }),
  ]);
  const documentRels = el("Relationships", { xmlns: "http://schemas.openxmlformats.org/package/2006/relationships" }, [
    el("Relationship", { Id: "rId1", Type: `${NS.rel}/styles`, Target: "styles.xml" }),
    el("Relationship", { Id: "rId2", Type: `${NS.rel}/numbering`, Target: "numbering.xml" }),
    ...rels,
  ]);
  const text = new TextEncoder();
  return zip([
    { name: "[Content_Types].xml", data: text.encode(xml(contentTypes)) },
    { name: "_rels/.rels", data: text.encode(xml(packageRels)) },
    { name: "word/document.xml", data: text.encode(xml(document)) },
    { name: "word/_rels/document.xml.rels", data: text.encode(xml(documentRels)) },
    { name: "word/styles.xml", data: text.encode(xml(styles())) },
    { name: "word/numbering.xml", data: text.encode(xml(numbering(numbers))) },
    { name: "word/header1.xml", data: text.encode(xml(headerPart)) },
    { name: "word/footer1.xml", data: text.encode(xml(footerPart)) },
    ...media,
  ]);
}

/** Text with bold added, for a heading inside a description: Word headings are reserved for folders. */
const bolden = (nodes: RichNode[] = []): RichNode[] =>
  nodes.map((node) =>
    node.type === "text" && !node.marks?.some((m) => m.type === "bold")
      ? { ...node, marks: [...(node.marks ?? []), { type: "bold" }] }
      : node,
  );

function styles(): XmlElement {
  const paragraphStyle = (
    id: string,
    name: string,
    paragraph: XmlElement[],
    run: XmlElement[],
    more: XmlElement[] = [],
  ) =>
    el("w:style", { "w:type": "paragraph", "w:styleId": id }, [
      val("w:name", name),
      val("w:basedOn", "Normal"),
      val("w:next", "Normal"),
      ...more,
      el("w:qFormat"),
      el("w:pPr", {}, paragraph),
      el("w:rPr", {}, run),
    ]);
  const spacing = (before: number, after: number) =>
    el("w:spacing", { "w:before": String(before), "w:after": String(after) });
  const size = (halfPoints: number) => [val("w:sz", halfPoints), val("w:szCs", halfPoints)];
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map((side) =>
    el(`w:${side}`, { "w:val": "single", "w:sz": "4", "w:space": "0", "w:color": "A6A6A6" }),
  );
  return el("w:styles", { "xmlns:w": NS.w }, [
    el("w:docDefaults", {}, [
      el("w:rPrDefault", {}, [
        el("w:rPr", {}, [
          el("w:rFonts", { "w:ascii": "Calibri", "w:hAnsi": "Calibri", "w:eastAsia": "Calibri", "w:cs": "Calibri" }),
          ...size(22),
        ]),
      ]),
      el("w:pPrDefault", {}, [
        el("w:pPr", {}, [el("w:spacing", { "w:after": "120", "w:line": "264", "w:lineRule": "auto" })]),
      ]),
    ]),
    el("w:style", { "w:type": "paragraph", "w:default": "1", "w:styleId": "Normal" }, [
      val("w:name", "Normal"),
      el("w:qFormat"),
    ]),
    paragraphStyle("Title", "Title", [spacing(2400, 240)], [el("w:b"), ...size(56)]),
    paragraphStyle("Subtitle", "Subtitle", [spacing(0, 120)], [el("w:color", { "w:val": "595959" }), ...size(28)]),
    ...Array.from({ length: 9 }, (_, index) =>
      paragraphStyle(
        `Heading${index + 1}`,
        `heading ${index + 1}`,
        [el("w:keepNext"), spacing(index === 0 ? 360 : 240, 120), val("w:outlineLvl", index)],
        [el("w:b"), ...size([32, 28, 26, 24, 22, 22, 22, 22, 22][index] as number)],
      ),
    ),
    paragraphStyle("ItemTitle", "Item Title", [el("w:keepNext"), spacing(240, 60)], [el("w:b")]),
    paragraphStyle("Header", "header", [], [el("w:color", { "w:val": "595959" }), ...size(18)]),
    paragraphStyle("Footer", "footer", [], [el("w:color", { "w:val": "595959" }), ...size(18)]),
    el("w:style", { "w:type": "character", "w:styleId": "Hyperlink" }, [
      val("w:name", "Hyperlink"),
      el("w:rPr", {}, [el("w:color", { "w:val": "0563C1" }), val("w:u", "single")]),
    ]),
    el("w:style", { "w:type": "table", "w:styleId": "TableGrid" }, [
      val("w:name", "Table Grid"),
      el("w:pPr", {}, [el("w:spacing", { "w:after": "0" })]),
      el("w:tblPr", {}, [
        el("w:tblBorders", {}, borders),
        el("w:tblCellMar", {}, [
          el("w:left", { "w:w": "108", "w:type": "dxa" }),
          el("w:right", { "w:w": "108", "w:type": "dxa" }),
        ]),
      ]),
    ]),
    el("w:style", { "w:type": "table", "w:styleId": "ItemFields" }, [
      val("w:name", "Item Fields"),
      val("w:basedOn", "TableGrid"),
      el("w:rPr", {}, size(18)),
    ]),
  ]);
}

function numbering(numbers: XmlElement[]): XmlElement {
  const levels = (ordered: boolean) =>
    Array.from({ length: 9 }, (_, level) =>
      el("w:lvl", { "w:ilvl": String(level) }, [
        val("w:start", 1),
        val("w:numFmt", ordered ? (["decimal", "lowerLetter", "lowerRoman"][level % 3] as string) : "bullet"),
        val("w:lvlText", ordered ? `%${level + 1}.` : (["•", "◦", "▪"][level % 3] as string)),
        val("w:lvlJc", "left"),
        el("w:pPr", {}, [el("w:ind", { "w:left": String(720 * (level + 1)), "w:hanging": "360" })]),
      ]),
    );
  return el("w:numbering", { "xmlns:w": NS.w }, [
    el("w:abstractNum", { "w:abstractNumId": "1" }, [val("w:multiLevelType", "hybridMultilevel"), ...levels(false)]),
    el("w:abstractNum", { "w:abstractNumId": "2" }, [val("w:multiLevelType", "hybridMultilevel"), ...levels(true)]),
    ...numbers,
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// Reading

/** A piece of a Word document, in order: a heading, an item title as this tool writes them, or a block of content. */
export type WordBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "title"; text: string }
  | { kind: "content"; node: RichNode; text: string };

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const OFF = new Set(["0", "false", "off", "none"]);
const decoder = new TextDecoder();
type Marks = NonNullable<RichNode["marks"]>;

/**
 * The headings, item titles, paragraphs, lists and tables of a .docx file, unpacked. Trust boundary: the file comes
 * from outside. Formatting other than bold, italic, underline, strike and web links is dropped; tracked deletions are
 * left out and insertions kept. `image` stores an embedded picture (by its path in the archive) and returns its
 * address, or null when it is not an image we accept; `dropped` counts those. The cover (Title and Subtitle styles),
 * tables of contents and "Item Fields" tables are skipped.
 */
export function readDocx(
  files: Map<string, Uint8Array>,
  image: (path: string) => string | null,
): { blocks: WordBlock[]; dropped: number } {
  const part = (path: string) => {
    const data = files.get(path);
    return data ? parseXml(decoder.decode(data)) : undefined;
  };
  const document = part("word/document.xml");
  const body = child(document, "body");
  if (!body) throw new Error("This is not a Word document (.docx).");
  let dropped = 0;

  const relations = new Map(
    elements(part("word/_rels/document.xml.rels"), "Relationship").map((r) => [
      r.attrs.Id ?? "",
      { target: r.attrs.Target ?? "", external: r.attrs.TargetMode === "External" },
    ]),
  );
  type Style = { name: string; basedOn?: string; outline?: number; numPr?: XmlElement };
  const styleList = new Map<string, Style>(
    elements(part("word/styles.xml"), "style").map((s) => {
      const pPr = child(s, "pPr");
      const outline = child(pPr, "outlineLvl")?.attrs["w:val"];
      return [
        s.attrs["w:styleId"] ?? "",
        {
          name: (child(s, "name")?.attrs["w:val"] ?? "").toLowerCase(),
          basedOn: child(s, "basedOn")?.attrs["w:val"],
          outline: outline === undefined ? undefined : Number(outline),
          numPr: child(pPr, "numPr"),
        },
      ];
    }),
  );
  /** A style and the styles it is based on, nearest first. */
  const chain = (id: string | undefined): Style[] => {
    const out: Style[] = [];
    for (let at = id; at && out.length < 20; ) {
      const found = styleList.get(at);
      if (!found) break;
      out.push(found);
      at = found.basedOn;
    }
    return out;
  };
  const numbering = part("word/numbering.xml");
  const abstracts = new Map(elements(numbering, "abstractNum").map((a) => [a.attrs["w:abstractNumId"], a]));
  const listKind = (numId: string, level: number) => {
    const num = elements(numbering, "num").find((n) => n.attrs["w:numId"] === numId);
    const abstract = abstracts.get(child(num, "abstractNumId")?.attrs["w:val"]);
    const lvl = elements(abstract, "lvl").find((l) => l.attrs["w:ilvl"] === String(level));
    return child(lvl, "numFmt")?.attrs["w:val"] === "bullet" ? "bulletList" : "orderedList";
  };

  const on = (e: XmlElement | undefined) => e !== undefined && !OFF.has(e.attrs["w:val"] ?? "");
  const runMarks = (rPr: XmlElement | undefined): Marks => {
    const marks: Marks = [];
    if (on(child(rPr, "b"))) marks.push({ type: "bold" });
    if (on(child(rPr, "i"))) marks.push({ type: "italic" });
    if (on(child(rPr, "u"))) marks.push({ type: "underline" });
    if (on(child(rPr, "strike")) || on(child(rPr, "dstrike"))) marks.push({ type: "strike" });
    return marks;
  };
  const picture = (node: XmlElement): RichNode[] => {
    // DrawingML pictures name their file with r:embed, older VML ones with r:id.
    const find = (e: XmlElement): XmlElement | undefined =>
      e.name === "blip" || e.name === "imagedata" ? e : elements(e).map(find).find(Boolean);
    const blip = find(node);
    const target = relations.get(blip?.attrs["r:embed"] ?? blip?.attrs["r:id"] ?? "");
    if (!target || target.external) return [];
    const path = target.target.startsWith("/") ? target.target.slice(1) : `word/${target.target}`;
    const src = image(path.replace(/\/\.\//g, "/"));
    if (!src) {
      dropped++;
      return [];
    }
    const describe = (e: XmlElement): string | undefined => e.attrs.descr || elements(e).map(describe).find(Boolean);
    const alt = describe(node);
    return [{ type: "image", attrs: alt ? { src, alt } : { src } }];
  };
  const inline = (parent: XmlElement, marks: Marks): RichNode[] =>
    elements(parent).flatMap((e): RichNode[] => {
      switch (e.name) {
        case "r": {
          const own = [...marks, ...runMarks(child(e, "rPr")).filter((m) => !marks.some((n) => n.type === m.type))];
          return elements(e).flatMap((kid): RichNode[] => {
            const text = (value: string): RichNode[] =>
              value ? [{ type: "text", text: value, ...(own.length ? { marks: own } : {}) }] : [];
            if (kid.name === "t") return text(textOf(kid));
            if (kid.name === "tab") return text("\t");
            if (kid.name === "noBreakHyphen") return text("-");
            if (kid.name === "br" || kid.name === "cr") {
              return kid.attrs["w:type"] === "page" || kid.attrs["w:type"] === "column" ? [] : [{ type: "hardBreak" }];
            }
            if (kid.name === "drawing" || kid.name === "pict" || kid.name === "object") return picture(kid);
            return [];
          });
        }
        case "hyperlink": {
          const target = relations.get(e.attrs["r:id"] ?? "");
          const href = target?.external && SAFE_LINK.test(target.target) ? target.target : undefined;
          return inline(e, href ? [...marks, { type: "link", attrs: { href } }] : marks);
        }
        case "ins":
        case "smartTag":
        case "customXml":
        case "fldSimple":
        case "sdt":
        case "sdtContent":
        case "bdo":
        case "dir":
          return inline(e, marks);
        default:
          return [];
      }
    });
  /** Inline content as paragraphs, with each image as a block of its own and neighbouring text joined. */
  const paragraphs = (run: RichNode[]): RichNode[] => {
    const out: RichNode[] = [];
    let part: RichNode[] = [];
    const flush = () => {
      if (part.some((n) => n.type !== "hardBreak")) out.push({ type: "paragraph", content: part });
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
        part[part.length - 1] = { ...before, text: `${before.text}${node.text}` };
      } else part.push(node);
    }
    flush();
    return out;
  };
  const plain = (nodes: RichNode[]) =>
    nodes.map((n) => (n.type === "text" ? n.text : n.type === "hardBreak" ? "\n" : "")).join("");

  type ListEntry = { numId: string; level: number; content: RichNode[] };
  /** Consecutive list paragraphs as nested lists. */
  const lists = (entries: ListEntry[]): RichNode[] => {
    const roots: RichNode[] = [];
    const open: { list: RichNode; level: number; numId: string }[] = [];
    for (const entry of entries) {
      while ((open.at(-1)?.level ?? -1) > entry.level) open.pop();
      // Another numbering at the same level is another list.
      if (open.at(-1)?.level === entry.level && open.at(-1)?.numId !== entry.numId) open.pop();
      let top = open.at(-1);
      if (!top || top.level < entry.level) {
        const list: RichNode = { type: listKind(entry.numId, entry.level), content: [] };
        const parent = top?.list.content?.at(-1);
        if (parent) parent.content?.push(list);
        else roots.push(list);
        top = { list, level: entry.level, numId: entry.numId };
        open.push(top);
      }
      const content = entry.content.length > 0 ? entry.content : [{ type: "paragraph" }];
      // A list entry starts with a paragraph.
      top.list.content?.push({
        type: "listItem",
        content: content[0]?.type === "paragraph" ? content : [{ type: "paragraph" }, ...content],
      });
    }
    return roots;
  };

  const table = (tbl: XmlElement): RichNode | null => {
    const styleId = child(child(tbl, "tblPr"), "tblStyle")?.attrs["w:val"];
    if (chain(styleId).some((s) => s.name === ITEM_FIELDS)) return null;
    const rows: RichNode[] = [];
    // The cell that starts at each column, for cells merged down from the row above.
    const startedAt = new Map<number, RichNode>();
    for (const tr of elements(tbl, "tr")) {
      const header = child(child(tr, "trPr"), "tblHeader") !== undefined;
      const cells: RichNode[] = [];
      let column = 0;
      for (const tc of elements(tr, "tc")) {
        const tcPr = child(tc, "tcPr");
        const span = Math.min(1000, Math.max(1, Number(child(tcPr, "gridSpan")?.attrs["w:val"]) || 1));
        const merge = child(tcPr, "vMerge");
        const above = startedAt.get(column);
        if (merge && merge.attrs["w:val"] !== "restart" && above) {
          above.attrs = { ...above.attrs, rowspan: (Number(above.attrs?.rowspan) || 1) + 1 };
        } else {
          const content = walk(elements(tc)).flatMap((b) =>
            b.kind === "content" ? [b.node] : [{ type: "paragraph", content: [{ type: "text", text: b.text }] }],
          );
          const cell: RichNode = {
            type: header ? "tableHeader" : "tableCell",
            ...(span > 1 ? { attrs: { colspan: span } } : {}),
            content: content.length > 0 ? content : [{ type: "paragraph" }],
          };
          cells.push(cell);
          startedAt.set(column, cell);
        }
        column += span;
      }
      if (cells.length > 0) rows.push({ type: "tableRow", content: cells });
    }
    return rows.length > 0 ? { type: "table", content: rows } : null;
  };

  const walk = (children: XmlElement[]): WordBlock[] => {
    const out: WordBlock[] = [];
    let pending: ListEntry[] = [];
    const flush = () => {
      for (const node of lists(pending)) out.push({ kind: "content", node, text: textOfDoc(node) });
      pending = [];
    };
    for (const e of children) {
      if (e.name === "sdt") {
        flush();
        out.push(...walk(elements(child(e, "sdtContent"))));
        continue;
      }
      if (e.name === "tbl") {
        flush();
        const node = table(e);
        if (node) out.push({ kind: "content", node, text: textOfDoc(node) });
        continue;
      }
      if (e.name !== "p") continue;
      const pPr = child(e, "pPr");
      const styles = chain(child(pPr, "pStyle")?.attrs["w:val"]);
      const name = styles[0]?.name ?? "";
      if (name === "title" || name === "subtitle" || name.startsWith("toc")) continue;
      const run = inline(e, []);
      const text = plain(run).trim();
      const ownOutline = child(pPr, "outlineLvl")?.attrs["w:val"];
      const outline =
        ownOutline !== undefined ? Number(ownOutline) : styles.find((s) => s.outline !== undefined)?.outline;
      const named = /^heading ([1-9])$/.exec(styles.find((s) => /^heading [1-9]$/.test(s.name))?.name ?? "");
      const level = outline !== undefined && outline < 9 ? outline + 1 : named ? Number(named[1]) : 0;
      if ((level || styles.some((s) => s.name === ITEM_TITLE)) && text) {
        flush();
        out.push(level ? { kind: "heading", level, text: text.slice(0, 200) } : { kind: "title", text });
        continue;
      }
      const numPr = child(pPr, "numPr") ?? styles.find((s) => s.numPr)?.numPr;
      const numId = child(numPr, "numId")?.attrs["w:val"];
      const content = paragraphs(run);
      if (numId && numId !== "0") {
        const ilvl = Math.min(8, Math.max(0, Number(child(numPr, "ilvl")?.attrs["w:val"]) || 0));
        pending.push({ numId, level: ilvl, content });
        continue;
      }
      flush();
      for (const node of content) {
        // Empty paragraphs are only spacing.
        if (node.type === "image" || textOfDoc(node).trim()) out.push({ kind: "content", node, text: textOfDoc(node) });
      }
    }
    flush();
    return out;
  };

  return { blocks: walk(elements(body)), dropped };
}

const textOfDoc = (node: RichNode): string =>
  node.type === "text"
    ? (node.text ?? "")
    : node.type === "hardBreak"
      ? "\n"
      : (node.content ?? []).map(textOfDoc).join(node.type === "paragraph" ? "" : "\n");

// ---------------------------------------------------------------------------------------------------------------
// From blocks to folders and items

/** A row of the review step: a folder from a heading, or an item with its content. */
export type WordRow =
  | { kind: "folder"; level: number; name: string }
  | { kind: "item"; name: string; uid?: string; content: RichNode[] };

/**
 * Groups blocks into folders and items. Headings become folders; an item title starts an item whose content follows.
 * "paragraph": every other paragraph or table is an item, and a list belongs to the item before it.
 * "heading": a heading with content below it is an item holding that content; one with only headings below is a folder.
 * An item title that starts with the UID of an existing item (in `uids`) updates that item.
 */
export function wordRows(blocks: WordBlock[], mode: "paragraph" | "heading", uids: Set<string>): WordRow[] {
  const rows: WordRow[] = [];
  // The item that following content joins, if any.
  let open: Extract<WordRow, { kind: "item" }> | null = null;
  let heading: { level: number; text: string; content: RichNode[] } | null = null;
  const closeHeading = (next?: WordBlock) => {
    if (!heading) return;
    const folder = heading.content.length === 0 && next?.kind === "heading" && next.level > heading.level;
    rows.push(
      folder || (heading.content.length === 0 && next?.kind === "title")
        ? { kind: "folder", level: heading.level, name: heading.text }
        : { kind: "item", name: heading.text, content: heading.content },
    );
    heading = null;
  };
  for (const block of blocks) {
    if (block.kind === "heading") {
      closeHeading(block);
      open = null;
      if (mode === "heading") heading = { level: block.level, text: block.text, content: [] };
      else rows.push({ kind: "folder", level: block.level, name: block.text });
      continue;
    }
    if (block.kind === "title") {
      closeHeading(block);
      const [first = "", ...rest] = block.text.split(/\s+/);
      const uid = uids.has(first) && rest.length > 0 ? first : undefined;
      open = { kind: "item", name: (uid ? rest.join(" ") : block.text).slice(0, 200), content: [] };
      if (uid) open.uid = uid;
      rows.push(open);
      continue;
    }
    if (heading) {
      heading.content.push(block.node);
      continue;
    }
    const previous = rows.at(-1);
    if (open) open.content.push(block.node);
    else if (previous?.kind === "item" && (block.node.type === "bulletList" || block.node.type === "orderedList")) {
      previous.content.push(block.node);
    } else {
      const name = nameFromText(block.text) || (block.node.type === "image" ? "Image" : "Untitled");
      rows.push({ kind: "item", name, content: [block.node] });
    }
  }
  closeHeading();
  return rows;
}

/**
 * The folders and items to import, from the review rows: `skip` leaves rows out (a skipped folder's contents move up),
 * `merge` adds an item's content to the item before it. A folder that already exists at the same place under `root`
 * (in `folders`) is reused, so a document can be imported again.
 */
export function wordTree(
  rows: WordRow[],
  skip: Set<number>,
  merge: Set<number>,
  folders: ExistingFolder[] = [],
  root: string | null = null,
): { nodes: ImportNode[]; items: number; folders: number } {
  const nodes: ImportNode[] = [];
  // Open folders, deepest last, each with the existing folder it stands for: false when new.
  const open: { level: number; node: ImportNode; existing: string | false }[] = [];
  let last: ImportNode | null = null;
  let items = 0;
  let made = 0;
  rows.forEach((row, index) => {
    if (skip.has(index)) return;
    if (row.kind === "folder") {
      while ((open.at(-1)?.level ?? 0) >= row.level) open.pop();
      const parent = open.at(-1);
      const under = parent ? parent.existing : root;
      const found = under === false ? undefined : folders.find((f) => f.parentId === under && f.name === row.name);
      const node: ImportNode = { kind: "folder", name: row.name, children: [], ...(found ? { id: found.id } : {}) };
      (parent ? (parent.node.children as ImportNode[]) : nodes).push(node);
      open.push({ level: row.level, node, existing: found?.id ?? false });
      if (!found) made++;
      return;
    }
    if (merge.has(index) && last) {
      const description = last.description ?? { type: "doc", content: [] };
      description.content = [...(description.content ?? []), ...row.content];
      last.description = description;
      return;
    }
    const item: ImportNode = { kind: "item", name: row.name };
    if (row.uid) item.uid = row.uid;
    if (row.content.length > 0) item.description = { type: "doc", content: row.content };
    const parent = open.at(-1);
    (parent ? (parent.node.children as ImportNode[]) : nodes).push(item);
    last = item;
    items++;
  });
  return { nodes, items, folders: made };
}
