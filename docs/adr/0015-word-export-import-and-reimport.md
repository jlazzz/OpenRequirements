# 0015: Word export and import, and imports that update

Date: 2026-10-14
Status: Accepted

## Context

Bundle G of the [roadmap](../ROADMAP.md) (J2, document export and import). ReqIF export and import already existed ([ADR 0011](0011-reqif-import-and-export.md)). What was missing: a Word copy of a spec for a design review, a printout with a cover and page numbers, Word import, and re-importing a file without creating duplicates. The roadmap proposed the `docx`, `mammoth`, `fast-xml-parser` and `fflate` libraries.

## Decisions

### Word is written and read by hand, with no library

`packages/importers/src/docx.ts` writes and reads `.docx` with the XML and zip code `packages/reqif` already has. A `.docx` is a zip of a few XML parts. The writer needs styles, numbering, a header, a footer and the document: about 400 lines. The reader needs paragraphs, runs, lists, tables and pictures, and drops everything else. `docx` and `mammoth` would add two dependencies and a converter to HTML, and the HTML would then need converting to the editor's JSON.

- **Export** (`GET /api/sets/:setId/docx`, `GET /api/baselines/:baselineId/docx`, Viewer role): a cover page, folders as Word headings (Heading 1 under a set; with several sets, each set is Heading 1), each item as an "Item Title" paragraph with UID and name, its description, and an "Item Fields" table of the fields that have a value. A running header names the project and set or baseline; the footer numbers the pages. PNG, JPEG and GIF images are embedded at their size, shrunk to the page width; WebP, which Word does not show everywhere, becomes its alternative text. A table keeps column spans and loses row spans.
- **Import** (in the browser, like ReqIF): Word headings (by style name or outline level, so translated style names work) become folders. "Each paragraph or table is an item", or "Each heading with text below is an item". A list belongs to the item before it. Bold, italic, underline, strike, links, lists, tables (with merged cells) and pictures are kept; tracked deletions are left out and insertions kept. The review step lists every folder and item: leave one out, or add an item to the one above.
- **The export reads back.** The importer recognises the "Item Title" style, takes a leading UID of an existing item to mean "update that item", and skips "Item Fields" tables and the cover. A Word file exported, edited and imported again updates its items.
- Options the roadmap listed (choose fields, UID after the name, no cover) are left out until someone asks.

### Print to PDF from the browser, with a cover and page numbers

Reading view prints a cover page, a running header and "Page n of m" through CSS `@page` margin boxes. Headings and item titles are kept with what follows. A server-side PDF would need a headless browser in the image.

### An import updates the items it names

`POST /api/projects/:projectId/import` is now the one import route; the spreadsheet route `POST /api/sets/:setId/import` is removed. Each folder or item in the request may name an existing node of its set:

- `id` or `uid`: that node must exist in the set, or the import is refused.
- `externalId`: the identifier in the source file. A live node of the set that was imported with it, or whose own id it is, is matched; otherwise the new node stores it in the new column `nodes.external_id`. A ReqIF file this tool exported carries node ids, so it comes back to its own items.

A matched folder is reused. A matched item gets a new version, change reason "Imported", only when its name, description or a field differs. A description or a field the request leaves out stays as it is: an empty spreadsheet cell does not clear a value. A matched item stays where it is; the import does not move it. A relationship that already exists between two items is skipped. The importing person's own unsaved draft of an item that would change refuses the import, as bulk edit does.

`dryRun: true` answers what would happen, item by item (added, changed, unchanged), without writing. Both import screens show it before the Import button is enabled.

### Spreadsheets: Folder and UID columns

A "Folder" column holds a path such as `Power / Supply`; folders that already exist at that place are reused. A "UID" column updates the item. The List view CSV export now has both columns, so an exported sheet, edited, imports back as updates. A spreadsheet holds descriptions as plain text: a description that reads the same as the item's keeps its formatting. The 2,000 row cap becomes the import route's 5,000 folders and items.

## Consequences

- One schema change: `nodes.external_id`, a nullable column; no data is converted.
- The exported `.docx` was read back by the importer in tests and opened by the macOS text system. It was not opened in Microsoft Word or LibreOffice.
- Word import was tested with Word XML written for the test and with a file from macOS `textutil`, which writes headings as big bold text and so imports them as items. Real Word files from a design partner are still needed.
- Clearing a field from a spreadsheet is not possible; the cell is read as "leave as it is".
- A folder name that contains "/" cannot be given in the Folder column.
- Moving items by re-import is not possible; use List view's Move.
