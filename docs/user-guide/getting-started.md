# Projects, sets, items and baselines

## First steps in a new project

1. An instance administrator makes a project from a template with **New project**. The template sets up the item types, fields, sets and relationship types.
2. Open a set in the side bar and add folders and items. Each item gets a UID such as `SYS-042` that is never reused.
3. Write the item, then **Save version**. Every saved version is kept; open **Versions** to compare or restore one.
4. Link items with **Relationships** (for example *Derived from*). A relationship becomes *suspect* when either end changes; see [Trace view](trace.md).
5. Freeze the state of a set or project with **Baselines**. A baseline never changes. Compare it with the current state or another baseline, export it, or [review it](reviews.md).

Deleted items go to **Deleted items**, where they can be restored. Nothing is ever removed from history.

## Bring in what you already have

Use **Import** for a [spreadsheet or Word file](word-and-spreadsheets.md) or a [ReqIF file](reqif.md). Or load the [demo project](demo-project.md) to look around first.

## People

Project admins add people on **Members** and choose a role: Viewer, Reviewer, Editor or Admin. Item types, fields and relationship types are changed on **Item types** (admins only). See [working together](working-together.md).
