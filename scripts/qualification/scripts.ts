// The installation and operational qualification (IQ/OQ) scripts, loaded by `npm run qualification`. A customer runs
// them by hand after installing or upgrading. Each script is a test case; each step says what to do and what must be
// seen. `id` is the external id the import route matches on, so a second run updates and never duplicates.
// Wording is for a person who has not read the rest of the guide: name the button, say what appears.

export type Step = { action: string; expected: string };
export type Script = {
  id: string;
  /** IQ = installation qualification, OQ = operational qualification. */
  group: "IQ" | "OQ";
  name: string;
  purpose: string;
  steps: Step[];
};

const SCRATCH = "Qualification scratch";

export const scripts: Script[] = [
  {
    id: "QUAL-IQ-01",
    group: "IQ",
    name: "IQ-01 The installation is running",
    purpose: "The server answers and reports its version. IQ-02 then proves the database works.",
    steps: [
      {
        action: "Open the address of your installation in a browser.",
        expected: "The sign-in page appears. The page has no error message.",
      },
      {
        action: "If you turned on HTTPS: look at the address bar.",
        expected: "The address starts with https:// and the browser shows no certificate warning.",
      },
      {
        action: "Open <address>/api/version in a new tab.",
        expected: 'A short text appears, {"version":"x.y.z"}. Write the version number on the record.',
      },
    ],
  },
  {
    id: "QUAL-IQ-02",
    group: "IQ",
    name: "IQ-02 Signing in and out",
    purpose: "A person can sign in with the right password only, and sign out.",
    steps: [
      {
        action: "On the sign-in page, enter your email and a wrong password. Choose Sign in.",
        expected: "The message Wrong email or password appears. You are not signed in.",
      },
      {
        action: "Enter your email and the right password. Choose Sign in.",
        expected: "The Projects page opens with your name shown at the top right.",
      },
      {
        action: "Click your name. Read the version shown in the dialog. Close the dialog.",
        expected: "The version is the same as the one written down in IQ-01.",
      },
      {
        action: "Choose Sign out.",
        expected: "The sign-in page appears. Browser Back does not show any project.",
      },
    ],
  },
  {
    id: "QUAL-IQ-03",
    group: "IQ",
    name: "IQ-03 Creating a project",
    purpose: "An administrator can create a project from a template with its sets and relationship types.",
    steps: [
      {
        action: "Sign in as an administrator. On the Projects page choose New project.",
        expected: "A dialog asks for a project name and a template.",
      },
      {
        action: `Type the name "${SCRATCH}", pick the template Standard, choose Create project.`,
        expected: `The project "${SCRATCH}" opens. The side bar on the left lists the sets User Needs, System Requirements and Verification Tests.`,
      },
      {
        action: "Open Projects again.",
        expected: `"${SCRATCH}" is in the list.`,
      },
    ],
  },
  {
    id: "QUAL-OQ-01",
    group: "OQ",
    name: "OQ-01 Versions of an item",
    purpose: "A saved item keeps every earlier version; none is overwritten.",
    steps: [
      {
        action: `In "${SCRATCH}", open the set System Requirements. Choose to add an item. Name it "Qualification item" and choose Save version.`,
        expected: "The item gets an ID that starts with the set's prefix and ends in 001. The history shows Version 1.",
      },
      {
        action:
          'Change the name to "Qualification item, second wording". In Reason for change type "Qualification". Choose Save version.',
        expected: "The item shows Version 2. The history lists Version 2 and Version 1, with who saved them and when.",
      },
      {
        action: "In the history, choose Version 1.",
        expected: 'A window shows Version 1 with the name "Qualification item". The current item is not changed.',
      },
      {
        action: "In that window choose Compare with, then Version 2.",
        expected: "The changed name is shown with the old words struck out and the new words marked.",
      },
      {
        action: "Choose Restore this version on Version 1.",
        expected:
          'The item shows Version 3 with the name "Qualification item". Versions 1 and 2 are still in the history.',
      },
    ],
  },
  {
    id: "QUAL-OQ-02",
    group: "OQ",
    name: "OQ-02 Deleting and restoring an item",
    purpose: "A deleted item is not removed; it keeps its history and ID and can be restored.",
    steps: [
      {
        action: `In "${SCRATCH}", add a second System Requirements item named "Item to delete" and save it. Write down its ID.`,
        expected: "The item shows Version 1.",
      },
      {
        action: "Delete the item.",
        expected: "The item is gone from the set.",
      },
      {
        action: "Open Deleted items in the project.",
        expected: "The item is listed with its ID.",
      },
      {
        action: "Choose Restore on that row.",
        expected: "The item is back in the set with the same ID and its history.",
      },
    ],
  },
  {
    id: "QUAL-OQ-03",
    group: "OQ",
    name: "OQ-03 Relationships and suspect relationships",
    purpose: "When an item changes, relationships to it are flagged for review.",
    steps: [
      {
        action: `In "${SCRATCH}", add a User Needs item named "Qualification need" and save it.`,
        expected: "The item shows Version 1.",
      },
      {
        action:
          'Open "Qualification item". In the Relationships panel add the relationship Derived from, pointing to "Qualification need".',
        expected: "The relationship is listed. It carries no suspect marker.",
      },
      {
        action: 'Open "Qualification need", change its name to "Qualification need, changed" and save a new version.',
        expected: "Version 2 is saved.",
      },
      {
        action: 'Open "Qualification item" again.',
        expected: "Its Derived from relationship now carries the suspect marker.",
      },
      {
        action: "Choose Confirm on the relationship.",
        expected: "The suspect marker is gone.",
      },
    ],
  },
  {
    id: "QUAL-OQ-04",
    group: "OQ",
    name: "OQ-04 A baseline does not change",
    purpose: "A baseline keeps the items as they were, whatever happens to them later.",
    steps: [
      {
        action: `In "${SCRATCH}", open Baselines. Under New baseline type "Qualification baseline", leave Covers on the whole project, choose Create.`,
        expected: "The baseline is listed with the number of items it holds.",
      },
      {
        action: 'Open "Qualification item" and change its name to "Changed after the baseline". Save a version.',
        expected: "The item shows a new version.",
      },
      {
        action: "Open the baseline and the same item in it.",
        expected: 'The item reads "Qualification item", not "Changed after the baseline".',
      },
      {
        action: "On the baseline page compare against the current items.",
        expected: "The item is listed as changed since the baseline.",
      },
    ],
  },
  {
    id: "QUAL-OQ-05",
    group: "OQ",
    name: "OQ-05 Review and electronic signature",
    purpose: "A review is held on a baseline, an approver signs with a password, and closing is permanent.",
    steps: [
      {
        action:
          'Open Reviews. Fill in New review: name "Qualification review", the baseline "Qualification baseline", yourself as approver. Choose Start review.',
        expected: "The review opens in the state Open and lists you as approver.",
      },
      {
        action: "Choose Approve on each item, then Sign and submit. Enter a wrong password first.",
        expected:
          "The wrong password is refused and nothing is signed. After the right password, the signature is recorded with your name, the time and the meaning Approval. Your decisions can no longer be changed.",
      },
      {
        action: "Choose Close review.",
        expected: "The state is Approved. The review shows no Close review button any more.",
      },
    ],
  },
  {
    id: "QUAL-OQ-06",
    group: "OQ",
    name: "OQ-06 Running a test and its result",
    purpose: "A finished test run records a result and sets the verification status of the requirement.",
    steps: [
      {
        action: `In "${SCRATCH}", add an item to Verification Tests named "Qualification test" with one step, action "Press the button", expected "The lamp lights". Save a version.`,
        expected: "The test case shows Version 1 with one step.",
      },
      {
        action: 'On "Qualification item", add the relationship Verified by pointing to "Qualification test".',
        expected: "The item's verification status reads Not run.",
      },
      {
        action: "Open Test plans, create a plan, add the test case, start a cycle, and open the run.",
        expected: "The run lists the step and its state is Not started.",
      },
      {
        action: "Choose Pass on the step, then Finish run.",
        expected: "The run state is Passed.",
      },
      {
        action: 'Open "Qualification item".',
        expected: "The verification status reads Passing.",
      },
    ],
  },
  {
    id: "QUAL-OQ-07",
    group: "OQ",
    name: "OQ-07 Backup and restore of a project",
    purpose: "A project backup file restores as a new project with the same content.",
    steps: [
      {
        action: `Open the home page of "${SCRATCH}" as an administrator. Choose Download backup.`,
        expected: "A file is saved on your computer.",
      },
      {
        action: "Open Projects. Choose Restore from backup and pick the file.",
        expected: "A new project opens. Its name is the project's name followed by (restored).",
      },
      {
        action: "In the new project open System Requirements.",
        expected: "The same items are there with the same IDs, and their history lists the same versions.",
      },
      {
        action: "Open Baselines in the new project.",
        expected: '"Qualification baseline" is listed.',
      },
    ],
  },
  {
    id: "QUAL-OQ-08",
    group: "OQ",
    name: "OQ-08 The audit log is intact",
    purpose: "Every change is chained to the one before it; a changed or removed entry is detected.",
    steps: [
      {
        action: "Sign in as an administrator. Open Users.",
        expected: "The section Audit log integrity is on the page.",
      },
      {
        action: "Choose Verify audit log.",
        expected: "The page reports Intact with the number of events checked. Write the number on the record.",
      },
      {
        action: "Open the activity stream of the scratch project.",
        expected: "The changes made in this script are listed, each with a person and a time.",
      },
    ],
  },
  {
    id: "QUAL-OQ-09",
    group: "OQ",
    name: "OQ-09 After an upgrade",
    purpose:
      "Run after an upgrade: earlier data is present and still checks out. Needs a record of IQ-01, OQ-08 from before.",
    steps: [
      {
        action: "Open <address>/api/version. Compare with the version before the upgrade.",
        expected: "The version is the new one.",
      },
      {
        action: "Sign in and open Projects.",
        expected: "Every project that was there before is listed.",
      },
      {
        action: 'Open the baseline "Qualification baseline" of the scratch project.',
        expected: 'The items read as they did before the upgrade, "Qualification item" with its original name.',
      },
      {
        action: "Open Users and choose Verify audit log.",
        expected:
          "The page reports Intact. The number of events checked is at least the number written down before the upgrade.",
      },
      {
        action: "Repeat IQ-01 and IQ-02.",
        expected: "Both pass.",
      },
    ],
  },
];
