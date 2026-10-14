# 0024: Structure from the import file

Date: 2026-10-14
Status: Accepted

## Context

Roadmap A1 slice 1. A company moving from DOORS, Polarion or Jama had to create sets, item types, fields and relationship types by hand before the first import could map anything. With editable types ([ADR 0018](0018-editable-types-and-roles.md)) the tool can add them itself.

## Decisions

### One route that only adds

`POST /api/projects/:projectId/structure` (project admin) takes sets with their fields and a list of relationship type names. It adds what is missing and never renames, retypes, or removes:

- A set, item type, field or relationship type with the same name (ignoring case) is used as it is.
- A field of the same name but another type is kept as it is; the answer carries a note, and values from the file are read as the existing type.
- An existing enum or multi-select field only gains the values the file has and it lacks (through the same `options`/`archivedOptions` rule as editing a field).
- A new set gets the proposed UID prefix, numbered (`LI2`) when taken, removed sets included.
- `dryRun` answers with what would be added, writing nothing. Every created row is audited with the action the editing routes use.

The pure rule is `planStructure` in `packages/importers`; the route only reads the project, calls it and writes the plan.

### Derived in the browser, from the file

`deriveReqifStructure` (ReqIF) and `deriveSheetStructure` (spreadsheet) are pure and run in the browser, like the existing mapping, because the browser already holds the parsed file.

- **ReqIF:** one set and one item type per specification, named after it. Attributes that `guessReqifTargets` takes for name or description are not fields. Others become fields by datatype: string and XHTML as text, integer and real as number, boolean, date, and enumerations as enum (or multi-select) with the datatype's values. Attributes of one name merge; clashing types fall back to text. A `ReqIF.` prefix is dropped from the name. Relation types with at least one relation become relationship types.
- **Spreadsheet:** the type of a column comes from its values (all numbers, yes/no, dates, or at most 12 repeated short values for a pick list, else text). The Name, Description and Folder columns are recognised as today; a UID column is not (a new set has none).

### Two requests, not one

The ReqIF page asks for the dry run to show what will be added, and on Import sends the structure and then the import. They are not one transaction. Structure is only additive, so if the import fails what was added stays and is found again by name on the next try. Folding both into one request would have moved image upload and the 50 MB body limit onto the types route.

## Consequences

- A DOORS, DOORS Next or Polarion export imports into any project, new or existing, with no setup, by an admin. An editor still maps by hand to sets that exist.
- The structure is a first guess: names come from the file. Renaming a set or a field is done afterwards on the Item types page. The review step lists what is added but does not edit it.
- A new project from a template still has the template's sets; the derived ones are added beside them.
- Spreadsheets: the derivation and the route exist and are tested against the Jama sample; the spreadsheet import screens work on one existing set and have not been given a "new set" mode yet.
- Word has no structure of its own to derive.
