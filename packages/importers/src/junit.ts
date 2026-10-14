/** One `<testcase>` of a JUnit XML report. `message` is the failure or error message, when there is one. */
export type JunitTest = { name: string; classname: string; outcome: "pass" | "fail" | "skipped"; message: string };

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
// Only the five built-in entities and character numbers are decoded. Entities a file declares itself are never expanded.
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name] ?? whole;
    const code = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

function attributes(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, double, single] of text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    found[name as string] = decode(double ?? single ?? "");
  }
  return found;
}

/**
 * Reads the test cases out of a JUnit XML report, or returns null when the text is not one.
 * Trust boundary: the file comes from outside. It is scanned for the few tags that matter, not parsed as a document,
 * so nested suites, properties and captured output are skipped whatever they hold.
 */
export function parseJunit(xml: string): JunitTest[] | null {
  // Comments and CDATA can hold text that looks like tags.
  const text = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (!/<testsuites?[\s>/]/.test(text)) return null;
  const tests: JunitTest[] = [];
  let open: JunitTest | null = null;
  const tags = /<(\/?)(testcase|failure|error|skipped)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (const [, closing, tag, rest = ""] of text.matchAll(tags)) {
    if (tag === "testcase") {
      if (open) tests.push(open);
      open = null;
      if (closing) continue;
      const { name = "", classname = "" } = attributes(rest);
      const test: JunitTest = { name, classname, outcome: "pass", message: "" };
      // `<testcase/>` has no children, so it is complete already.
      if (rest.endsWith("/")) tests.push(test);
      else open = test;
    } else if (open && !closing) {
      if (tag === "skipped") open.outcome = open.outcome === "fail" ? "fail" : "skipped";
      else {
        open.outcome = "fail";
        open.message ||= attributes(rest).message ?? "";
      }
    }
  }
  if (open) tests.push(open);
  return tests;
}

/**
 * Matches reported tests to items by UID. A test belongs to an item when its name or class name contains the item's UID,
 * written with a hyphen, an underscore or nothing between prefix and number, in any letter case: `VER-012`, `test_ver_012`, `Ver12`.
 * Skipped tests record nothing. Several tests for one UID give one outcome, and a failure wins.
 */
export function matchJunit(
  tests: JunitTest[],
  uids: string[],
): { results: { uid: string; outcome: "pass" | "fail"; note: string }[]; unmatched: string[] } {
  const byKey = new Map<string, string>();
  const prefixes = new Set<string>();
  for (const uid of uids) {
    const cut = uid.lastIndexOf("-");
    const prefix = uid.slice(0, cut).toUpperCase();
    prefixes.add(prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    byKey.set(`${prefix}-${Number(uid.slice(cut + 1))}`, uid);
  }
  // Longest prefix first, so `SYS-T` is not read as `SYS`.
  const alternatives = [...prefixes].sort((a, b) => b.length - a.length).join("|");
  const pattern = new RegExp(`(?<![A-Za-z0-9])(${alternatives})[-_ ]?(\\d+)(?!\\d)`, "gi");

  const found = new Map<string, { uid: string; outcome: "pass" | "fail"; note: string }>();
  const unmatched: string[] = [];
  for (const test of tests) {
    const label = [test.classname, test.name].filter(Boolean).join(" ");
    const matched = new Set<string>();
    if (prefixes.size) {
      for (const [, prefix = "", number] of label.matchAll(pattern)) {
        const uid = byKey.get(`${prefix.toUpperCase()}-${Number(number)}`);
        if (uid) matched.add(uid);
      }
    }
    if (matched.size === 0) unmatched.push(label);
    if (test.outcome === "skipped") continue;
    for (const uid of matched) {
      const earlier = found.get(uid);
      if (earlier?.outcome === "fail") continue;
      found.set(uid, { uid, outcome: test.outcome, note: test.outcome === "fail" ? test.message : "" });
    }
  }
  return { results: [...found.values()], unmatched };
}
