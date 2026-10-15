# Moving from Polarion

Read [Moving from another tool](import-from-another-tool.md) first. This page is what is particular to Siemens Polarion.

::: warning Synthetic sample
The numbers here come from `samples/import/polarion-ground-segment.reqif`, written by a script to the shape Polarion is known to export. It was not exported from Polarion.
:::

## Export

1. In Polarion, open the Document that holds the requirements (one document is one ReqIF specification).
2. Export it as ReqIF. Polarion needs its ReqIF export extension, and the menu entry varies by version; ask your Polarion administrator if it is not there.
3. Include the fields you want. Work item IDs such as `GS-101` are the ones to keep.
4. One file per document.

## Import

1. As a project admin, open the project menu and **Import ReqIF**, and choose the file.
2. Leave **Create the sets, fields and relationship types this file needs** on, and press **Import**.

What the sample did:

| In the file | Becomes |
|---|---|
| The document | A set and item type named after it (`Ground Segment Requirements`, prefix `GSR`) |
| `Title` | The item's name |
| `Description` | The description, formatted |
| `ReqIF.ForeignID` (the work item ID, `GS-101`) | A text field named `ForeignID`. Search for the old ID there |
| `Status`, `Severity`, `Type` | Pick lists. Ids such as `must_have` come in as the file gives them |
| `depends_on` and other link roles | Relationship types, and their relationships |
| A heading with work items below it | A folder |

## What does not move, besides the common list

- Work item **history**, workflow state history, document revisions and baselines.
- Comments, approvals, and e-signatures.
- Links to work items that are not in the exported document.
- Live documents, queries and reports.

## Check

The sample document held 11 objects. The import created 8 items, 3 folders and 2 relationships. See [Check the counts](import-from-another-tool.md#check-the-counts).

## Not checked

- Real Polarion exports, with custom fields, enumerations with many values, or links between documents.
- The export steps above, which are from the vendor's documentation, not from a Polarion you can try here.
