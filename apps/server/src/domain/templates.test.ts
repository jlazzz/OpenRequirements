import { expect, test } from "vitest";
import { templates } from "./templates.ts";

test("every template is internally consistent", () => {
  expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
  for (const template of templates) {
    const typeNames = template.itemTypes.map((t) => t.name);
    expect(new Set(typeNames).size, "item type names are unique").toBe(typeNames.length);
    const prefixes = template.sets.map((s) => s.uidPrefix);
    expect(new Set(prefixes).size, "UID prefixes are unique").toBe(prefixes.length);
    for (const set of template.sets) {
      expect(typeNames, `set "${set.name}"`).toContain(set.itemType);
      expect(set.uidPrefix).toMatch(/^[A-Z]{2,6}$/);
    }
    for (const field of template.itemTypes.flatMap((t) => t.fields)) {
      const needsOptions = field.type === "enum" || field.type === "multi_enum";
      expect(Boolean(field.options?.length), `field "${field.name}"`).toBe(needsOptions);
    }
  }
});
