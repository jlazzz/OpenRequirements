// The requirements of this tool itself, loaded by `npm run dogfood`. Derived from CLAUDE.md (hard rules), the ADRs and
// the user guide. Each entry has a stable `id`, the external id the import route matches on, so a second run updates
// instead of duplicating. Wording: one testable "The system shall" sentence each.
//
// A test names the requirements it verifies (`verifies`). `code` is set when a test file in the repo carries the
// matching `@req VER-nnn` tag; the UID of a test is its place in `tests` (VER-001 is the first) on a fresh project.

export type Need = { id: string; name: string; text: string; priority: "High" | "Medium" | "Low" };
export type Requirement = {
  id: string;
  name: string;
  text: string;
  from: string[];
  method: "Test" | "Analysis" | "Inspection" | "Demonstration";
  why?: string;
  priority?: "High" | "Medium" | "Low";
};
export type TestCase = {
  id: string;
  name: string;
  /** What the person or program does, then what must be seen. */
  do: string;
  expected: string;
  verifies: string[];
  /** The test file that carries this test's `@req` tag. */
  code?: string;
};

const need = (id: string, name: string, text: string, priority: Need["priority"] = "High"): Need => ({
  id,
  name,
  text,
  priority,
});
const req = (
  id: string,
  name: string,
  text: string,
  from: string,
  method: Requirement["method"] = "Test",
  why?: string,
): Requirement => ({ id, name, text, from: [from], method, ...(why ? { why } : {}) });
const test = (
  id: string,
  name: string,
  doing: string,
  expected: string,
  verifies: string[],
  code?: string,
): TestCase => ({
  id,
  name,
  do: doing,
  expected,
  verifies,
  ...(code ? { code } : {}),
});

const APP = "apps/server/src/app.test.ts";
const SEC = "apps/server/src/security.test.ts";

export const needs: Need[] = [
  need(
    "need.history",
    "Trustworthy history",
    "As a quality engineer I need every change to a requirement kept and attributed, so that I can show what was true at any time.",
  ),
  need(
    "need.access",
    "Controlled access",
    "As a project admin I need to decide who reads, comments and edits, so that project data stays with the right people.",
  ),
  need(
    "need.versions",
    "See and undo changes",
    "As an author I need to compare versions of an item and return to an old one, so that a mistake costs little.",
  ),
  need(
    "need.trace",
    "Trace needs to tests",
    "As a systems engineer I need typed relationships between items and views over them, so that I can show every need is met and tested.",
  ),
  need(
    "need.impact",
    "Know what a change touches",
    "As a systems engineer I need relationships flagged when either end changes, so that no change goes unreviewed downstream.",
  ),
  need(
    "need.baselines",
    "Freeze a state",
    "As a project lead I need to freeze the content at a milestone and compare it later, so that a release has a fixed record.",
  ),
  need(
    "need.verification",
    "Know what is verified",
    "As a test engineer I need each requirement's verification status computed from the latest test results, so that gaps are visible.",
  ),
  need(
    "need.review",
    "Formal review and approval",
    "As a quality engineer I need reviews with signed approvals, so that approval is documented and cannot be altered.",
  ),
  need(
    "need.testexec",
    "Plan and run tests",
    "As a test engineer I need to plan test cycles and execute them step by step, so that results are recorded against the right version.",
  ),
  need(
    "need.exchange",
    "Exchange with other tools",
    "As a team migrating from other tools I need to import and export spreadsheets, Word and ReqIF, so that I am not locked in.",
  ),
  need(
    "need.integrate",
    "Fit into our pipeline",
    "As a developer I need an API, webhooks and code tags, so that CI and other tools connect to requirements.",
  ),
  need(
    "need.selfhost",
    "Run it ourselves",
    "As an administrator I need to install, back up and upgrade the tool on our own servers, so that our data stays in our control.",
  ),
  need(
    "need.accounts",
    "Secure accounts",
    "As a security officer I need sign-in controls and a tamper-evident log, so that the system meets our policy for electronic records.",
    "Medium",
  ),
  need(
    "need.collab",
    "Work together safely",
    "As an author I need to be told when someone else edits an item, and to merge, so that nobody's work is lost.",
    "Medium",
  ),
];

