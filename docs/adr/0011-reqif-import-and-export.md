# 0011: ReqIF import and export

Date: 2026-10-13
Status: Accepted

## Context

The outline promises lossless exchange through ReqIF and names vendor differences as a risk. The owner asked for export of a set or baseline, import with a mapping step, and a round-trip test. No sample file from DOORS or Polarion was available when this was built.

The tool cannot yet create sets, item types or fields after a project is made, and items cannot be nested under items.

## Decisions

### A standalone package with no dependency

`packages/reqif` reads and writes ReqIF 1.2 and `.reqifz` archives. It imports nothing from the rest of the repository and nothing from npm, and runs in Node and in a browser.

- **XML** is read by a small parser written for this, as with JUnit ([ADR 0009](0009-verification-tracking.md)). A document type declaration is refused, so a file cannot declare entities. Namespace prefixes are dropped on reading: `xhtml:p`, `reqif-xhtml:p` and `p` are the same element.
- **Zip** uses the platform's `CompressionStream`. Unpacking stops at 300 MB. Encrypted and zip64 archives are refused.
- The model folds each datatype into its attribute definition. Left out: default values, relation groups, access rights, and attribute values on relations.

### The mapping is pure code in `packages/importers`

`reqif.ts` there turns sets into a ReqIF model and a ReqIF model into folders, items and relationships. Rich text becomes XHTML and back.

- One specification per set. One object type per item type, with `ReqIF.ForeignID` (the UID), `ReqIF.Name`, `ReqIF.Text` and one attribute per field. A folder is an object of a "Folder" type with `ReqIF.ChapterName`.
- A relationship is written from the downstream item (source) to the upstream item (target), as DOORS links run. On import the direction can be reversed per relation type.
- Images are `<object>` elements pointing into `files/` in the archive. An equation is its LaTeX in an element with class `math`. Underline and strike are styled spans, because ReqIF's XHTML has no `<u>` or `<s>`.
- On import, unknown XHTML keeps its text and loses its formatting. White space collapses as in a browser.

### Import maps into what the project already has

A specification goes into an existing set, an attribute becomes the name, the description, an existing field, or is skipped. Nothing creates sets, item types or fields.

- **An object with objects below it becomes a folder.** If it also has body text, that text becomes the first item in the folder. A heading's other attribute values are dropped when it has no body text.
- **A value that fits no option of its field is left empty** and listed in the review step. Blocking would make most foreign files unimportable, since field options cannot be edited yet.
- An item with no mapped name is named by the first line of its text.
- Import only adds items. They get new UIDs; the source ID can be mapped to a text field.

### The browser reads the file; the server gets JSON

The web app parses the file, shows the mapping and the review, uploads the images it needs through the existing attachments route, then calls `POST /api/projects/:projectId/import`. The server never opens an uploaded archive.

That route takes trees of folders and items for one or more sets and relationships between the new items, by reference. It validates everything before writing anything, writes all or nothing, and records one audit event per set and one for the relationships. It is not specific to ReqIF: Word import will use it.

The cost: a script cannot post a `.reqif` file to the API. It has to use the two packages and post the JSON.

### Export is two read routes

`GET /api/sets/:setId/reqif` and `GET /api/baselines/:baselineId/reqif`, with `?format=reqifz` for the archive with images. Viewer role. Only images stored in the same project are packed.

## Consequences

- No schema change and no new dependency.
- The round trip is tested end to end: a baseline is exported, imported into a second project through the guessed mapping, exported again, and the two files are compared without their ids.
- A sample export validates against the OMG ReqIF schema for structure. The XHTML inside was not validated against the XHTML modules.
- Not tested: real files from DOORS, DOORS Next or Polarion, and whether those tools accept our files. Their quirks will need fixes once samples arrive.
- A re-import creates duplicates. Updating existing items from a file needs the foreign id stored per item, which is a schema change for later.
- Images uploaded for an import that then fails stay stored and unused.
- Text with two spaces in a row comes back with one.
