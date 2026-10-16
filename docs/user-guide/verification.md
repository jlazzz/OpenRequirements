# Verification: test results and status per requirement

The tool stores the results of your tests and shows which requirements are verified. To plan test runs and walk through test steps, see [Test plans, cycles and runs](test-plans.md).

## Set up

1. Write each test as an item in a set of test cases. The Standard template has **Verification Tests**.
2. Open a requirement. Under **Relationships**, add the test case as a **downstream** item with the type **Verified by**.

## Record a result by hand

1. Open the test case.
2. Under **Results**, choose **Record result**.
3. Pick Pass, Fail or Blocked. Change the date or the version only if the test was run earlier.
4. Optional: add a note and an image as evidence.

A result cannot be changed afterwards. To correct one, record another: the latest result counts.

## What the status means

| Status | Meaning |
|---|---|
| Not covered | No test case is linked with "Verified by" |
| Not run | At least one linked test has no current pass, and none has failed |
| Passing | Every linked test has a current pass |
| Failing | At least one linked test has a current fail |

A blocked test counts as not run.

**Out of date** means a result no longer counts, because:

- the test case was changed after it was run, or
- the requirement was changed after the result was recorded.

Run the test again and record the new result.

## Where the status shows

- **List view:** the Verification column, and the "Any verification" filter. In a set of test cases the column is "Last result".
- **Traceability matrix:** next to each item.
- **Trace view:** next to each item, with totals above the table.
- **Item page:** at the top of the side panel, with each test and its last result.

## Import results from CI

1. Select your name at the top right. Under **Access tokens**, create a token and copy it. It is shown once.
2. Store it as a secret in your CI system.
3. Put the UID of the test case in the name of each automated test, for example `test_VER_012_pump_stops` or `VER-012 pump stops`.
4. After the tests, send the JUnit XML report:

```bash
curl -X POST "https://YOUR-SERVER/api/projects/PROJECT-ID/verification-results/junit" \
  -H "Authorization: Bearer $REQUIREMENTS_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @junit.xml
```

The project id is in the address bar when the project is open. The token's user needs the Editor role in the project.

- A failed or errored test records Fail. A skipped test records nothing.
- Several tests with the same UID record one result. A failure wins.
- The answer lists the results recorded and the test names that matched no test case.

## Count only the main branch

By default every uploaded result counts, whatever branch it came from. A failing feature branch then turns a requirement red.

To prevent that, a project admin types the main branch (for example `main`) in **Main branch** on the CI runs page and clicks Save. From then on only results from CI runs on that branch count toward a requirement's status. Results from other branches are still recorded and shown on the test case and on the run, marked "not counted". A result entered by hand or in a test run has no branch and always counts. Names must match exactly; a run uploaded with no branch does not count.

Clear the box to go back to counting every branch. A baseline made earlier keeps the status it froze.

The CI runs page also shows a **pass rate** bar chart for each pipeline: the latest 20 runs, oldest on the left. Each bar is passed over passed plus failed; faded bars are runs that do not count.

## Send results from GitHub Actions

This repository's `ci.yml` already uploads its own test results and `@req` tags (`scripts/ci/upload-results.ts`). It stays off until you add two repository secrets:

1. Load the project with `npm run dogfood` on your instance, if you have not.
2. As a user with the **Editor** role in that project (a Viewer or Reviewer cannot import), create an access token as above.
3. In GitHub, **Settings → Secrets and variables → Actions**, add `REQ_URL` (the instance's address, for example `https://req.example.com`) and `REQ_TOKEN` (the token).

The instance must be reachable from the internet. GitHub-hosted runners cannot reach `localhost` or a private network address; use a public address, a tunnel, or a self-hosted runner.

Details:

- The step runs after the tests, also when they fail, so failures are recorded. It exits non-zero only when the upload or sign-in fails, never because a test failed.
- It is skipped on pull requests from forks, which GitHub gives no secrets.
- The project is found by name, "Open Requirements (own requirements)". For another name set `REQ_PROJECT_NAME`, or `REQ_PROJECT` to a project id, in the step's `env`.
- Vitest tests name their test case in a `// @req VER-nnn` comment; the script puts that UID in front of the test's name in the report so the import can match it. A test name containing a quotation mark is not matched.

## See one CI upload

Every upload is kept as a **CI run**. Open **CI runs** in the project's side bar for the list, newest first, with a bar of passed, failed, skipped and unmatched tests. Filter by pipeline or branch. Open a run to see each test case it recorded, its outcome, the requirements it verifies, and the reported tests that matched no test case (the first 200 names are kept). On a test case, a result from CI links to its run.

To label the run, add optional query parameters to the address: `pipeline`, `branch`, `commit` and `buildUrl`, for example `?pipeline=build&branch=main&commit=$GIT_COMMIT&buildUrl=$BUILD_URL`. The answer carries `ciRunId`. A CI run cannot be edited or removed.
