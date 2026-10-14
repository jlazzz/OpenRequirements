import { child, elements, parseXml, textOf, writeXml, type XmlElement, type XmlNode } from "./xml.ts";

export type ReqifKind = "string" | "xhtml" | "integer" | "real" | "boolean" | "date" | "enumeration";

/** An attribute definition with its datatype folded in. `values` and `multi` are for enumerations only. */
export type ReqifAttribute = {
  id: string;
  name: string;
  kind: ReqifKind;
  multi?: boolean;
  values?: { id: string; name: string }[];
};
export type ReqifType = {
  id: string;
  name: string;
  kind: "object" | "specification" | "relation";
  attributes: ReqifAttribute[];
};
/**
 * A value by kind: text for string and date, a number for integer and real, the ids of the chosen values for an
 * enumeration, and for XHTML a `div` element holding the content, with prefix-free element names.
 */
export type ReqifValue = string | number | boolean | string[] | XmlElement;
/** Values are keyed by attribute definition id. */
export type ReqifValues = Record<string, ReqifValue>;
export type ReqifObject = { id: string; name: string; typeId: string; values: ReqifValues };
/** A place in a specification's hierarchy: one object and the objects below it. */
export type ReqifNode = { objectId: string; children: ReqifNode[] };
export type ReqifSpecification = {
  id: string;
  name: string;
  typeId: string;
  values: ReqifValues;
  children: ReqifNode[];
};
export type ReqifRelation = { id: string; typeId: string; sourceId: string; targetId: string };
/** The content of a ReqIF file. See the OMG ReqIF 1.2 specification for the terms. */
export type Reqif = {
  title: string;
  types: ReqifType[];
  objects: ReqifObject[];
  specifications: ReqifSpecification[];
  relations: ReqifRelation[];
};

const KINDS: ReqifKind[] = ["string", "xhtml", "integer", "real", "boolean", "date", "enumeration"];
const TYPE_TAGS = {
  "SPEC-OBJECT-TYPE": "object",
  "SPECIFICATION-TYPE": "specification",
  "SPEC-RELATION-TYPE": "relation",
} as const;
/** The text of the first element inside a wrapper: `<TYPE><X-REF>id</X-REF></TYPE>` gives "id". */
const ref = (parent: XmlElement | undefined, wrapper: string) => textOf(elements(child(parent, wrapper))[0]).trim();

function readValues(parent: XmlElement, attributes: Map<string, ReqifAttribute>): ReqifValues {
  const values: ReqifValues = {};
  for (const value of elements(child(parent, "VALUES"))) {
    const attribute = attributes.get(ref(value, "DEFINITION"));
    if (!attribute) continue;
    const text = value.attrs["THE-VALUE"] ?? "";
    switch (attribute.kind) {
      case "xhtml": {
        // The value is whatever THE-VALUE holds, usually one <div>. It is always handed on as one div.
        const content = child(value, "THE-VALUE")?.children ?? [];
        const only = content.filter((node) => typeof node !== "string" || node.trim());
        const div = only.length === 1 && typeof only[0] !== "string" && only[0]?.name === "div" ? only[0] : null;
        values[attribute.id] = div ?? { name: "div", attrs: {}, children: content };
        break;
      }
      case "enumeration":
        values[attribute.id] = elements(child(value, "VALUES")).map((v) => textOf(v).trim());
        break;
      case "integer":
      case "real":
        if (Number.isFinite(Number(text)) && text.trim()) values[attribute.id] = Number(text);
        break;
      case "boolean":
        values[attribute.id] = text.trim() === "true" || text.trim() === "1";
        break;
      default:
        values[attribute.id] = text;
    }
  }
  return values;
}

/**
 * Reads the text of a .reqif file. Throws when it is not XML or not ReqIF.
 * Left out: default values of attribute definitions, relation groups, access rights, and attribute values on relations.
 */
