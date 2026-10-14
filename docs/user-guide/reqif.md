# ReqIF export and import

ReqIF is the exchange format of DOORS, Polarion and other requirements tools. A `.reqif` file holds text only. A `.reqifz` file is an archive that also holds the images.

## Export

1. Open a set, or open a baseline from **Baselines**.
2. Choose **Export ReqIF**, then `.reqifz, with images` or `.reqif, text only`.

- A set exports its items as they are now, with the relationships between items of that set.
- A baseline exports what it froze. A baseline of the whole project holds every set and every relationship.
- Each item carries its ID, name, description and fields. Folders are exported as headings.

## Import

Editors see **Import ReqIF** in the project menu.

1. Choose the file.
2. For each specification in the file, choose the set it goes into, or skip it.
3. For each attribute, choose what it becomes: the name, the description, one of the set's fields, or skip. Attributes with the usual names are matched for you.
4. For each relation type, choose the relationship type, or skip it. If the arrows come out the wrong way round, change **The source item is**.
5. Read the **Review** box. It says how many items, folders and relationships will be created, and what will be left out.
6. Press **Import**.

Nothing is created before step 6. An import either creates everything or nothing.

## What to expect

- Items are added. Existing items are never changed, so importing the same file twice creates duplicates.
- Imported items get new IDs. To keep the old ID, map it to a text field.
- An entry with entries below it becomes a folder. If it also has text of its own, that text becomes the first item in the folder.
- An item with no name is named by the first line of its text.
- A value that is not among a field's options is left empty and listed in the review.
- Colours, fonts and other formatting the editor does not have are dropped. The text is kept.
- Embedded objects are imported when the file holds them as PNG, JPEG, GIF or WebP, up to 5 MB each.
- One import can hold 5,000 folders and items.
