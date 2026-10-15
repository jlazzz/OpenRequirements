# Moving from another tool

This page is the common part. Then read the page for your tool: [DOORS Classic](import-from-doors-classic.md), [DOORS Next](import-from-doors-next.md), [Polarion](import-from-polarion.md), [Jama Connect](import-from-jama.md).

::: warning The sample files are synthetic
The steps below were followed with the files in `samples/import`. They were written by a script to the shape each tool is known to export. They were not exported from the tools. A real file may carry things the samples do not. Try your own export in a scratch project first, and tell us what breaks.
:::

## The plan that works

1. Make a scratch project. Import one module into it as described below. Look at the result.
2. Fix what you did not like (names, fields, which attribute is the text) in the scratch project, or in the import mapping.
3. Import every module into the real project.
4. [Check the counts](#check-the-counts).
5. Make a first baseline, named for where it came from, such as "Migrated from DOORS 2026-10-15".
6. Keep the old tool read-only as the archive.

## What each route reads

| Source | File | Import page | Can set up sets and fields |
|---|---|---|---|
| DOORS Classic, DOORS Next, Polarion | ReqIF (`.reqif`, `.reqifz`) | **Import ReqIF** in the project menu | Yes, for a project admin |
| Jama Connect | Excel or CSV | **Import**, then **Spreadsheet**, on a set or folder | No: the set and its fields must exist |
| A specification in Word | `.docx` | **Import**, then **Word document**, on a set or folder | No: items only |

How the ReqIF page works is in [ReqIF export and import](reqif.md). Spreadsheets and Word are in [Word, spreadsheets and printing](word-and-spreadsheets.md).

## What moves

- Each ReqIF specification (module, document) becomes a set. Headings become folders; other objects become items with new IDs such as `LIR-004`.
- The text, the heading, enumerations (as pick lists), dates, numbers and the other attributes you map to fields.
- Relationships between the imported objects.
- Pictures, when the file holds them as PNG, JPEG, GIF or WebP (a `.reqifz` archive).
- The source tool's own ID, kept as a field (see the tool's page) and used to match items on a second import.

## What does not move

- **History.** Every item arrives as version 1. Earlier versions, who changed what, and when, stay in the old tool.
- **Baselines, reviews, signatures, approvals.** Recreate the baseline you need now. Signed records are not something to copy: keep the old tool or an export of it for them.
- **Comments and discussions.**
- **Users, groups, permissions.** Invite people to the project and give each a role.
- **Test results and test plans.** Verification starts empty; load CI results or run the tests again.
- **Attachments** that are not images.
- **Views, filters, dashboards, reports and templates.**
- **Relationships to items outside the file.** A relationship whose other end is not in the imported modules is left out, and the review box says how many.

Migrated history is hard to defend to an auditor in any tool. The usual answer is the first baseline plus a read-only archive of the old system.

## Check the counts

Do this after every module.

1. Count in the source: the objects in the module (headings included), and its links.
2. In the review box of the ReqIF page, before pressing **Import**, read how many items, folders and relationships the file holds. It should match step 1. A ReqIF object with a heading and no text is a folder.
3. After **Import**, the page reports how many items, folders and relationships were created. **Items plus folders** is the object count of the source.
4. Open the project home page. It lists the items of each set. Open the set in List view and look at the first and last items.
5. Open **Trace** and **Matrix** on the set to see that relationships are there.
6. Read the warnings. A value that is not among a pick list's options is left empty and listed there.

Worked example, from the synthetic DOORS file: 19 objects in the module, 6 of them headings. The import created 13 items and 6 folders (13 + 6 = 19) and 3 relationships.

## Import the same module again

A module changes while you migrate. To bring in the change, import the new file again. Matching is by the object's identifier in the file, so changed items get a new version, unchanged ones are left alone and new ones are added.

::: warning Turn off "Create the sets, fields and relationship types this file needs" on the second import
With that box on, the page treats the file as new structure. The set name is already taken, so it makes a second set with " 2" added to the name and imports everything again into it. Nothing is lost, but you get duplicates to clean up. With the box off, each specification goes to the set of the same name, and the import updates it.
:::

Worked example: the first DOORS file, then its next issue, with the box off. Result: 1 item added, 2 changed (one reworded, one whose Status became Deleted), 11 unchanged, no duplicates. An object deleted in the source arrives as a changed Status or not at all; it is not removed here.

## Known gaps

- The spreadsheet import has no "create the set from this file" mode yet; the set and its fields must exist.
- Re-import creates a second set when the structure box is on (above).
- Not tried with real exports from any of the four tools.
