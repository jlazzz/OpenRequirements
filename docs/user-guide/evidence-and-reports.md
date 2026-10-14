# Evidence and reports

Attach files to test results, see what a baseline had verified, and report on testing.

## Attach evidence while running a test

On a test run's page:

- **Attach** under a step adds files to that step.
- **Attach files** adds files to the whole test.
- Drop a file on a step to attach it there.
- Paste a screenshot (Ctrl+V or ⌘V): it goes to the highlighted step.

Allowed: images, PDF, text and log files, CSV and zip, up to 25 MB each. Your administrator can change the limit with `MAX_ATTACHMENT_MB`. Evidence cannot be removed afterwards, and a finished run takes no more files.

When the run is finished, its files become the evidence of the result it records. They show under **Results** on the test case.

## Attach evidence to a result recorded by hand

On a test case, choose **Record result**, then pick one or more files under **Evidence**.

## Attach a CI log to a JUnit report

Upload the log first, then name it when you send the report:

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/octet-stream" --data-binary @build.log "https://requirements.example.com/api/projects/$PROJECT/attachments?name=build.log"
```

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/xml" --data-binary @report.xml "https://requirements.example.com/api/projects/$PROJECT/verification-results/junit?attachmentId=$ID"
```

`$ID` is the `id` the first call returned. Every result in the report carries the log.

## Verification in a baseline

A baseline keeps the verification status each requirement had when it was made. On the baseline's page, **Verification then** shows it, and **Now** shows the status today where it differs. **Only differences** includes those items.

When you start a cycle, pick the baseline it verifies under **Verifies baseline**. A review of that baseline then lists the cycle at the top, under **Test evidence for this baseline**.

## Reports

| Report | Where |
|---|---|
| Cycle summary: runs by state, by group and by person | The cycle's page, under **Summary** |
| Cycles side by side, to compare them | The plan's page, under **History**. **Only what changed in the last cycle** compares the last two. |
| Each requirement, its tests, the latest result of each with evidence | **Reports** in the explorer |
| Flaky tests: last five results changed outcome more than once | **Reports** in the explorer |

Every report has **Export CSV**.
