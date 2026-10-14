import { guessTargets } from "./mapping.ts";
import { guessReqifTargets, type ReqifMapping, type ReqifSummary, type ReqifTargetSet } from "./reqif.ts";

/** A field the import would give an item type. Same types as the editable field routes, without "steps". */
export type ProposedField = {
  name: string;
  type: "text" | "number" | "enum" | "multi_enum" | "date" | "boolean";
  options?: string[];
};
/** A set with its own item type (named like the set) and fields, as read from a file. */
export type ProposedSet = { name: string; uidPrefix: string; fields: ProposedField[] };
export type Proposal = { sets: ProposedSet[]; linkTypes: string[] };

const MAX_NAME = 100;
const MAX_OPTIONS = 200;
const clean = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
const lower = (text: string) => text.trim().toLowerCase();

/** What is already in the project, so a name or prefix is never taken twice. */
export type Used = { setNames: string[]; prefixes: string[] };

/** An upper-case prefix that matches `^[A-Z][A-Z0-9]{0,9}$` and is not in `used`: initials, or the start of one word. */
export function uidPrefixFor(name: string, used: Iterable<string>): string {
  const taken = new Set(used);
  const words = name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  let base = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "");
  base = base.slice(0, words.length > 1 ? 5 : 4).replace(/^[0-9]+/, "");
  if (base === "") base = "ITM";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const next = `${base.slice(0, 10 - String(n).length)}${n}`;
    if (!taken.has(next)) return next;
  }
}

/** A name that differs from every one in `taken` (ignoring case) by a number at the end if need be. */
function uniqueName(name: string, taken: string[]): string {
  const same = (candidate: string) => taken.some((t) => lower(t) === lower(candidate));
  if (!same(name)) return name;
  for (let n = 2; ; n++) {
    const next = `${name.slice(0, MAX_NAME - String(n).length - 1)} ${n}`;
    if (!same(next)) return next;
  }
}

/** Adds a field, or merges it into the field of the same name: same type keeps it, enum values are joined, else text. */
function addField(fields: ProposedField[], next: ProposedField) {
  const found = fields.find((f) => lower(f.name) === lower(next.name));
  if (!found) {
    fields.push(next);
    return;
  }
  if (found.type === next.type && found.options) {
    found.options = [...new Set([...found.options, ...(next.options ?? [])])].slice(0, MAX_OPTIONS);
  } else if (found.type !== next.type) {
    found.type = "text";
    delete found.options;
  }
}

const KIND_TYPE = {
  string: "text",
  xhtml: "text",
  integer: "number",
  real: "number",
  boolean: "boolean",
  date: "date",
} as const;

/**
 * The structure a ReqIF file implies. Each specification becomes a set and an item type of its name; its attributes
 * become fields (enumerations as enum or multi-select fields with the datatype's values), except the ones that
 * `guessReqifTargets` takes for the item's name or description. Relation types become relationship types.
 * `fieldOf` says which field (by name, in the proposal) each attribute id fills; absent for name and description.
 */
export function deriveReqifStructure(
  summary: ReqifSummary,
  used: Used = { setNames: [], prefixes: [] },
): { proposal: Proposal; fieldOf: Record<string, Record<string, string>> } {
  const names = [...used.setNames];
  const prefixes = [...used.prefixes];
  const sets: ProposedSet[] = [];
  const fieldOf: Record<string, Record<string, string>> = {};
  summary.specifications.forEach((spec, index) => {
    const name = uniqueName(clean(spec.name) || `Specification ${index + 1}`, names);
    names.push(name);
    const uidPrefix = uidPrefixFor(name, prefixes);
    prefixes.push(uidPrefix);
    const fields: ProposedField[] = [];
    const targets = guessReqifTargets(spec.attributes, []);
    const own: Record<string, string> = {};
    fieldOf[spec.id] = own;
    for (const attribute of spec.attributes) {
      if (targets[attribute.id]) continue;
      const fieldName = clean(attribute.name.replace(/^ReqIF\./i, ""));
      if (!fieldName) continue;
      const options = [...new Set((attribute.values ?? []).map((v) => clean(v)).filter(Boolean))].slice(0, MAX_OPTIONS);
      if (attribute.kind === "enumeration" && options.length > 0) {
        addField(fields, { name: fieldName, type: attribute.multi ? "multi_enum" : "enum", options });
      } else {
        addField(fields, {
          name: fieldName,
          type: attribute.kind === "enumeration" ? "text" : KIND_TYPE[attribute.kind],
        });
      }
      own[attribute.id] = fieldName;
    }
    // An attribute that was merged into a field of another name by case now points at that field's spelling.
    for (const [id, fieldName] of Object.entries(own)) {
      own[id] = fields.find((f) => lower(f.name) === lower(fieldName))?.name ?? fieldName;
    }
    sets.push({ name, uidPrefix, fields });
  });
  const linkTypes = [
    ...new Set(summary.relationTypes.filter((t) => t.count > 0 && clean(t.name)).map((t) => clean(t.name))),
  ];
  return { proposal: { sets, linkTypes }, fieldOf };
}

