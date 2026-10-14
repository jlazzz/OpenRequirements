import { expect, test } from "vitest";
import { matchJunit, parseJunit } from "./junit.ts";

const report = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE testsuites [<!ENTITY big "boom">]>
<testsuites>
  <!-- <testcase name="VER-099 in a comment"/> -->
  <testsuite name="pump" tests="5">
    <properties><property name="os" value="linux"/></properties>
    <testcase classname="pump.Alarm" name="VER-001 alarm sounds" time="0.1"/>
    <testcase classname="pump.Flow" name="test_ver_002_flow &amp; rate">
      <failure message="expected &lt;5&gt; but was 7 &big;" type="AssertionError">trace</failure>
      <system-out><![CDATA[<testcase name="VER-098 in output"/>]]></system-out>
    </testcase>
    <testcase classname='pump.Door' name='Ver3 door "locks"'><error message="crash"/></testcase>
    <testcase name="VER-004 not today"><skipped/></testcase>
    <testcase name="no id here"></testcase>
  </testsuite>
</testsuites>`;

test("a JUnit report is read into its test cases, with failures, errors and skips", () => {
  expect(parseJunit(report)).toEqual([
    { classname: "pump.Alarm", name: "VER-001 alarm sounds", outcome: "pass", message: "" },
    {
      classname: "pump.Flow",
      name: "test_ver_002_flow & rate",
      outcome: "fail",
      // An entity the file declares itself is left as written, never expanded.
      message: "expected <5> but was 7 &big;",
    },
    { classname: "pump.Door", name: 'Ver3 door "locks"', outcome: "fail", message: "crash" },
    { classname: "", name: "VER-004 not today", outcome: "skipped", message: "" },
    { classname: "", name: "no id here", outcome: "pass", message: "" },
  ]);
});

test("text that is not a JUnit report is refused, and an empty suite is fine", () => {
  expect(parseJunit("<html><body>Sign in</body></html>")).toBeNull();
  expect(parseJunit("not xml")).toBeNull();
  expect(parseJunit("<testsuite/>")).toEqual([]);
});

test("tests are matched to items by UID; skipped and unknown tests record nothing", () => {
  const uids = ["VER-001", "VER-002", "VER-003", "VER-004", "VER-040"];
  expect(matchJunit(parseJunit(report) ?? [], uids)).toEqual({
    results: [
      { uid: "VER-001", outcome: "pass", note: "" },
      { uid: "VER-002", outcome: "fail", note: "expected <5> but was 7 &big;" },
      { uid: "VER-003", outcome: "fail", note: "crash" },
    ],
    unmatched: ["no id here"],
  });
});

test("several tests for one UID give one result, and a failure wins", () => {
  const run = (name: string, outcome: "pass" | "fail") => ({ name, classname: "", outcome, message: "why" });
  const { results, unmatched } = matchJunit(
    [run("VER-001 a", "pass"), run("VER-001 b", "fail"), run("VER-001 c", "pass"), run("RIVER-001", "pass")],
    ["VER-001"],
  );
  expect(results).toEqual([{ uid: "VER-001", outcome: "fail", note: "why" }]);
  // A UID inside a longer word does not count.
  expect(unmatched).toEqual(["RIVER-001"]);
  expect(matchJunit([run("VER-001", "pass")], [])).toEqual({ results: [], unmatched: ["VER-001"] });
});
