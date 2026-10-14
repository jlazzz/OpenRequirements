import { expect, test } from "vitest";
import { codeReferences, findTags } from "./scan.ts";

test("tags are found with their lines; look-alikes are not", () => {
  const text = "// @req SYS-1\nint a; /* @req SYS-1 @req UN-12 */\n// @requires SYS-2, @req sys-3, @req SYS-\n";
  expect([...findTags(text)]).toEqual([
    ["SYS-1", [1, 2]],
    ["UN-12", [2]],
  ]);
});

test("each tagged UID and file becomes one reference to the file on the branch", () => {
  const files = [
    { path: "src/pump control.c", text: "// @req SYS-1\n// @req SYS-2" },
    { path: "README.md", text: "nothing" },
  ];
  expect(codeReferences(files, "https://github.com/acme/pump/", "main", "abcdef1234")).toEqual([
    {
      uid: "SYS-1",
      url: "https://github.com/acme/pump/blob/main/src/pump%20control.c",
      title: "src/pump control.c:1 @ abcdef1",
    },
    {
      uid: "SYS-2",
      url: "https://github.com/acme/pump/blob/main/src/pump%20control.c",
      title: "src/pump control.c:2 @ abcdef1",
    },
  ]);
  expect(codeReferences(files, "https://gitlab.com/acme/pump", "dev", "1234567")[0]?.url).toBe(
    "https://gitlab.com/acme/pump/-/blob/dev/src/pump%20control.c",
  );
});
