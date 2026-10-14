import { readDocx, type WordBlock, wordRows, wordTree } from "@app/importers";
import { unzip } from "@app/reqif";
import { Alert, Checkbox, FileInput, SegmentedControl, Table, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { uploadImage } from "./api.ts";
import { type ImportPlace, ImportReview } from "./ImportForm.tsx";
import { IMAGE_TYPES, MAX_IMAGE, PLACEHOLDER } from "./Reqif.tsx";

type Loaded = { files: Map<string, Uint8Array>; blocks: WordBlock[]; dropped: number };

/** The archive path of an embedded picture that can be stored as an image, or null. */
function storable(files: Map<string, Uint8Array>, path: string): string | null {
  const type = IMAGE_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
  return type && (files.get(path)?.length ?? 0) > 0 && (files.get(path)?.length ?? 0) <= MAX_IMAGE ? type : null;
}

/**
 * Word import: headings become folders, and paragraphs and tables become items, or each heading with text below it
 * does. The review lists every folder and item: leave one out, or add an item to the one above it.
 */
export function WordSource({ place, onDone }: { place: ImportPlace; onDone: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [mode, setMode] = useState<"paragraph" | "heading">("paragraph");
  const [skip, setSkip] = useState(new Set<number>());
  const [merge, setMerge] = useState(new Set<number>());

  const rows = useMemo(() => (loaded ? wordRows(loaded.blocks, mode, place.uids) : []), [loaded, mode, place.uids]);
  const tree = useMemo(
    () => (loaded ? wordTree(rows, skip, merge, place.folders, place.parentId ?? null) : null),
    [loaded, rows, skip, merge, place.folders, place.parentId],
  );

  const load = async (file: File | null) => {
    setProblem(null);
    setLoaded(null);
    setSkip(new Set());
    setMerge(new Set());
    if (!file) return;
    try {
      const files = await unzip(new Uint8Array(await file.arrayBuffer()));
      // Pictures stand in as a placeholder until the import runs, so nothing is uploaded for a preview.
      const { blocks, dropped } = readDocx(files, (path) => (storable(files, path) ? PLACEHOLDER : null));
      if (blocks.length === 0) throw new Error("The document has no text.");
      setLoaded({ files, blocks, dropped });
    } catch (error) {
      const message = (error as Error).message;
      setProblem(`Could not read the file: ${message === "Not a zip archive" ? "it is not a .docx file." : message}`);
    }
  };
  const changeMode = (value: string) => {
    setMode(value === "heading" ? "heading" : "paragraph");
    setSkip(new Set());
    setMerge(new Set());
  };
  const toggle = (update: (change: (previous: Set<number>) => Set<number>) => void, index: number) =>
    update((previous) => {
      const next = new Set(previous);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  // Uploads the pictures the chosen rows use, then builds the same tree with their addresses.
  const prepare = async () => {
    if (!loaded) return [];
    const pass = (image: (path: string) => string | null) => {
      const read = readDocx(loaded.files, image);
      return wordTree(wordRows(read.blocks, mode, place.uids), skip, merge, place.folders, place.parentId ?? null);
    };
    // A first pass marks each picture, to find those in rows that are imported.
    const paths: string[] = [];
    const marked = JSON.stringify(
      pass((path) => {
        if (!storable(loaded.files, path)) return null;
        if (!paths.includes(path)) paths.push(path);
        return `${PLACEHOLDER}#${paths.indexOf(path)}`;
      }).nodes,
    );
    const stored = new Map<string, string>();
    for (const [index, path] of paths.entries()) {
      if (!marked.includes(`${PLACEHOLDER}#${index}"`)) continue;
      const type = storable(loaded.files, path) as string;
      const image = new File([loaded.files.get(path) as BlobPart], path.slice(path.lastIndexOf("/") + 1), { type });
      // A file that is not the image its name says is refused by the server; it is then left out.
      await uploadImage(place.projectId, image).then(
        (src) => stored.set(path, src),
        () => undefined,
      );
    }
    return pass((path) => stored.get(path) ?? null).nodes;
  };

  return (
    <>
      <FileInput
        label="Word document"
        description="A .docx file. Headings become folders. Nothing is created until you press Import."
        placeholder="Choose a file"
        accept=".docx"
        onChange={load}
      />
      {problem && (
        <Alert color="red" role="alert">
          {problem}
        </Alert>
      )}
      {loaded && (
        <SegmentedControl
          aria-label="What becomes an item"
          value={mode}
          onChange={changeMode}
          data={[
            { value: "paragraph", label: "Each paragraph or table is an item" },
            { value: "heading", label: "Each heading with text below is an item" },
          ]}
        />
      )}
      {loaded && loaded.dropped > 0 && (
        <Alert color="orange">
          {loaded.dropped} {loaded.dropped === 1 ? "picture is" : "pictures are"} not PNG, JPEG, GIF or WebP, or larger
          than 5 MB, and will be left out.
        </Alert>
      )}
      {loaded && (
        <Table.ScrollContainer minWidth={500} mah={360}>
          <Table withTableBorder stickyHeader aria-label="Folders and items in the document" verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={70}>Import</Table.Th>
                <Table.Th w={90}>As</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th w={150}>Add to the item above</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row, index) => {
                const label = row.kind === "folder" ? row.name : `${row.uid ? `${row.uid} ` : ""}${row.name}`;
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows of one reading never reorder
                  <Table.Tr key={index} c={skip.has(index) ? "dimmed" : undefined}>
                    <Table.Td>
                      <Checkbox
                        aria-label={`Import ${label}`}
                        checked={!skip.has(index)}
                        onChange={() => toggle(setSkip, index)}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {row.kind === "folder" ? `Folder ${row.level}` : row.uid ? "Update" : "Item"}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ paddingLeft: row.kind === "folder" ? 8 + (row.level - 1) * 16 : undefined }}>
                      <Text size="sm" fw={row.kind === "folder" ? 600 : undefined} lineClamp={2}>
                        {label}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {row.kind === "item" && index > 0 && (
                        <Checkbox
                          aria-label={`Add ${label} to the item above`}
                          checked={merge.has(index)}
                          disabled={skip.has(index)}
                          onChange={() => toggle(setMerge, index)}
                        />
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <ImportReview place={place} nodes={tree?.nodes ?? null} problems={[]} prepare={prepare} onDone={onDone} />
    </>
  );
}
