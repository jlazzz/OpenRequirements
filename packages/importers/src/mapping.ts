export type ImportField = { id: string; name: string; type: string; options: string[] | null };
export type ImportItem = { name: string; description: string; attributes: Record<string, unknown> };

/** What a spreadsheet column is imported as: the item's name, its description, a field (by id), or "" to skip it. */
export type Target = string;

/** Matches each header cell to "name", "description" or the field with the same name. Anything else is skipped. */
export function guessTargets(header: string[], fields: ImportField[]): Target[] {
  const used = new Set<string>();
  return header.map((cell) => {
    const title = cell.trim().toLowerCase();
    const target =
      title === "name" || title === "title"
        ? "name"
        : title === "description" || title === "text"
          ? "description"
          : (fields.find((f) => f.name.toLowerCase() === title)?.id ?? "");
    if (!target || used.has(target)) return "";
    used.add(target);
    return target;
  });
}

const TRUE = new Set(["yes", "y", "true", "1", "x"]);
const FALSE = new Set(["no", "n", "false", "0"]);

/** Turns a cell's text into a value of the field's type, or says why it cannot. */
function coerce(field: ImportField, text: string): { value: unknown } | { error: string } {
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

/**
 * Turns spreadsheet rows (without the header row) into items, following the chosen target of each column.
 * Problems are reported with the row number as the spreadsheet shows it, counting the header as row 1.
 */
export function mapRows(
  rows: string[][],
  targets: Target[],
  fields: ImportField[],
): { items: ImportItem[]; errors: string[] } {
  const items: ImportItem[] = [];
  const errors: string[] = [];
  if (!targets.includes("name")) return { items, errors: ["Choose the column that holds the item name."] };
  rows.forEach((row, index) => {
    const item: ImportItem = { name: "", description: "", attributes: {} };
    for (const [column, target] of targets.entries()) {
      const text = (row[column] ?? "").trim();
      if (!target || text === "") continue;
      if (target === "name") item.name = text;
      else if (target === "description") item.description = text;
      else {
        const field = fields.find((f) => f.id === target);
        if (!field) continue;
        const result = coerce(field, text);
        if ("error" in result) errors.push(`Row ${index + 2}: ${field.name} "${text}" ${result.error}`);
        else item.attributes[target] = result.value;
      }
    }
    if (!item.name) errors.push(`Row ${index + 2}: the name is empty`);
    else if (item.name.length > 200) errors.push(`Row ${index + 2}: the name is longer than 200 characters`);
    else items.push(item);
  });
  return { items, errors };
}