export function parseReqif(xml: string): Reqif {
  const root = parseXml(xml);
  if (root.name !== "REQ-IF") throw new Error("Not a ReqIF file");
  const content = child(child(root, "CORE-CONTENT"), "REQ-IF-CONTENT");

  const enumerations = new Map<string, { id: string; name: string }[]>();
  for (const datatype of elements(child(content, "DATATYPES"), "DATATYPE-DEFINITION-ENUMERATION")) {
    enumerations.set(
      datatype.attrs.IDENTIFIER ?? "",
      elements(child(datatype, "SPECIFIED-VALUES"), "ENUM-VALUE").map((v) => ({
        id: v.attrs.IDENTIFIER ?? "",
        name: v.attrs["LONG-NAME"] ?? v.attrs.IDENTIFIER ?? "",
      })),
    );
  }

  const attributes = new Map<string, ReqifAttribute>();
  const types: ReqifType[] = [];
  for (const type of elements(child(content, "SPEC-TYPES"))) {
    const kind = TYPE_TAGS[type.name as keyof typeof TYPE_TAGS];
    if (!kind) continue;
    const own: ReqifAttribute[] = [];
    for (const definition of elements(child(type, "SPEC-ATTRIBUTES"))) {
      const attributeKind = KINDS.find((k) => definition.name === `ATTRIBUTE-DEFINITION-${k.toUpperCase()}`);
      if (!attributeKind) continue;
      const id = definition.attrs.IDENTIFIER ?? "";
      const attribute: ReqifAttribute = { id, name: definition.attrs["LONG-NAME"] ?? id, kind: attributeKind };
      if (attributeKind === "enumeration") {
        attribute.multi = definition.attrs["MULTI-VALUED"] === "true";
        attribute.values = enumerations.get(ref(definition, "TYPE")) ?? [];
      }
      own.push(attribute);
      attributes.set(id, attribute);
    }
    const id = type.attrs.IDENTIFIER ?? "";
    types.push({ id, name: type.attrs["LONG-NAME"] ?? id, kind, attributes: own });
  }

  const objects = elements(child(content, "SPEC-OBJECTS"), "SPEC-OBJECT").map((object) => ({
    id: object.attrs.IDENTIFIER ?? "",
    name: object.attrs["LONG-NAME"] ?? "",
    typeId: ref(object, "TYPE"),
    values: readValues(object, attributes),
  }));
  const hierarchy = (parent: XmlElement): ReqifNode[] =>
    elements(child(parent, "CHILDREN"), "SPEC-HIERARCHY").map((node) => ({
      objectId: ref(node, "OBJECT"),
      children: hierarchy(node),
    }));
  const specifications = elements(child(content, "SPECIFICATIONS"), "SPECIFICATION").map((spec) => ({
    id: spec.attrs.IDENTIFIER ?? "",
    name: spec.attrs["LONG-NAME"] ?? "",
    typeId: ref(spec, "TYPE"),
    values: readValues(spec, attributes),
    children: hierarchy(spec),
  }));
  const relations = elements(child(content, "SPEC-RELATIONS"), "SPEC-RELATION").map((relation) => ({
    id: relation.attrs.IDENTIFIER ?? "",
    typeId: ref(relation, "TYPE"),
    sourceId: ref(relation, "SOURCE"),
    targetId: ref(relation, "TARGET"),
  }));
  const title = textOf(child(child(child(root, "THE-HEADER"), "REQ-IF-HEADER"), "TITLE")).trim();
  return { title, types, objects, specifications, relations };
}

const el = (name: string, attrs: Record<string, string> = {}, children: XmlNode[] = []): XmlElement => ({
  name,
  attrs,
  children,
});
const prefixed = (node: XmlNode): XmlNode =>
  typeof node === "string" ? node : el(`xhtml:${node.name}`, node.attrs, node.children.map(prefixed));

/**
 * Writes ReqIF 1.2 XML. Every id must be a valid XML id: start with a letter or "_", and be unique in the file.
 * `time` is written as the creation time and as every element's LAST-CHANGE.
 */