const NUMBER = /^-?\d+(\.\d+)?$/;
const YES_NO = new Set(["yes", "no", "true", "false", "y", "n"]);
const DATE = /^\d{4}-\d{2}-\d{2}/;

/** A column's field type from its values: number, yes/no, date, a short pick list, or text. */
export function inferFieldType(values: string[]): ProposedField {
  const found = values.map((v) => v.trim()).filter(Boolean);
  if (found.length === 0) return { name: "", type: "text" };
  if (found.every((v) => NUMBER.test(v))) return { name: "", type: "number" };
  if (found.every((v) => YES_NO.has(v.toLowerCase()))) return { name: "", type: "boolean" };
  if (found.every((v) => DATE.test(v))) return { name: "", type: "date" };
  const distinct = [...new Set(found)];
  const short = distinct.every((v) => v.length <= MAX_NAME && !/[;,\n]/.test(v));
  // A pick list only when values repeat: unique text (a description, an id) stays text.
  if (short && distinct.length <= 12 && found.length >= 4 && distinct.length * 2 <= found.length) {
    return { name: "", type: "enum", options: distinct };
  }
  return { name: "", type: "text" };
}

/**
 * The structure a spreadsheet implies: one set named `setName`, a field for each column that is not the name,
 * description or folder. `targets` per column is "name", "description", "folder", "" (skipped) or the field name.
 * UID columns are skipped: a new set has no UIDs yet, and the source tool's ids are kept as a text field.
 */
export function deriveSheetStructure(
  header: string[],
  rows: string[][],
  setName: string,
  used: Used = { setNames: [], prefixes: [] },
): { proposal: Proposal; columns: string[] } {
  const name = uniqueName(clean(setName) || "Imported", used.setNames);
  const guessed = guessTargets(header, [], rows, new Set());
  const fields: ProposedField[] = [];
  const columns = header.map((title, column) => {
    const target = guessed[column] ?? "";
    if (target === "name" || target === "description" || target === "folder") return target;
    const fieldName = clean(title);
    if (!fieldName) return "";
    const type = inferFieldType(rows.map((row) => row[column] ?? ""));
    addField(fields, { ...type, name: fieldName });
    return fields.find((f) => lower(f.name) === lower(fieldName))?.name ?? "";
  });
  // A sheet with no Name column uses its first column.
  if (!columns.includes("name") && header.length > 0) {
    const first = columns[0] ?? "";
    columns[0] = "name";
    const at = fields.findIndex((f) => f.name === first);
    if (at >= 0 && !columns.slice(1).includes(first)) fields.splice(at, 1);
  }
  return {
    proposal: { sets: [{ name, uidPrefix: uidPrefixFor(name, used.prefixes), fields }], linkTypes: [] },
    columns,
  };
}

/** What the project has now, as `GET /api/projects/:projectId/types` lists it, plus every prefix ever used. */
export type Existing = {
  itemTypes: {
    id: string;
    name: string;
    fields: { id: string; name: string; type: string; options: string[] | null }[];
  }[];
  sets: { id: string; name: string; uidPrefix: string; itemTypeId: string }[];
  linkTypes: { id: string; name: string }[];
  prefixes: string[];
};

/** `id` is null for what will be created. */
export type PlannedSet = {
  name: string;
  id: string | null;
  uidPrefix: string;
  itemType: { id: string | null; name: string };
  fields: { name: string; type: string; options: string[] | null; id: string | null; addOptions: string[] }[];
};
export type StructurePlan = {
  sets: PlannedSet[];
  linkTypes: { name: string; id: string | null }[];
  /** Things the file asks for that the project already has differently. Nothing is changed for them. */
  notes: string[];
};

/**
 * Works out what must be added so that every set, field and relationship type of the proposal exists. Never
 * renames or removes: a set, item type, field or relationship type of the same name (ignoring case) is used as it is,
 * a field of another type keeps its type and gets a note, and an existing enum only gains values it lacks.
 */
