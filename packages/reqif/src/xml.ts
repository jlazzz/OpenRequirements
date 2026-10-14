/** An XML element. `name` has no namespace prefix: `<xhtml:p>` and `<p>` both read as "p". */
export type XmlElement = { name: string; attrs: Record<string, string>; children: XmlNode[] };
export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
// Only the five built-in entities and character numbers are decoded. Entities a file declares itself are never expanded.
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name] ?? whole;
    const code = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
const local = (name: string) => name.slice(name.indexOf(":") + 1);

// Sticky: tried only at a "<", so a broken file fails at once instead of being rescanned from every position.
const MARKUP =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s<>/!?=]+)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/y;
const MAX_DEPTH = 200;

/**
 * Reads an XML document into a tree and returns its root element. Throws when the text is not well-formed.
 * Trust boundary: the file comes from outside. A document type declaration is refused, so a file cannot declare
 * entities: no entity expansion attacks and no references to other files.
 */
export function parseXml(xml: string): XmlElement {
  const top: XmlElement = { name: "", attrs: {}, children: [] };
  const open = [top];
  let at = 0;
  const here = () => open.at(-1) as XmlElement;
  while (at < xml.length) {
    const next = xml.indexOf("<", at);
    const text = xml.slice(at, next === -1 ? xml.length : next);
    if (text) here().children.push(decode(text));
    if (next === -1) break;
    MARKUP.lastIndex = next;
    const found = MARKUP.exec(xml);
    if (!found) {
      if (xml.startsWith("<!DOCTYPE", next)) throw new Error("A file with a document type declaration is not accepted");
      throw new Error(`Malformed XML at character ${next}`);
    }
    at = MARKUP.lastIndex;
    const [, cdata, closing, name, rest = "", empty] = found;
    if (cdata !== undefined) here().children.push(cdata);
    if (!name) continue;
    if (closing) {
      if (open.length < 2 || here().name !== local(name)) throw new Error(`Unexpected </${name}> at character ${next}`);
      open.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [, key, double, single] of rest.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[key as string] = decode(double ?? single ?? "");
    }
    const element: XmlElement = { name: local(name), attrs, children: [] };
    here().children.push(element);
    if (!empty) {
      if (open.length > MAX_DEPTH) throw new Error("XML is nested too deeply");
      open.push(element);
    }
  }
  if (open.length > 1) throw new Error(`<${here().name}> is never closed`);
  const roots = top.children.filter((child) => typeof child !== "string");
  if (roots.length !== 1 || top.children.some((child) => typeof child === "string" && child.trim())) {
    throw new Error("Not an XML document");
  }
  return roots[0] as XmlElement;
}

const escapeText = (text: string) => text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
// Characters XML 1.0 cannot hold at all, even escaped.
// biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");

/** Writes a tree as XML text, with no added whitespace. Names are written as given, so a prefix is part of the name. */
export function writeXml(node: XmlNode): string {
  if (typeof node === "string") return escapeText(clean(node));
  const attrs = Object.entries(node.attrs)
    .map(([key, value]) => ` ${key}="${escapeText(clean(value)).replace(/"/g, "&quot;").replace(/\n/g, "&#10;")}"`)
    .join("");
  if (node.children.length === 0) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(writeXml).join("")}</${node.name}>`;
}

/** The child elements of an element, optionally only those with one name. */
export const elements = (parent: XmlElement | undefined, name?: string): XmlElement[] =>
  (parent?.children ?? []).filter(
    (child): child is XmlElement => typeof child !== "string" && (name === undefined || child.name === name),
  );
/** The first child element with a name. */
export const child = (parent: XmlElement | undefined, name: string) => elements(parent, name)[0];
/** All text inside a node, tags removed. */
export const textOf = (node: XmlNode | undefined): string =>
  node === undefined ? "" : typeof node === "string" ? node : node.children.map(textOf).join("");
