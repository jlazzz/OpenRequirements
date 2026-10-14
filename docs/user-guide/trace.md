# Trace view, coverage and impact analysis

## Trace view

1. Open a set or a folder.
2. Choose **Trace** in the view switch at the top right.

Each item of the set is in the middle column. Items upstream of it are in the columns to the left, items downstream in the columns to the right, one column per level. An item with several related items spans their rows.

- **Upstream levels** and **Downstream levels** set how many columns are shown, from 0 to 4.
- An orange cell marked "Suspect" means an item changed since that relationship was confirmed.
- "Loop" means the chain of relationships came back to an item already on that row's path. The chain stops there.

The address in the browser holds the levels and the coverage set, so a trace can be shared as a link.

## Coverage

The line above the table counts, for the items shown:

- how many have no downstream relationship,
- how many reach an item in the set chosen under **Coverage: reaches**, at any depth.

A project made from the Standard template starts with Verification Tests as that set.

## Export

**Export CSV** saves the table as it is shown. Excel opens the file.

## Impact analysis

1. Open an item.
2. Choose **Impact analysis** at the bottom of the Relationships panel.

**Downstream** lists everything that may need to change if this item changes, at any depth, as a tree. **Upstream** lists everything the item derives from. Each line shows the item's set, the relationship type, its state and whether the relationship is suspect.

An item reached by more than one route is expanded the first time only, and marked "shown above" after that.
