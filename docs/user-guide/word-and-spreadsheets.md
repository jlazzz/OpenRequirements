# Word, spreadsheets and printing

## Export to Word

1. Open a set, or open a baseline from **Baselines**.
2. Choose **Export**, then **Word document (.docx)**.

The document has a cover page, then each folder as a heading and each item with its ID and name, its description, and a small table of its fields. Pages show the project and set (or baseline) at the top and "Page n of m" at the bottom.

- A set exports its items as they are now. A baseline exports what it froze.
- PNG, JPEG and GIF images are included. WebP images appear as their description.

## Print or save as PDF

1. Open a set or folder and switch to **Reading**.
2. Press **Print or save as PDF**, and choose "Save as PDF" as the printer if you want a file.

The printout starts with a cover page and numbers its pages.

## Import a spreadsheet

Editors see **Import** on a set or folder.

1. Choose **Spreadsheet**, then a `.csv` or `.xlsx` file. The first row holds the column names.
2. Say what each column is: Name, Description, UID, Folder, a field, or skip. Columns with these names are matched for you.
3. Read the **Preview**. It lists each item as added, changed or unchanged.
4. Press **Import**.

- A row with a **UID** updates that item: it gets a new version if anything differs. Empty cells leave the item's values as they are.
- A **Folder** cell such as `Power / Supply` puts a new item in that folder, made if needed. Existing items stay where they are.
- **Export CSV** in List view writes both columns. Export, edit in Excel, import: the changes come back as new versions.

## Import a Word document

1. Choose **Import** on a set or folder, then **Word document**, then a `.docx` file.
2. Choose what becomes an item:
   - **Each paragraph or table is an item.** A list joins the paragraph before it.
   - **Each heading with text below is an item.** The text is its description. A heading with only headings below it is a folder.
3. In the list, untick **Import** to leave a row out, or tick **Add to the item above** to join it to the previous item.
4. Read the **Preview** and press **Import**.

- Headings become folders, whatever language the heading styles are named in.
- Bold, italic, underline, strike-through, links, lists, tables and pictures are kept. Other formatting is dropped.
- A document exported from here imports back: items are found by their ID and updated, not added again.
- Old `.doc` files cannot be read. Save them as `.docx` first.

Nothing is written before **Import**, and an import makes all its changes or none. One import holds up to 5,000 folders and items.

## Matrix and baseline exports

- **Traceability matrix:** on the Matrix page, **Export CSV** and **Export Word** save the grid as shown, with ● for linked and ⚠ for suspect.
- **Baseline:** on the baseline page, **Export** has a spreadsheet entry (.csv). Each item gets the verification status and out-of-date flag frozen in the baseline, and the relationships that were suspect then. Test cases carry no verification status.
