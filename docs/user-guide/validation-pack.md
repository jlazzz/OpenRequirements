# Validation pack

A zip made for one numbered release. It is evidence of what the release was built from and how it was verified. It is not a statement that the tool is compliant: that belongs to your own process.

## What is inside

| File | What it is |
|---|---|
| `manifest.json` | Version, tag, commit, time, image name and digest, SBOM file name and SHA-256, Node version, the baseline, and counts of requirements by verification status |
| `specification-vX.Y.Z.docx` | The requirements as Word, from the baseline named after the release |
| `specification-vX.Y.Z.reqifz` | The same baseline as ReqIF |
| `items-vX.Y.Z.csv` | One row per item with its frozen verification status and suspect relationships |
| `traceability.csv` | Every relationship frozen in the baseline: upstream, type, downstream, suspect or not |
| `verification.csv` | Per requirement and test case: status in the baseline, latest result of the test, who recorded it, and the CI pipeline, commit and build the result came from |
| `sbom.cdx.json` | The release's SBOM (CycloneDX), when it was given |

## How to read it

1. Open `manifest.json`. Check that `imageDigest` is the digest you run (`docker buildx imagetools inspect <image>:<version>`) and that the SBOM's SHA-256 matches `sha256sum sbom.cdx.json`.
2. Open `verification.csv`. A requirement is covered when its status is **Passing** and **Out of date** is empty. **Not covered** means no test is linked; **Not run** means a test has no result.
3. For any row, the CI columns lead to the build that produced the result. A row with no CI columns was recorded by hand in a test run.
4. Use `traceability.csv` to follow a need down to requirements and tests.

The verification status in `items-vX.Y.Z.csv` and `Status in baseline` is frozen when the baseline was made. The test result columns are the latest results at the time the pack was built, so make the baseline after the release's CI results are uploaded.

## Building one

```bash
REQ_URL=https://req.example.com REQ_TOKEN=orq_… VERSION=1.2.0 \
  IMAGE_DIGEST=sha256:… SBOM=sbom.cdx.json npm run validation-pack
```

- The token's user needs the Editor role in the project: the baseline `vX.Y.Z` is made if it does not exist yet. An existing one is reused, never changed.
- The project is `REQ_PROJECT` (id) or `REQ_PROJECT_NAME` (default: this tool's own requirements).
- `REQ_STRICT=1` makes the script exit 1 when any requirement is not passing.
- Without `IMAGE` and `IMAGE_DIGEST` the manifest holds placeholders to fill in by hand.

The release workflow does this in its own job, `validation-pack`, after the image is published, and attaches the zip to the GitHub release. It is skipped unless the secrets `REQ_URL` and `REQ_TOKEN` exist. The workflow has never run.

## Not in the pack

The pack has no browser versions and no list of known gaps. Postgres and operating system versions are not recorded either: `manifest.json` has the Node version of the machine that built the pack. Reports on test plans and cycles are in the tool ([evidence and reports](evidence-and-reports.md)).
