# Test plans, cycles and runs

Plan which tests to run, run them step by step, and let the results set the status of your requirements.

| Term | Meaning |
|---|---|
| Test plan | A selection of test cases for a goal, for example a release |
| Test cycle | One pass through a plan |
| Test run | One test case executed once in a cycle |

## Write steps on a test case

1. Open a test case.
2. Under **Steps**, choose **Add step**. Write the action and the expected result. Each is a rich-text box like the description: formatting, lists, tables, images (paste, drop or **Image / file**), files and equations. A file that is not an image (PDF, text, log, CSV, zip) shows as a download link, for a setup file or a drawing.
3. Use ↑, ↓ and ✕ to reorder or remove steps.
4. Choose **Save version**.

A test case without steps can still be run. It counts as one step.

Steps written before rich text keep their plain text and show as one paragraph per line. In the version compare, a spreadsheet export, Word and ReqIF, steps appear as numbered lines of text; an image or file appears as its name.

## Make a test plan

1. In the project, open **Test plans**. Type a name and choose **Create**.
2. Under **Add test cases from**, pick one of:
   - a whole set of test cases
   - a folder
   - every test that verifies the items of a requirements set
3. Optional: type a name under **Into group** to keep these cases together.
4. Choose **Add**.

To regroup or remove cases later, tick them in the list.

## Start a cycle

1. On the plan page, type a name under **New cycle**, for example "Round 1".
2. Optional: describe the environment, for example "Bench 2, firmware 1.4".
3. Under **Run**, choose all cases, one group, or only what failed or was blocked in the last cycle.
4. Choose **Start cycle**.

The cycle makes one run per test case. Each run keeps the version the test case had at that moment.

## Assign runs

1. On the cycle page, tick the runs.
2. Pick a person under **Assign the selected to** and choose **Assign**.

Your open runs are listed under **My test runs** on the home page.

## Execute a run

1. Open the run from the cycle page or from **My test runs**.
2. For each step, write what actually happened if needed (a rich-text box: paste a screenshot, or add a file with **Image / file**), then choose **Pass**, **Fail** or **Blocked**.
3. **Pass all remaining** marks every step that has no result.
4. Choose **Finish run**. For a failed run, paste the link to the defect in your issue tracker.
5. **Next run** opens the next run in the cycle.

Keyboard: ↑ and ↓ choose a step. P, F and B record Pass, Fail and Blocked.

A step can be recorded again; the latest result counts. A finished run cannot be changed.

| Run state | When |
|---|---|
| Failed | Any step failed |
| Blocked | No step failed, and one is blocked |
| Passed | Every step passed |
| In progress | Some steps have a result |
| Not started | No step has a result |

## What a finished run does

It records a result on the test case, for the version the cycle kept. The requirements linked with **Verified by** then show the new [verification status](verification.md).

If the test case was changed after the cycle started, the result is out of date at once. Start a new cycle to run the new version.

## Close a cycle

On the cycle page, choose **Close cycle**. This is permanent. Runs that were not finished record nothing.

## Who can do what

| Role | Can |
|---|---|
| Viewer | See plans, cycles and runs |
| Reviewer | Execute the runs assigned to them |
| Editor | Make plans, start and close cycles, assign runs, execute any run |

## Results from CI into a cycle

Add `?testCycleId=CYCLE-ID` to the JUnit address in the [verification guide](verification.md). A reported test with an open run in that cycle finishes that run. The cycle id is in the address bar when the cycle is open.