export const requirements: Requirement[] = [
  // History and audit
  req(
    "req.soft-delete",
    "Soft delete only",
    "The system shall never remove an item from the database: deleting an item or folder marks it deleted, and it stays in history and baselines.",
    "need.history",
    "Test",
    "CLAUDE.md hard rule 1.",
  ),
  req(
    "req.restore",
    "Restore deleted",
    "The system shall let an editor restore a deleted folder with its contents, or a deleted item.",
    "need.history",
  ),
  req(
    "req.append-only",
    "Append-only revisions",
    "The system shall record every change to an item as a new immutable revision and shall not update or delete an existing revision.",
    "need.history",
    "Test",
    "CLAUDE.md hard rule 2.",
  ),
  req(
    "req.revision-author",
    "Revision attribution",
    "The system shall store with each revision its author, time and change reason.",
    "need.history",
  ),
  req(
    "req.audit-every-write",
    "Audit every write",
    "The system shall create an audit event, in the same transaction, for every change of project data.",
    "need.history",
    "Test",
    "CLAUDE.md hard rule 3.",
  ),
  req(
    "req.draft-audit",
    "Draft audit",
    "The system shall audit an auto-saved draft when it starts and when it is discarded, and not on each save.",
    "need.history",
  ),
  req(
    "req.uid-monotonic",
    "UIDs in sequence",
    "The system shall give each item in a set the next number of that set's counter as its UID.",
    "need.history",
  ),
  req(
    "req.uid-never-reused",
    "UIDs never reused",
    "The system shall not give a UID to a second item, including after the first item is deleted.",
    "need.history",
    "Test",
    "CLAUDE.md hard rule 5.",
  ),
  req(
    "req.uid-concurrent",
    "UIDs under concurrency",
    "The system shall give different UIDs to items created at the same time in one set.",
    "need.history",
  ),
  req(
    "req.audit-chain",
    "Audit hash chain",
    "The system shall link each audit event to the previous one by a SHA-256 hash and shall report the first row where the chain is broken.",
    "need.history",
  ),
  // Access
  req(
    "req.perm-every-route",
    "Every route checks access",
    "The system shall refuse a request to any API route other than the public ones when it carries no valid session or token.",
    "need.access",
    "Test",
    "CLAUDE.md hard rule 4.",
  ),
  req(
    "req.perm-membership",
    "Members only",
    "The system shall answer 404 to a person who is not a member of a project for every route naming something in it.",
    "need.access",
  ),
  req(
    "req.perm-roles",
    "Role limits",
    "The system shall let a Viewer read, a Reviewer also comment, an Editor also change items and relationships, and an Admin also manage members, and refuse each role what it may not do with 403.",
    "need.access",
  ),
  req(
    "req.perm-project-create",
    "Only admins create projects",
    "The system shall let only an instance administrator create a project.",
    "need.access",
  ),
  req(
    "req.perm-types",
    "Only admins edit types",
    "The system shall let only a project admin change item types, fields, sets and relationship types.",
    "need.access",
  ),
  req(
    "req.invite",
    "Invitations",
    "The system shall create an account from an invitation link once, and refuse an expired or used link.",
    "need.access",
  ),
  req(
    "req.api-same",
    "One API",
    "The web application shall use only the public API that integrations use.",
    "need.access",
    "Inspection",
    "CLAUDE.md hard rule 6.",
  ),
  // Versions
  req(
    "req.save-version",
    "Save version",
    "The system shall create a new revision when an editor saves an item and keep all earlier ones readable.",
    "need.versions",
  ),
  req(
    "req.history-list",
    "Version history",
    "The system shall list every version of an item, newest first, with author and reason.",
    "need.versions",
  ),
  req(
    "req.draft-private",
    "Private drafts",
    "The system shall keep an author's auto-saved draft readable only by that author until it is saved as a version or discarded.",
    "need.versions",
  ),
  req(
    "req.no-lost-update",
    "No lost update",
    "The system shall refuse a save made from a revision that is no longer the latest.",
    "need.versions",
  ),
  req(
    "req.richtext-safe",
    "Safe rich text",
    "The system shall refuse rich text that contains unsupported or unsafe content.",
    "need.versions",
  ),
  req(
    "req.restore-version",
    "Restore a version",
    "The system shall let an editor save an earlier version's content as a new version.",
    "need.versions",
  ),
  req(
    "req.child-items",
    "Child items",
    "The system shall allow an item to hold child items of the same set, and shall not place a folder under an item or an item under itself.",
    "need.versions",
  ),
  // Trace
  req(
    "req.link-types",
    "Typed relationships",
    "The system shall let an editor link an upstream item to a downstream item with a relationship type, once per pair.",
    "need.trace",
  ),
  req(
    "req.link-once",
    "One link per pair under concurrency",
    "The system shall create exactly one relationship when two requests link the same pair at once.",
    "need.trace",
  ),
  req(
    "req.trace-view",
    "Trace view",
    "The system shall show, for an item or set, the items upstream and downstream across sets, and shall not pass through an item twice.",
    "need.trace",
  ),
  req(
    "req.coverage",
    "Coverage",
    "The system shall report which items of a set have no downstream relationship to a chosen set.",
    "need.trace",
  ),
  req(
    "req.matrix",
    "Traceability matrix",
    "The system shall show the relationships between two sets as a matrix and export it.",
    "need.trace",
    "Demonstration",
  ),
  req(
    "req.types-editable",
    "Editable types",
    "The system shall let a project admin add and soft-remove item types, fields, sets and relationship types without changing old versions.",
    "need.trace",
  ),
  // Suspect
  req(
    "req.suspect-rule",
    "Suspect rule",
    "The system shall mark a relationship suspect when either end has a newer revision than the one it was created or last confirmed against, and shall not store the flag.",
    "need.impact",
  ),
  req(
    "req.suspect-confirm",
    "Confirm a relationship",
    "The system shall let an editor confirm a suspect relationship, which appends a relationship revision and clears the flag until the next change.",
    "need.impact",
  ),
  req(
    "req.suspect-notify",
    "Suspect notice",
    "The system shall notify the person who last saved the far end when a relationship becomes suspect, once.",
    "need.impact",
  ),
  req(
    "req.status-only",
    "Status-only changes",
    "The system shall not make a relationship suspect, nor a result out of date, for a version that changes only Status.",
    "need.impact",
  ),
  // Baselines
  req(
    "req.baseline-freeze",
    "Baseline freezes",
    "The system shall create a baseline that records the revision of every item, the folder structure and the live relationships, and later changes shall not alter it.",
    "need.baselines",
  ),
  req(
    "req.baseline-compare",
    "Baseline compare",
    "The system shall compare a baseline with the current state or with another baseline in items, relationships including suspect, and frozen verification.",
    "need.baselines",
  ),
  req(
    "req.baseline-verification",
    "Frozen verification",
    "The system shall store each requirement's verification status when a baseline is made.",
    "need.baselines",
  ),
  // Verification
  req(
    "req.ver-status",
    "Verification status",
    'The system shall compute a requirement\'s status as not covered, not run, passing or failing from the latest result of each test linked by a relationship type with the role "verifies".',
    "need.verification",
  ),
  req(
    "req.ver-append-only",
    "Results are append-only",
    "The system shall store each verification result as a new row and not change it afterwards.",
    "need.verification",
  ),
  req(
    "req.ver-out-of-date",
    "Out of date",
    "The system shall treat a result as out of date when the test case has a newer version or the requirement was revised after it.",
    "need.verification",
  ),
  req(
    "req.ver-junit",
    "JUnit import",
    "The system shall record results on the test cases that a JUnit report names by UID.",
    "need.verification",
  ),
  req(
    "req.ver-flaky",
    "Flaky tests",
    "The system shall list a test case as flaky when its last five results changed outcome more than once.",
    "need.verification",
  ),
  req(
    "req.ver-validate",
    "Results are validated",
    "The system shall refuse a result that is not on a test case, names a missing version, or comes from a Reviewer.",
    "need.verification",
  ),
  req(
    "req.evidence",
    "Evidence files",
    "The system shall keep files attached to a result or run as append-only evidence, judge their type by content, and show only images inline.",
    "need.verification",
  ),
  // Review
  req(
    "req.review-marks",
    "Review marks",
    "The system shall record each reviewer's marks and comments per item of a baseline, keeping the latest mark per person.",
    "need.review",
  ),
  req(
    "req.review-sign",
    "Electronic signature",
    "The system shall require an approver to enter their password to sign, and shall store the meaning, name, time and a digest of what was signed.",
    "need.review",
  ),
  req(
    "req.review-close",
    "Review closes permanently",
    "The system shall work out a review's outcome once, at closing, and shall not reopen it.",
    "need.review",
  ),
  req(
    "req.review-reject",
    "One rejection rejects",
    "The system shall give a review the state rejected when any approver rejects an item, and shall write nothing to the items.",
    "need.review",
  ),
  req(
    "req.review-approve",
    "Approval sets Status",
    "The system shall set Status to Approved on approved items without making relationships suspect or results out of date.",
    "need.review",
  ),
  // Tests
  req(
    "req.plan-cycle",
    "Test cycle",
    "The system shall freeze each test case's current version when a cycle starts from a plan, and close the cycle permanently.",
    "need.testexec",
  ),
  req(
    "req.run-steps",
    "Step-by-step runs",
    "The system shall record a step result per step of a run and compute the run's state from the latest result of each step.",
    "need.testexec",
  ),
  req(
    "req.run-result",
    "Finishing a run",
    "The system shall append a verification result at the frozen version when a run is finished.",
    "need.testexec",
  ),
  req(
    "req.run-assign",
    "Assigned runs",
    "The system shall let a Reviewer execute runs assigned to them and an Editor any run, and notify an assignee.",
    "need.testexec",
  ),
  req(
    "req.steps",
    "Test steps",
    "The system shall hold steps on test cases, with action and expected result, and keep them per version.",
    "need.testexec",
  ),
  // Exchange
  req(
    "req.import-extid",
    "Import by identifier",
    "The system shall, on import, match an item named by id, UID or external id, give it a new version when it differs, and create it otherwise.",
    "need.exchange",
  ),
  req(
    "req.import-dryrun",
    "Import preview",
    "The system shall write nothing when an import is a dry run, and shall report what would change.",
    "need.exchange",
  ),
  req(
    "req.import-atomic",
    "Import all or nothing",
    "The system shall apply a structured import completely or not at all.",
    "need.exchange",
  ),
  req(
    "req.reqif",
    "ReqIF round trip",
    "The system shall export a set or baseline as ReqIF and import it into another project with the same content.",
    "need.exchange",
  ),
  req(
    "req.word-export",
    "Word export",
    "The system shall export a set or baseline as a Word document with folders as headings, items, field tables and images.",
    "need.exchange",
  ),
  req(
    "req.bulk",
    "Bulk change",
    "The system shall apply a bulk delete, move or field change to up to 500 items of a set, all or none.",
    "need.exchange",
  ),
  req(
    "req.backup",
    "Backup and restore",
    "The system shall restore a backup file as a new project with its history, relationships, comments, baselines and images, and refuse a malformed file without leaving anything behind.",
    "need.selfhost",
  ),
  // Integration
  req(
    "req.token",
    "Access tokens",
    "The system shall let a script sign in with a personal access token until it is revoked or expires, and shall not let a token create tokens.",
    "need.integrate",
  ),
  req(
    "req.openapi",
    "API description",
    "The system shall serve an OpenAPI description of its routes, and the committed copy shall match the routes.",
    "need.integrate",
  ),
  req(
    "req.webhook",
    "Webhooks",
    "The system shall post a signed JSON message to each configured webhook for every audited write, and retry a failed delivery.",
    "need.integrate",
  ),
  req(
    "req.private-addr",
    "Private addresses refused",
    "The system shall refuse webhook and connection addresses on private networks unless that is allowed by configuration.",
    "need.integrate",
  ),
  req(
    "req.code-refs",
    "Code references",
    "The system shall keep code references from the tag scanner in step with the repository: add new, update changed, remove withdrawn.",
    "need.integrate",
  ),
  req(
    "req.oidc",
    "OpenID Connect",
    "The system shall sign a person in through the identity provider and refuse a sign-in where any ID token check fails.",
    "need.integrate",
  ),
  // Accounts and security
  req(
    "req.setup-once",
    "Setup once",
    "The system shall create the first administrator once only, even when two requests race, and refuse a short password.",
    "need.accounts",
  ),
  req(
    "req.login",
    "Sign-in",
    "The system shall rate limit repeated sign-in attempts and end a session on logout or expiry.",
    "need.accounts",
  ),
  req(
    "req.lockout",
    "Account lockout",
    "The system shall lock an account after the configured number of failed sign-ins and clear the count on a good sign-in.",
    "need.accounts",
  ),
  req(
    "req.pw-expiry",
    "Password expiry",
    "The system shall refuse sign-in with an expired password and end open sessions.",
    "need.accounts",
  ),
  req(
    "req.idle",
    "Idle timeout",
    "The system shall end a session after the configured idle time, and keep it alive by use.",
    "need.accounts",
  ),
  req(
    "req.headers",
    "Security headers",
    "The system shall send security headers on every response, and mark cookies Secure and send HSTS behind HTTPS.",
    "need.accounts",
  ),
  req(
    "req.recovery",
    "Password recovery",
    "The system shall email a one-time reset link that sets a new password and ends other sessions, and refuse an expired link.",
    "need.accounts",
  ),
  // Collaboration
  req(
    "req.mention",
    "Mentions notify",
    "The system shall notify a person who is mentioned in a comment, by email if they chose it, and let them mark it read.",
    "need.collab",
  ),
  req(
    "req.also-editing",
    "Also editing",
    "The system shall show who else has a draft of an open item and its latest version, never the draft itself.",
    "need.collab",
  ),
  req(
    "req.mail-retry",
    "Email is retried",
    "The system shall keep a failed email and try it again later.",
    "need.collab",
  ),
  req(
    "req.search",
    "Search",
    "The system shall find items by UID, name, description and field values within one project only.",
    "need.collab",
  ),
];

