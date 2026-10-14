# Releasing

One person, one tag. The version has a single source: `version` in the root `package.json`. The server reads it for `/api/version`; the image tag and the Git tag are checked against it.

1. Choose the number by [Semantic Versioning](https://semver.org/): a migration or a removed API is a minor version at least; a breaking API or import-format change is major once 1.0.0 is out.
2. In `CHANGELOG.md` rename `Unreleased` to `## [X.Y.Z] - YYYY-MM-DD` and add a new empty `Unreleased` above it.
3. Set `version` to `X.Y.Z` in `package.json`, and in the two places of `package-lock.json` (`npm install --package-lock-only` does it).
4. Run `npm run lint && npm run typecheck && npm test`, then `node scripts/release/notes.ts vX.Y.Z` to check the notes.
5. Merge to `development`, then tag the merge commit and push the tag:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
   ```

The `Release` workflow then runs the checks again, publishes `ghcr.io/<owner>/<repo>:X.Y.Z`, attaches an SBOM, signs the image with cosign (keyless, through GitHub's OIDC identity) and creates a GitHub release with the changelog section as its notes.

## Verify a published image

```bash
cosign verify ghcr.io/<owner>/<repo>:X.Y.Z \
  --certificate-identity-regexp 'https://github.com/<owner>/<repo>/\.github/workflows/release\.yml@refs/tags/v.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The SBOM (CycloneDX) is an attestation on the same image (`cosign verify-attestation --type cyclonedx`) and a file on the GitHub release.
