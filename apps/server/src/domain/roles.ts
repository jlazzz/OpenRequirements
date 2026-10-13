export const ROLES = ["viewer", "reviewer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Project roles, each including everything the one before it can do:
 * viewer reads; reviewer also comments; editor also changes items, folders and relationships; admin also manages members.
 */
export function roleAllows(role: Role, needed: Role): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(needed);
}

/** Ids of the people whose name appears in the text as @Name. Longer names win, so "@Ann Lee" does not also mention "Ann". */
export function findMentions(body: string, people: { id: string; name: string }[]): string[] {
  let rest = body.toLowerCase();
  const found: string[] = [];
  for (const person of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const tag = `@${person.name.toLowerCase()}`;
    if (!person.name || !rest.includes(tag)) continue;
    found.push(person.id);
    rest = rest.replaceAll(tag, " ");
  }
  return found;
}