export const tests: TestCase[] = [
  test(
    "test.delete",
    "Deleting keeps history and UIDs",
    "Delete a folder holding items, then create a new item in the set.",
    "The folder and its items are hidden but readable in history; the new item gets a UID never used before.",
    ["req.soft-delete", "req.uid-never-reused"],
    APP,
  ),
  test(
    "test.restore",
    "Restore a folder or item",
    "Delete a folder, restore it; delete an item, restore it.",
    "The folder returns with its contents; the item comes back under the set.",
    ["req.restore"],
  ),
  test(
    "test.save",
    "Saving appends a revision",
    "Save an item twice with reasons.",
    "Both revisions are listed newest first with author and reason, and the first is unchanged.",
    ["req.append-only", "req.revision-author", "req.save-version", "req.history-list"],
  ),
  test(
    "test.uid",
    "UIDs are sequential and unique",
    "Create items one after another, then 20 at once in one set.",
    "UIDs follow the counter and no two items share one.",
    ["req.uid-monotonic", "req.uid-concurrent"],
  ),
  test(
    "test.draft",
    "Drafts are private and consumed",
    "Auto-save a draft as one user; read the item as another; then save a version.",
    "Only the author sees the draft; the other sees who has one; saving consumes it; the activity log shows start and discard only.",
    ["req.draft-private", "req.draft-audit", "req.also-editing"],
  ),
  test(
    "test.stale-save",
    "Two saves from one revision",
    "Send two saves based on the same revision.",
    "One succeeds and the other is refused.",
    ["req.no-lost-update"],
  ),
  test(
    "test.unsafe-richtext",
    "Unsafe rich text refused",
    "Save a version containing an unsupported node.",
    "The save is refused.",
    ["req.richtext-safe"],
  ),
  test(
    "test.child",
    "Child items",
    "Create a child item, a folder under an item, and move an item under itself.",
    "The child is accepted; the folder and the self-move are refused.",
    ["req.child-items"],
  ),
  test(
    "test.anon",
    "Anonymous requests refused",
    "Call every non-public API route without a session.",
    "Each answers 401.",
    ["req.perm-every-route"],
  ),
  test(
    "test.outsider",
    "Outsider refused",
    "As a non-member, call each route that names a project, set, item, baseline, review or run.",
    "Each answers 404.",
    ["req.perm-membership"],
  ),
  test(
    "test.roles",
    "Each role does exactly its part",
    "As Viewer, Reviewer, Editor and Admin attempt read, comment, edit and manage members.",
    "Each is allowed its part and refused the rest with 403.",
    ["req.perm-roles"],
    APP,
  ),
  test(
    "test.project-create",
    "Only administrators create projects",
    "Create a project as a non-administrator, then as one.",
    "403 then success.",
    ["req.perm-project-create"],
  ),
  test(
    "test.types-admin",
    "Only project admins edit types",
    "As an editor and as an admin, add a field.",
    "The editor is refused; the admin succeeds; a viewer can read types.",
    ["req.perm-types", "req.types-editable"],
  ),
  test(
    "test.invite",
    "Invitation works once",
    "Accept an invitation twice; accept an expired one.",
    "The first creates the account; the others are refused.",
    ["req.invite"],
  ),
  test(
    "test.link",
    "Link once per pair",
    "Link two items, link them again, link the same pair from two requests at once.",
    "The pair is linked once; the second attempts are refused.",
    ["req.link-types", "req.link-once"],
  ),
  test(
    "test.trace",
    "Trace, coverage and impact",
    "Trace across sets with a relationship loop; ask for coverage.",
    "Paths follow links, never revisit an item, and coverage lists items without downstream links.",
    ["req.trace-view", "req.coverage"],
  ),
  test(
    "test.suspect",
    "Relationship becomes suspect and is confirmed",
    "Save a new version of one end; confirm the relationship.",
    "It is suspect after the save and not after the confirmation, which adds a relationship revision.",
    ["req.suspect-rule", "req.suspect-confirm"],
    APP,
  ),
  test(
    "test.suspect-rule",
    "Suspect rule, pure",
    "Compare confirmed revisions with current ones.",
    "A newer revision at either end makes it suspect and names the end.",
    ["req.suspect-rule"],
    "apps/server/src/domain/suspect.test.ts",
  ),
  test(
    "test.suspect-notify",
    "Suspect notification",
    "Save the far end of a relationship.",
    "Its last editor is notified once.",
    ["req.suspect-notify"],
  ),
  test(
    "test.baseline",
    "Baseline freezes",
    "Create a baseline, then change items and relationships.",
    "The baseline still shows the earlier content.",
    ["req.baseline-freeze"],
  ),
  test(
    "test.baseline-compare",
    "Baselines compare",
    "Compare two baselines.",
    "Items, relationships (including suspect) and frozen verification differences are listed.",
    ["req.baseline-compare"],
  ),
  test(
    "test.baseline-ver",
    "Baseline freezes verification",
    "Make a baseline after a passing result, then record a failing one.",
    "The baseline keeps passing.",
    ["req.baseline-verification"],
  ),
  test(
    "test.ver-status",
    "Verification status follows results",
    "Record pass, fail and then a new test case version.",
    "Status goes passing, failing, then out of date.",
    ["req.ver-status", "req.ver-out-of-date", "req.ver-append-only"],
  ),
  test(
    "test.ver-pure",
    "Verification rule, pure",
    "Feed results to the status rule.",
    "Status is not covered, not run, passing or failing as defined.",
    ["req.ver-status"],
    "apps/server/src/domain/verification.test.ts",
  ),
  test(
    "test.ver-refuse",
    "Bad results refused",
    "Record a result on a requirement, on a missing version, and as a Reviewer.",
    "Each is refused.",
    ["req.ver-validate"],
  ),
  test(
    "test.junit",
    "JUnit report records results",
    "Post a JUnit report naming test cases by UID.",
    "Results appear on those test cases.",
    ["req.ver-junit"],
  ),
  test("test.flaky", "Flaky test listed", "Record alternating results.", "The test case is on the flaky list.", [
    "req.ver-flaky",
  ]),
  test(
    "test.evidence",
    "Evidence files",
    "Attach a PDF, a log, a CSV and a zip to a result and a step; attach an executable.",
    "Allowed files are stored and downloadable, images show inline, the executable is refused.",
    ["req.evidence"],
  ),
  test(
    "test.review",
    "A review is marked, signed and closed",
    "Open a review, mark items, sign as an approver with the password, close.",
    "The outcome is stored once; approved items get Status Approved with no suspect side effects.",
    ["req.review-marks", "req.review-sign", "req.review-close", "req.review-approve", "req.status-only"],
  ),
  test(
    "test.review-reject",
    "One rejection rejects",
    "An approver rejects one item.",
    "The review is rejected and items are untouched.",
    ["req.review-reject"],
  ),
  test(
    "test.cycle",
    "Cycle, run and result",
    "Start a cycle from a plan, assign a run, execute its steps, finish it.",
    "Versions are frozen; the run's state follows the steps; a result is appended.",
    ["req.plan-cycle", "req.run-steps", "req.run-result", "req.run-assign"],
  ),
  test(
    "test.steps",
    "Steps are kept per version",
    "Save a test case with steps, then change a step.",
    "Both versions hold their own steps.",
    ["req.steps"],
  ),
  test(
    "test.import",
    "Import by identifier, with preview",
    "Import a file twice with external ids; once as a dry run.",
    "The second run updates and does not duplicate; the dry run writes nothing.",
    ["req.import-extid", "req.import-dryrun", "req.import-atomic"],
  ),
  test(
    "test.reqif",
    "ReqIF round trip",
    "Export a baseline as ReqIF and import it into another project.",
    "The content is the same, images included.",
    ["req.reqif"],
  ),
  test(
    "test.word",
    "Word export",
    "Export a set to Word and read it back.",
    "Folders are headings, with items, field tables and images.",
    ["req.word-export"],
  ),
  test(
    "test.bulk",
    "Bulk change all or none",
    "Bulk-edit 500 items including one invalid.",
    "No item changes; with all valid, all change.",
    ["req.bulk"],
  ),
  test(
    "test.backup",
    "Backup restores and refuses bad files",
    "Restore a backup; restore a malformed one.",
    "The first becomes a new project with everything; the second is refused and leaves nothing.",
    ["req.backup"],
  ),
  test(
    "test.token",
    "Access token",
    "Call the API with a token; revoke it; make a token with a token.",
    "Works until revoked; creating tokens with a token is refused.",
    ["req.token"],
  ),
  test(
    "test.openapi",
    "OpenAPI is current",
    "Build the description and compare with docs/openapi.json.",
    "They match.",
    ["req.openapi"],
    "apps/server/src/integrations.test.ts",
  ),
  test(
    "test.webhook",
    "Webhook fires signed and retries",
    "Save an item with a webhook set up; make the receiver fail first.",
    "A signed message arrives and a failure is retried.",
    ["req.webhook"],
  ),
  test("test.private", "Private addresses refused", "Add a webhook for 127.0.0.1.", "It is refused unless allowed.", [
    "req.private-addr",
  ]),
  test(
    "test.code-refs",
    "Code references follow the repo",
    "Send tags, then a changed set.",
    "Added, updated and removed are reported.",
    ["req.code-refs"],
  ),
  test(
    "test.oidc",
    "OIDC sign-in",
    "Sign in through the provider; try bad tokens.",
    "The good one signs in; each bad one is refused.",
    ["req.oidc"],
  ),
  test(
    "test.setup",
    "Setup once",
    "Run setup twice at once, with a short password.",
    "One succeeds; the short password is refused.",
    ["req.setup-once"],
  ),
  test(
    "test.login",
    "Sign-in limits and logout",
    "Fail logins repeatedly; log out; use an expired session.",
    "Rate limit applies; logout and expiry end the session.",
    ["req.login"],
  ),
  test(
    "test.lockout",
    "Lockout",
    "Fail sign-in three times with lockout set to 3.",
    "The account is locked even for the right password; a good sign-in earlier clears the count.",
    ["req.lockout"],
    SEC,
  ),
  test(
    "test.expiry",
    "Password expiry",
    "Sign in with a password past its age.",
    "Sign-in is refused and sessions end.",
    ["req.pw-expiry"],
  ),
  test(
    "test.idle",
    "Idle timeout",
    "Wait past the idle time, then use the session.",
    "It is refused; use before that keeps it alive.",
    ["req.idle"],
  ),
  test(
    "test.headers",
    "Security headers",
    "Request any page, behind HTTPS too.",
    "Headers present; cookie Secure and HSTS behind HTTPS.",
    ["req.headers"],
  ),
  test(
    "test.recovery",
    "Forgot password",
    "Request a link, use it, use an expired one.",
    "The password changes and other sessions end; the expired link fails.",
    ["req.recovery"],
  ),
  test(
    "test.audit-chain",
    "Audit chain verification",
    "Rewrite a row, then delete one, then verify.",
    "The first broken row is reported.",
    ["req.audit-chain", "req.audit-every-write"],
    SEC,
  ),
  test(
    "test.mention",
    "Mention notifies",
    "Comment with a mention.",
    "A notification and email go to the person, who can mark it read.",
    ["req.mention"],
  ),
  test(
    "test.mail-retry",
    "Failed email retried",
    "Send with an unreachable mail server.",
    "The email is kept and tried again.",
    ["req.mail-retry"],
  ),
  test(
    "test.search",
    "Search",
    "Search by UID, name, text and field value, in two projects.",
    "Matches come from the one project.",
    ["req.search"],
  ),
  test(
    "test.matrix",
    "Matrix",
    "Open the traceability matrix of two sets and export it.",
    "Cells show relationships; export matches the screen.",
    ["req.matrix"],
  ),
  test(
    "test.restore-version",
    "Restore an old version",
    "Open an old version of an item and restore it.",
    "A new version is saved with the old content and the old versions stay.",
    ["req.restore-version"],
  ),
  test(
    "test.inspect-api",
    "Web app uses only the public API",
    "Read the web app's network calls and code.",
    "Every call is to /api and documented in OpenAPI.",
    ["req.api-same"],
  ),
];
