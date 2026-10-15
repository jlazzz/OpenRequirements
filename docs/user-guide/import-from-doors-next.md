# Moving from DOORS Next

Read [Moving from another tool](import-from-another-tool.md) first. This page is what is particular to IBM DOORS Next (Engineering Lifecycle Management).

::: warning Synthetic sample
The numbers here come from `samples/import/doors-next-payload-software.reqifz`, written by a script to the shape DOORS Next is known to export. It was not exported from DOORS Next.
:::

## Export

1. In DOORS Next, open the module and choose its export as ReqIF. Some versions ask you to define a ReqIF definition first and then export it; menu names vary by version.
2. Download the archive. DOORS Next gives a `.reqifz`, a zip that holds the `.reqif` file and the images.
3. Do not unzip it. The import page reads the archive.

## Import

1. As a project admin, open the project menu and **Import ReqIF**, and choose the `.reqifz` file.
2. Leave **Create the sets, fields and relationship types this file needs** on, and press **Import**.
3. **Then fix the description** (next section).

What the sample did:

| In the file | Becomes |
|---|---|
| The module | A set and item type named after it |
| `ReqIF.Name` | The item's name |
| `ReqIF.Description` | A text field named `Description` (not the item's text, see below) |
| `Identifier` (integer) | A number field |
| `Artifact Type`, `Priority` | Pick lists. A heading artifact has the type `Heading`; its object is imported as a folder |
| `Planned In` (multiple values) | A multi-select field |
| `Elaborated By` | A relationship type, and its relationships |
| Images in the archive | Images in the item text, when PNG, JPEG, GIF or WebP |

### Fix the description

The structure page does not take `ReqIF.Description` for the item's text, so it comes in as a plain-text field and the item's own description is empty. Formatting is lost in that field. To put it in the description:

1. Open the project menu and **Import ReqIF** again, and choose the same file.
2. Turn **Create the sets, fields and relationship types this file needs** **off**.
3. For the attribute `ReqIF.Description`, choose **Description**.
4. Check the other mappings, and press **Import**.

On the sample this updated all 7 items, giving each a body. Afterwards, remove the `Description` field on the **Item types** page if you do not need it.

## What does not move, besides the common list

- Module and artifact **history**, streams, baselines and change sets.
- Links to other ELM tools (work items, test cases): only ReqIF relations are in the file.
- Comments and discussions on artifacts.

## Check

The sample module held 10 objects. The import created 7 items, 3 folders and 1 relationship. See [Check the counts](import-from-another-tool.md#check-the-counts).

## Not checked

- Real DOORS Next exports, and modules with images or links to other modules.
- The export steps above, which are from the vendor's documentation, not from a DOORS Next you can try here.
