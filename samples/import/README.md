# Import test files

Files for trying the import screens. They are **synthetic**: written by `scripts/samples/make-import-samples.ts` to the shapes each tool is known to export, not exported from the tools themselves. They test our importers against those shapes, but only real exports can prove compatibility (roadmap A1 slice 4).

| File | Imitates | Import with | What it tests |
|---|---|---|---|
| `doors-classic-launcher-icd.reqif` | DOORS Classic module | Import → ReqIF | Headings as `ReqIF.ChapterName`, text as `ReqIF.Text` with the `reqif-xhtml:` prefix, absolute numbers in `ReqIF.ForeignID`, nested headings, a multi-valued enumeration, links |
| `doors-classic-launcher-icd-v2.reqif` | The next issue of the same module | Import → ReqIF, into the same set | Re-import: one object reworded, one new, one marked Deleted. Expect 1 added, 1 changed, the rest unchanged, no duplicates |
| `doors-next-payload-software.reqifz` | DOORS Next module, zipped | Import → ReqIF | `.reqifz` archive, `ReqIF.Name` and `ReqIF.Description`, generated identifiers, heading artifacts, the `xhtml:` prefix |
| `polarion-ground-segment.reqif` | Polarion document | Import → ReqIF | Work item ids (`GS-101`) as `ReqIF.ForeignID`, `Title` and `Description`, enumeration ids such as `must_have` |
| `jama-customer-requirements.xlsx` | Jama Excel export | Import → Spreadsheet | Jama's columns, a location path turned into a Folder column, rich text as HTML |
| `jama-customer-requirements.csv` | The same, as CSV | Import → Spreadsheet | As above |
| `customer-technical-annex.docx` | A customer's Word specification | Import → Word | Heading 1 and 2 styles, a cover (Title, Subtitle), bold, a table and a bulleted list. Try both paragraph and heading mode |

Known results (2026-10-14):

- Every ReqIF file imports with no warnings.
- Jama files import with the guessed mapping. The **ID** column is skipped, because its values (`CUST-2`) are not UIDs of the set. Descriptions written as HTML come in formatted: paragraphs, bold and the rest (fixed 2026-10-14).

To make the files again after changing the generator:

```bash
node scripts/samples/make-import-samples.ts
```