export function serializeReqif(reqif: Reqif, time: Date, tool = "open-requirements"): string {
  const stamp = time.toISOString();
  const ident = (id: string, name?: string) => ({
    IDENTIFIER: id,
    "LAST-CHANGE": stamp,
    ...(name ? { "LONG-NAME": name } : {}),
  });
  const refTo = (wrapper: string, tag: string, id: string) => el(wrapper, {}, [el(tag, {}, [id])]);

  // One datatype per simple kind in use, and one per enumeration attribute.
  const all = reqif.types.flatMap((type) => type.attributes);
  const limits: Record<string, Record<string, string>> = {
    string: { "MAX-LENGTH": "10000" },
    integer: { MAX: "9007199254740991", MIN: "-9007199254740991" },
    real: { ACCURACY: "15", MAX: "1.7976931348623157E308", MIN: "-1.7976931348623157E308" },
  };
  const datatypeId = (a: ReqifAttribute) => (a.kind === "enumeration" ? `${a.id}_datatype` : `_datatype_${a.kind}`);
  const datatypes = [
    ...KINDS.filter((kind) => kind !== "enumeration" && all.some((a) => a.kind === kind)).map((kind) =>
      el(`DATATYPE-DEFINITION-${kind.toUpperCase()}`, { ...ident(`_datatype_${kind}`, kind), ...limits[kind] }),
    ),
    ...all
      .filter((a) => a.kind === "enumeration")
      .map((a) =>
        el("DATATYPE-DEFINITION-ENUMERATION", ident(datatypeId(a), a.name), [
          el(
            "SPECIFIED-VALUES",
            {},
            (a.values ?? []).map((value, index) =>
              el("ENUM-VALUE", ident(value.id, value.name), [
                el("PROPERTIES", {}, [el("EMBEDDED-VALUE", { KEY: String(index), "OTHER-CONTENT": value.name })]),
              ]),
            ),
          ),
        ]),
      ),
  ];

  const kindOf = new Map(all.map((a) => [a.id, a.kind]));
  const values = (given: ReqifValues) =>
    el(
      "VALUES",
      {},
      Object.entries(given).flatMap(([id, value]) => {
        const kind = kindOf.get(id);
        if (!kind) return [];
        const tag = kind.toUpperCase();
        const definition = refTo("DEFINITION", `ATTRIBUTE-DEFINITION-${tag}-REF`, id);
        if (kind === "xhtml") {
          const content = typeof value === "object" && !Array.isArray(value) ? [prefixed(value)] : [];
          return [el("ATTRIBUTE-VALUE-XHTML", {}, [definition, el("THE-VALUE", {}, content)])];
        }
        if (kind === "enumeration") {
          const chosen = Array.isArray(value) ? value : [];
          return [
            el("ATTRIBUTE-VALUE-ENUMERATION", {}, [
              definition,
              el(
                "VALUES",
                {},
                chosen.map((v) => el("ENUM-VALUE-REF", {}, [v])),
              ),
            ]),
          ];
        }
        return [el(`ATTRIBUTE-VALUE-${tag}`, { "THE-VALUE": String(value) }, [definition])];
      }),
    );
  const typeTag = (kind: ReqifType["kind"]) =>
    (Object.keys(TYPE_TAGS) as (keyof typeof TYPE_TAGS)[]).find((tag) => TYPE_TAGS[tag] === kind) as string;
  const typeTagOf = new Map(reqif.types.map((type) => [type.id, typeTag(type.kind)]));
  const typeRef = (id: string, fallback: string) => refTo("TYPE", `${typeTagOf.get(id) ?? fallback}-REF`, id);
  let hierarchyCount = 0;
  const hierarchy = (nodes: ReqifNode[]): XmlElement[] =>
    nodes.length === 0
      ? []
      : [
          el(
            "CHILDREN",
            {},
            nodes.map((node) =>
              el("SPEC-HIERARCHY", ident(`_hierarchy_${++hierarchyCount}`), [
                refTo("OBJECT", "SPEC-OBJECT-REF", node.objectId),
                ...hierarchy(node.children),
              ]),
            ),
          ),
        ];

  const root = el(
    "REQ-IF",
    { xmlns: "http://www.omg.org/spec/ReqIF/20110401/reqif.xsd", "xmlns:xhtml": "http://www.w3.org/1999/xhtml" },
    [
      el("THE-HEADER", {}, [
        el("REQ-IF-HEADER", { IDENTIFIER: "_header" }, [
          el("CREATION-TIME", {}, [stamp]),
          el("REQ-IF-TOOL-ID", {}, [tool]),
          el("REQ-IF-VERSION", {}, ["1.0"]),
          el("SOURCE-TOOL-ID", {}, [tool]),
          el("TITLE", {}, [reqif.title]),
        ]),
      ]),
      el("CORE-CONTENT", {}, [
        el("REQ-IF-CONTENT", {}, [
          el("DATATYPES", {}, datatypes),
          el(
            "SPEC-TYPES",
            {},
            reqif.types.map((type) =>
              el(typeTag(type.kind), ident(type.id, type.name), [
                el(
                  "SPEC-ATTRIBUTES",
                  {},
                  type.attributes.map((a) => {
                    const tag = a.kind.toUpperCase();
                    return el(
                      `ATTRIBUTE-DEFINITION-${tag}`,
                      {
                        ...ident(a.id, a.name),
                        ...(a.kind === "enumeration" ? { "MULTI-VALUED": String(!!a.multi) } : {}),
                      },
                      [refTo("TYPE", `DATATYPE-DEFINITION-${tag}-REF`, datatypeId(a))],
                    );
                  }),
                ),
              ]),
            ),
          ),
          el(
            "SPEC-OBJECTS",
            {},
            reqif.objects.map((object) =>
              el("SPEC-OBJECT", ident(object.id, object.name), [
                values(object.values),
                typeRef(object.typeId, "SPEC-OBJECT-TYPE"),
              ]),
            ),
          ),
          el(
            "SPEC-RELATIONS",
            {},
            reqif.relations.map((relation) =>
              el("SPEC-RELATION", ident(relation.id), [
                refTo("SOURCE", "SPEC-OBJECT-REF", relation.sourceId),
                refTo("TARGET", "SPEC-OBJECT-REF", relation.targetId),
                typeRef(relation.typeId, "SPEC-RELATION-TYPE"),
              ]),
            ),
          ),
          el(
            "SPECIFICATIONS",
            {},
            reqif.specifications.map((spec) =>
              el("SPECIFICATION", ident(spec.id, spec.name), [
                values(spec.values),
                typeRef(spec.typeId, "SPECIFICATION-TYPE"),
                ...hierarchy(spec.children),
              ]),
            ),
          ),
        ]),
      ]),
    ],
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${writeXml(root)}\n`;
}
