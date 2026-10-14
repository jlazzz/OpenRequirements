import { type RichNode, textToDoc } from "@app/shared";

export type ImportField = { id: string; name: string; type: string; options: string[] | null };

/**
 * A folder or item for `POST /api/projects/:projectId/import`. `ref` names an item so that a relationship in the same
 * request can point at it. `id` or `uid` names an existing node of the set to reuse or update; a node with an
 * `externalId` it was imported with before is updated too.
 */
export type ImportNode = {
  ref?: string;
  kind: "folder" | "item";
  id?: string;
  uid?: string;
  externalId?: string;
  name: string;
  description?: RichNode;
  attributes?: Record<string, unknown>;
  children?: ImportNode[];
};
/** The body of `POST /api/projects/:projectId/import`. */
export type TreeImport = {
  sets: { setId: string; parentId?: string; nodes: ImportNode[] }[];
  links: { typeId: string; upstream: string; downstream: string }[];
  dryRun?: boolean;
};
/** What the import route answers: counts, and each item of the request in order with what happens to it. */
export type ImportResult = {
  created: { items: number; folders: number; links: number };
  changed: number;
  unchanged: number;
  items: { uid: string; name: string; status: "added" | "changed" | "unchanged" }[];
};

/** A long first line, cut to fit an item name. Requirements often have no heading: the start of the text names them. */
export const nameFromText = (text: string) => {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
};

/**
 * What a spreadsheet column is imported as: the item's name, its description, its UID (to update that item), the
 * folder it goes in, a field (by id), or "" to skip it.
 */
export type Target = string;

/** Matches each header cell to "name", "description", "uid", "folder" or the field of that name. The rest is skipped. */
export function guessTargets(header: string[], fields: ImportField[]): Target[] {
  const used = new Set<string>();
  const words: Record<string, string> = {
    name: "name",
    title: "name",
    description: "description",
    text: "description",
    id: "uid",
    uid: "uid",
    folder: "folder",
  };
  return header.map((cell) => {
    const title = cell.trim().toLowerCase();
    const target = words[title] ?? fields.find((f) => f.name.toLowerCase() === title)?.id ?? "";
    if (!target || used.has(target)) return "";
    used.add(target);
    return target;
  });
}

const TRUE = new Set(["yes", "y", "true", "1", "x"]);
const FALSE = new Set(["no", "n", "false", "0"]);

/** Turns a cell's text into a value of the field's type, or says why it cannot. */
export function coerce(field: ImportField, text: string): { value: unknown } | { error: string } {
  const option = (word: string) => field.options?.find((o) => o.toLowerCase() === word.trim().toLowerCase());
  switch (field.type) {
    case "number": {
      const value = Number(text);
      return Number.isFinite(value) ? { value } : { error: "is not a number" };
    }
    case "boolean": {
      const word = text.toLowerCase();
      return TRUE.has(word) ? { value: true } : FALSE.has(word) ? { value: false } : { error: "must be yes or no" };
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}/.test(text) ? { value: text.slice(0, 10) } : { error: "must be a date (YYYY-MM-DD)" };
    case "enum": {
      const value = option(text);
      return value ? { value } : { error: `must be one of: ${field.options?.join(", ")}` };
    }
    case "multi_enum": {
      const values = text.split(/[;,]/).filter((word) => word.trim());
      const matched = values.map(option);
      return matched.every((v) => v !== undefined)
        ? { value: [...new Set(matched)] }
        : { error: `must be a list of: ${field.options?.join(", ")}` };
    }
    default:
      return { value: text };
  }
}

export type ExistingFolder = { id: string; parentId: string | null; name: string };

/**
 * Turns spreadsheet rows (without the header row) into folders and items, following the chosen target of each column.
 * A Folder cell is a path such as "Power / Supply"; a folder that already exists there under `root` is reused.
 * A row with a UID updates that item; its empty cells leave the item's values as they are.
 * Problems are reported with the row number as the spreadsheet shows it, counting the header as row 1.
 */
export function mapRows(
  rows: string[][],
  targets: Target[],
  fields: ImportField[],
  folders: ExistingFolder[] = [],
  root: string | null = null,
): { nodes: ImportNode[]; items: number; errors: string[] } {
  const nodes: ImportNode[] = [];
  const errors: string[] = [];
  let items = 0;
  if (!targets.includes("name")) return { nodes, items, errors: ["Choose the column that holds the item name."] };
  // Folders made so far by path, with the existing folder they stand for: null when new, so nothing is below it yet.
  const made = new Map<string, { node: ImportNode; existing: string | null }>();
  const folderAt = (path: string[]): ImportNode[] => {
    let list = nodes;
    // The existing folder the path has reached so far: `root` at the start, false once inside a new folder.
    let under: string | null | false = root;
    for (const [depth, name] of path.entries()) {
      const key = path.slice(0, depth + 1).join("\n");
      let entry = made.get(key);
      if (!entry) {
        const found: ExistingFolder | undefined =
          under === false ? undefined : folders.find((f) => f.parentId === under && f.name === name);
        const node: ImportNode = { kind: "folder", name, children: [], ...(found ? { id: found.id } : {}) };
        list.push(node);
        entry = { node, existing: found?.id ?? null };
        made.set(key, entry);
      }
      list = entry.node.children as ImportNode[];
      under = entry.existing ?? false;
    }
    return list;
  };
  rows.forEach((row, index) => {
    const item: ImportNode = { kind: "item", name: "" };
    const attributes: Record<string, unknown> = {};
    let path: string[] = [];
    for (const [column, target] of targets.entries()) {
      const text = (row[column] ?? "").trim();
      if (!target || text === "") continue;
      if (target === "name") item.name = text;
      else if (target === "description") item.description = textToDoc(text);
      else if (target === "uid") item.uid = text;
      // shortcut: a folder name that holds a "/" is split in two, quote it if anyone needs such names
      else if (target === "folder")
        path = text
          .split("/")
          .map((part) => part.trim())
          .filter(Boolean);
      else {
        const field = fields.find((f) => f.id === target);
        if (!field) continue;
        const result = coerce(field, text);
        if ("error" in result) errors.push(`Row ${index + 2}: ${field.name} "${text}" ${result.error}`);
        else attributes[target] = result.value;
      }
    }
    if (Object.keys(attributes).length > 0) item.attributes = attributes;
    if (!item.name) errors.push(`Row ${index + 2}: the name is empty`);
    else if (item.name.length > 200) errors.push(`Row ${index + 2}: the name is longer than 200 characters`);
    else if (path.some((part) => part.length > 200)) errors.push(`Row ${index + 2}: a folder name is too long`);
    else {
      folderAt(path).push(item);
      items++;
    }
  });
  return { nodes, items, errors };
}
