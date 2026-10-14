# This tool's own requirements

The requirements of this product are kept in the product. `npm run dogfood` loads them into an instance through the public API: 14 user needs, 78 system requirements ("The system shall…") and 57 test cases, with Derived from and Verified by relationships.

```bash
DOGFOOD_URL=http://localhost:3000 DOGFOOD_EMAIL=you@example.com DOGFOOD_PASSWORD=... npm run dogfood
```

- Needs an instance administrator. It creates the project "Open Requirements (own requirements)" from the Standard template on the first run (`DOGFOOD_PROJECT` renames it).
- Run it again at any time. Items are matched by external id, so a second run updates changed wording and adds new items, and never duplicates. Relationships already there are left alone.
- The content is in `scripts/dogfood/requirements.ts`. Edit it there, not in the tool: the next run overwrites a change made in the tool.
- Test cases are numbered VER-001 and up in file order. A test file carries its test case as a `// @req VER-nnn` tag; run the `@req` scanner (`packages/cli`) to link them to the repository.
- Results come in as for any project: a JUnit report from CI, or runs in a cycle.
