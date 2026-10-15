# Moving from Jama Connect

Read [Moving from another tool](import-from-another-tool.md) first. Jama is imported from a spreadsheet, not ReqIF, so this page differs more than the others.

::: warning Synthetic sample
The numbers here come from `samples/import/jama-customer-requirements.csv` and `.xlsx`, written by a script to the shape Jama's Excel export is known to have. They were not exported from Jama.
:::

## Export

1. In Jama, open the set of items you want and export it to Excel.
2. Choose the columns: name, description, status, priority and the others you want. Keep the **ID** or **Global ID** column.
3. Save as `.xlsx`, or as `.csv` (UTF-8).
4. **Add a Folder column.** The sample has one, made from Jama's location path. Jama's own export may only have the location; if it has no Folder column, make one in Excel with a path such as `Customer Requirements / Imaging`.

## Make the set first

The spreadsheet import cannot create a set or fields. Before importing:

1. As a project admin, open **Item types**.
2. Add a set and item type for the Jama item type (or use one the template made).
3. Add a field for each column you want to keep that is not the name or description (Status, Priority, and so on). For a pick list, add the values the column uses; a value that is not among the options is left empty and reported.

## Import

1. Open the set and choose **Import**, **Spreadsheet**, and choose the `.xlsx` or `.csv`.
2. Check what each column is. In the sample, these were matched for you:

   | Column | Becomes |
   |---|---|
   | Name | The item's name |
   | Description | The description. Jama writes rich text as HTML in the cell; it is read as formatted text (paragraphs, bold, lists) |
   | Status, Priority | The fields of the same name |
   | Folder | A folder path, made if needed |
   | ID, Global ID, Item Type, Location | Skipped. The ID column is not guessed as our UID because its values (`CUST-2`) are not UIDs of this set |

3. Read the **Preview** and press **Import**.

On the sample the result was 8 items and 3 folders, with no errors.

## Keep Jama's ID

The sample imported with no field for Jama's ID, so it was lost. To keep it, add a text field named `Jama ID` and set **ID** to that field (and **Global ID** to another). Do this before you import.

## What does not move, besides the common list

- Item **versions** and their history, and Jama's baselines and reviews.
- **Relationships** between items, which are not in a plain spreadsheet export. Make them again here, or take them from Jama's trace reports by hand. The spreadsheet import does not create relationships.
- Item types' workflow, and attachments.
- A file with more than 5,000 folders and items: split it.

## Check

The sample file held 8 rows. The import created 8 items in 3 folders. See [Check the counts](import-from-another-tool.md#check-the-counts): rows in the file equal items created.

## Import it again: duplicates

::: warning A spreadsheet without our UID adds the rows again
Matching on a second import is by our UID column only. The Jama ID is not one. Importing the sample twice made 16 items, not 8.
:::

- Import once, and treat the import as final.
- Or, to update later, export the set's CSV from here (it has the UID column), put the new values in it, and import that.

## Not checked

- Real Jama exports, with many item types in one file, or other languages' column names.
- The export steps above, which are from the vendor's documentation, not from a Jama you can try here.
