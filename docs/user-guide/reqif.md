# ReqIF export and import

ReqIF is the exchange format of DOORS, Polarion and other requirements tools. A `.reqif` file holds text only. A `.reqifz` file is an archive that also holds the images.

## Export

1. Open a set, or open a baseline from **Baselines**.
2. Choose **Export**, then **ReqIF with images (.reqifz)** or **ReqIF, text only (.reqif)**.

- A set exports its items as they are now, with the relationships between items of that set.
- A baseline exports what it froze. A baseline of the whole project holds every set and every relationship.
- Each item carries its ID, name, description and fields. Folders are exported as headings.

## Import

Editors see **Import ReqIF** in the project menu.

### Let the file set up the project (project admins)

Choose the file. **Create the sets, fields and relationship types this file needs** is on. The box under it lists what will be added: a set and item type for each specification, a field for each attribute (a ReqIF enumeration becomes a pick list with the file's values), and a relationship type for each relation type. Check it, then press **Import**.

- Only additions. A set, field or relationship type that already has the same name is used as it is; nothing is renamed or removed. A pick list that lacks one of the file's values gains it.
- If a field of that name exists with another type, a note says so and the values are read as that type.
- Names come from the file. Rename a set or field afterwards on the **Item types** page.
- Turn the box off to choose targets by hand, as below. Editors who are not admins always do.

### Choosing targets by hand

1. Choose the file.
2. For each specification in the file, choose the set it goes into, or skip it.
3. For each attribute, choose what it becomes: the name, the description, one of the set's fields, or skip. Attributes with the usual names are matched for you.
4. For each relation type, choose the relationship type, or skip it. If the arrows come out the wrong way round, change **The source item is**.
5. Read the **Review** box. It says how many items, folders and relationships the file holds, and what will be left out.
6. Press **Import**.

Nothing is created before step 6. An import either creates everything or nothing.

## What to expect

- Importing the same file again updates the items it brought in instead of adding them twice. A changed item gets a new version; an unchanged one is left alone. Relationships that already exist are not added again.
- A file exported from this project, edited in another tool and imported back updates the items it came from.
- New items get new IDs. To keep the other tool's ID, map it to a text field.
- Updated items stay in the folder they are in.
- An entry with entries below it becomes a folder. If it also has text of its own, that text becomes the first item in the folder.
- An item with no name is named by the first line of its text.
- A value that is not among a field's options is left empty and listed in the review.
- Colours, fonts and other formatting the editor does not have are dropped. The text is kept.
- Embedded objects are imported when the file holds them as PNG, JPEG, GIF or WebP, up to 5 MB each.
- One import can hold 5,000 folders and items.
