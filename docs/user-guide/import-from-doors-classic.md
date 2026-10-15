# Moving from DOORS Classic

Read [Moving from another tool](import-from-another-tool.md) first. This page is what is particular to DOORS Classic (IBM DOORS 9).

::: warning Synthetic sample
The numbers here come from `samples/import/doors-classic-launcher-icd.reqif`, written by a script to the shape DOORS Classic is known to export. It was not exported from DOORS.
:::

## Export

1. In DOORS, open the module (one module is one ReqIF specification).
2. Export it as ReqIF. In DOORS 9.6 and later this is under **File → Export**, and the name of the menu entry varies by version; ask your DOORS administrator if you cannot find it.
3. Include the attributes you want to keep. Attributes you leave out do not arrive.
4. Export one file per module. Links between modules arrive only when both ends are in the file, so export linked modules together where DOORS allows it.

## Import

1. As a project admin, open the project menu and **Import ReqIF**, and choose the file.
2. Leave **Create the sets, fields and relationship types this file needs** on. The box under it lists what will be added.
3. Press **Import**.

What the sample did:

| In the file | Becomes |
|---|---|
| The module | A set and item type named after it (`Launcher interface requirements`, prefix `LIR`) |
| `ReqIF.ChapterName` | The item's name (heading text) |
| `ReqIF.Text` | The description, formatted |
| `ReqIF.ForeignID` (the absolute number) | A text field named `ForeignID` |
| `Status`, `Verification Method` (enumerations) | Pick lists with the file's values |
| `Created On` | A date field |
| The link module's links (`satisfies`) | A relationship type of that name, and its relationships |
| An object with objects below it | A folder |

A DOORS link goes from the lower-level object to the one it satisfies. The import puts the target upstream. If your arrows come out the wrong way round, turn the structure box off and change **The source item is** for that relation type.

## What does not move, besides the common list

- **DOORS history and baselines**, link sets that are not exported as ReqIF relations, and DXL-computed attributes unless the export wrote them as values.
- **Absolute numbers as IDs.** New items get new IDs. The absolute number is kept in the `ForeignID` field. Search for it there.
- Objects marked as deleted in a later export arrive as a changed Status (see below).

## Check

The sample module held 19 objects. The import created 13 items, 6 folders and 3 relationships. See [Check the counts](import-from-another-tool.md#check-the-counts).

## A new issue of the module

Export again, import it with the structure box **off**. On the sample's next issue the result was 1 added, 2 changed, 11 unchanged. See [Import the same module again](import-from-another-tool.md#import-the-same-module-again).

## Not checked

- Real DOORS exports, large modules, and DOORS rich text with OLE objects (embedded objects that are not PNG, JPEG, GIF or WebP are left out, with a warning).
- The menu path and export options above, which are from DOORS documentation, not from a DOORS you can try here.