export function planStructure(proposal: Proposal, existing: Existing): StructurePlan {
  const notes: string[] = [];
  const prefixes = new Set(existing.prefixes);
  const typeNames = existing.itemTypes.map((t) => t.name);
  const sets: PlannedSet[] = [];
  for (const wanted of proposal.sets) {
    const set = existing.sets.find((s) => lower(s.name) === lower(wanted.name));
    const type = set
      ? existing.itemTypes.find((t) => t.id === set.itemTypeId)
      : existing.itemTypes.find((t) => lower(t.name) === lower(wanted.name));
    const typeName = type?.name ?? uniqueName(wanted.name, typeNames);
    if (!type) typeNames.push(typeName);
    let uidPrefix = set?.uidPrefix ?? wanted.uidPrefix;
    if (!set) {
      if (prefixes.has(uidPrefix)) uidPrefix = uidPrefixFor(uidPrefix, prefixes);
      prefixes.add(uidPrefix);
    }
    if (set && !type) throw new Error("set without an item type");
    const fields: PlannedSet["fields"] = [];
    for (const field of wanted.fields) {
      const have = type?.fields.find((f) => lower(f.name) === lower(field.name));
      if (!have) {
        fields.push({ name: field.name, type: field.type, options: field.options ?? null, id: null, addOptions: [] });
        continue;
      }
      let addOptions: string[] = [];
      if (have.type !== field.type) {
        notes.push(
          `${wanted.name}: "${have.name}" is a ${have.type} field here; values from the file are read as that`,
        );
      } else if (field.options && have.options) {
        const known = new Set(have.options.map(lower));
        addOptions = field.options.filter((o) => !known.has(lower(o)));
      }
      fields.push({ name: have.name, type: have.type, options: have.options, id: have.id, addOptions });
    }
    sets.push({
      name: set?.name ?? wanted.name,
      id: set?.id ?? null,
      uidPrefix,
      itemType: { id: type?.id ?? null, name: typeName },
      fields,
    });
  }
  const linkTypes = proposal.linkTypes.map((name) => {
    const have = existing.linkTypes.find((t) => lower(t.name) === lower(name));
    return { name: have?.name ?? name, id: have?.id ?? null };
  });
  return { sets, linkTypes, notes };
}

/** The structure route's answer, in the order of the proposal. Ids are null in a dry run. */
export type AppliedStructure = {
  sets: {
    id: string | null;
    name: string;
    fields: { name: string; type: string; options: string[] | null; id: string | null }[];
  }[];
  linkTypes: { name: string; id: string | null }[];
};

/**
 * The ReqIF mapping and target sets for an applied (or dry-run) structure: each specification goes to its set, name and
 * description attributes to name and description, the others to the field `fieldOf` chose. In a dry run the ids are
 * made up from the names, so the result can be previewed with `mapReqif`; only a real one can be imported.
 */
export function reqifMappingFor(
  summary: ReqifSummary,
  fieldOf: Record<string, Record<string, string>>,
  applied: AppliedStructure,
): { mapping: ReqifMapping; targets: ReqifTargetSet[] } {
  const targets: ReqifTargetSet[] = applied.sets.map((set) => ({
    id: set.id ?? `new:${set.name}`,
    name: set.name,
    fields: set.fields.map((f) => ({
      id: f.id ?? `new:${set.name}:${f.name}`,
      name: f.name,
      type: f.type,
      options: f.options,
    })),
  }));
  const mapping: ReqifMapping = { specifications: {}, relations: {} };
  summary.specifications.forEach((spec, index) => {
    const target = targets[index];
    if (!target) return;
    const named = guessReqifTargets(spec.attributes, []);
    mapping.specifications[spec.id] = {
      setId: target.id,
      targets: Object.fromEntries(
        spec.attributes.map((a) => {
          const field = fieldOf[spec.id]?.[a.id];
          return [
            a.id,
            named[a.id] || (field ? (target.fields.find((f) => lower(f.name) === lower(field))?.id ?? "") : ""),
          ];
        }),
      ),
    };
  });
  for (const type of summary.relationTypes) {
    const found = applied.linkTypes.find((t) => lower(t.name) === lower(clean(type.name)));
    mapping.relations[type.id] = { typeId: found ? (found.id ?? `new:${found.name}`) : "", reverse: false };
  }
  return { mapping, targets };
}
