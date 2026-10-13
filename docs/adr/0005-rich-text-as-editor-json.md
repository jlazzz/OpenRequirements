# 0005: Rich text is stored as editor JSON

Date: 2026-10-12
Status: Accepted

## Context

Item descriptions need formatting now (bold, lists, headings, links) and tables, images and equations in M4. The editor is TipTap, which is built on ProseMirror. The text can be stored as HTML or as the editor's JSON document.

## Decision

Store rich text as the editor's JSON document in a `jsonb` column. `packages/shared/src/richtext.ts` owns the format: the allowed node and mark types, validation, and conversion to plain text.

## Why

- **Safer by construction.** JSON is rendered through the editor's schema, so it cannot carry scripts. The server still checks every document against an allowlist and accepts only `http`, `https` and `mailto` links.
- **No HTML sanitizer to maintain.** Stored HTML would need one on every write.
- **Easy to process.** Plain text for diffs, search and CSV export is a short walk over the tree.

## Consequences

- A new editor feature needs its node or mark type added to the allowlist in `richtext.ts`, or the server refuses the save.
- Version diffs compare plain text. A change of formatting alone is reported as "formatting changed".
- Exports that need HTML (ReqIF uses XHTML; Word and PDF later) must convert from JSON. TipTap provides that conversion.
- Migration 0003 converted existing plain-text descriptions in place, one paragraph per line. This is a change of representation, not of content, so it does not break the rule that revisions are never edited.
