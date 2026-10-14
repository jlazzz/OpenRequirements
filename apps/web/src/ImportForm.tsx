import {
  type ExistingFolder,
  guessTargets,
  type ImportNode,
  type ImportResult,
  mapRows,
  parseCsv,
} from "@app/importers";
import { docToText } from "@app/shared";
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  NativeSelect,
  SegmentedControl,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Field } from "./api.ts";
import { WordSource } from "./WordImport.tsx";

const MAX_NODES = 5000;
const SHOWN = 200;

/** The rows of a .csv or .xlsx file, every cell as text. */
async function readTable(file: File): Promise<string[][]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) return parseCsv(await file.text());
  // Loaded only when an Excel file is chosen, to keep it out of the main bundle.
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);
  return rows
    .map((row) =>
      row.map((cell) =>
        cell instanceof Date
          ? cell.toISOString().slice(0, 10)
          : cell === null || cell === undefined
            ? ""
            : String(cell),
      ),
    )
    .filter((row) => row.some((cell) => cell !== ""));
}

/** Where the import goes, and what is there already. */
export type ImportPlace = {
  projectId: string;
  setId: string;
  /** The folder imported into, or undefined for the top of the set. */
  parentId?: string;
  fields: Field[];
  /** The live folders of the set, so a folder the file names again is reused. */
  folders: ExistingFolder[];
  /** The UIDs of the set's live items. */
  uids: Set<string>;
  /** Each live item's description as plain text, by UID. */
  texts: Map<string, string>;
};
type Props = ImportPlace & { onDone: () => void };

/** Import into a set or folder from a spreadsheet or a Word document, with a preview of what changes. */
export function ImportForm({ onDone, ...place }: Props) {
  const [source, setSource] = useState("spreadsheet");
  return (
    <Stack gap="sm">
      <SegmentedControl
        aria-label="Import from"
        value={source}
        onChange={setSource}
        data={[
          { value: "spreadsheet", label: "Spreadsheet" },
          { value: "word", label: "Word document" },
        ]}
      />
      {source === "spreadsheet" ? (
        <SpreadsheetSource place={place} onDone={onDone} />
      ) : (
        <WordSource place={place} onDone={onDone} />
      )}
    </Stack>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const STATUS_COLOR = { added: "green", changed: "blue", unchanged: "gray" } as const;

/**
 * The preview and the Import button. The server works out what the import would do (a dry run) and the same request
 * then does it. `prepare` runs first on Import, for uploads the final request needs.
 */
export function ImportReview({
  place,
  nodes,
  problems,
  prepare,
  onDone,
}: {
  place: ImportPlace;
  nodes: ImportNode[] | null;
  problems: string[];
  prepare?: () => Promise<ImportNode[]>;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const body = (list: ImportNode[], dryRun: boolean) => ({
    sets: [{ setId: place.setId, ...(place.parentId ? { parentId: place.parentId } : {}), nodes: list }],
    dryRun,
  });
  const count = (list: ImportNode[]): number => list.reduce((sum, node) => sum + 1 + count(node.children ?? []), 0);
  const tooMany = nodes !== null && count(nodes) > MAX_NODES;
  const ready = nodes !== null && nodes.length > 0 && problems.length === 0 && !tooMany;
  const preview = useQuery({
    queryKey: ["import-preview", place.setId, place.parentId, nodes],
    queryFn: () => api<ImportResult>(`projects/${place.projectId}/import`, body(nodes ?? [], true)),
    enabled: ready,
    gcTime: 0,
  });
  const run = useMutation({
    mutationFn: async () => {
      const list = prepare ? await prepare() : (nodes ?? []);
      return api<ImportResult>(`projects/${place.projectId}/import`, body(list, false));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects", place.projectId] });
      onDone();
    },
  });
  const result = preview.data;
  const nothing = result && result.created.items + result.created.folders + result.changed === 0;
  const all = [...problems, ...(tooMany ? [`One import can hold at most ${MAX_NODES} folders and items.`] : [])];

  return (
    <>
      {nodes && all.length > 0 && (
        <Alert color="orange" title="Fix these before importing" role="alert">
          {all.slice(0, 10).map((problem) => (
            <Text key={problem} size="sm">
              {problem}
            </Text>
          ))}
          {all.length > 10 && <Text size="sm">…and {all.length - 10} more.</Text>}
        </Alert>
      )}
      {preview.isError && (
        <Alert color="red" role="alert">
          {preview.error.message}
        </Alert>
      )}
      {result && (
        <Alert color={nothing ? "gray" : "blue"} title="Preview" role="status">
          <Text size="sm">
            {nothing
              ? "Nothing would change: every item in the file is already here as it is."
              : `Adds ${plural(result.created.items, "item")} and ${plural(result.created.folders, "folder")}, ` +
                `changes ${plural(result.changed, "item")}, leaves ${result.unchanged} as ${result.unchanged === 1 ? "it is" : "they are"}.`}
          </Text>
          {result.changed > 0 && (
            <Text size="sm">Each changed item gets a new version, so the change can be compared and undone.</Text>
          )}
        </Alert>
      )}
      {result && result.items.length > 0 && (
        <Table.ScrollContainer minWidth={400} mah={260}>
          <Table withTableBorder aria-label="What the import does" verticalSpacing={4}>
            <Table.Tbody>
              {result.items.slice(0, SHOWN).map((row, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: one preview, never reordered
                <Table.Tr key={index}>
                  <Table.Td w={110}>
                    <Badge size="sm" variant="light" color={STATUS_COLOR[row.status]}>
                      {row.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td w={110}>{row.uid}</Table.Td>
                  <Table.Td>{row.name}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {result.items.length > SHOWN && (
            <Text size="sm" c="dimmed">
              …and {result.items.length - SHOWN} more.
            </Text>
          )}
        </Table.ScrollContainer>
      )}
      {run.isError && (
        <Alert color="red" role="alert">
          {run.error.message}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!result || nothing || !ready} loading={run.isPending} onClick={() => run.mutate()}>
          Import
        </Button>
      </Group>
    </>
  );
}

/** Spreadsheet import: choose a file and say what each column is. Each row becomes one item, or updates one. */
function SpreadsheetSource({ place, onDone }: { place: ImportPlace; onDone: () => void }) {
  // The steps of a test case are not one cell of text: they are entered on the test case.
  const fields = place.fields.filter((f) => f.type !== "steps");
  const [table, setTable] = useState<string[][] | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [header = [], ...rows] = table ?? [];
  const mapped = table ? mapRows(rows, targets, fields, place.folders, place.parentId ?? null) : null;
  // A spreadsheet holds descriptions as plain text: one that reads as the item's does now keeps its formatting.
  const keepFormatting = (list: ImportNode[]): ImportNode[] =>
    list.map((node) => {
      if (node.children) return { ...node, children: keepFormatting(node.children) };
      const same = node.uid && node.description && docToText(node.description) === place.texts.get(node.uid);
      if (!same) return node;
      const { description: _, ...rest } = node;
      return rest;
    });

  const load = async (file: File | null) => {
    setProblem(null);
    setTable(null);
    if (!file) return;
    try {
      const next = await readTable(file);
      if (next.length < 2) throw new Error("The file needs a header row and at least one more row.");
      setTable(next);
      setTargets(guessTargets(next[0] ?? [], fields, next.slice(1), place.uids));
    } catch (error) {
      setProblem(`Could not read the file: ${(error as Error).message}`);
    }
  };
  const options = [
    { value: "", label: "Skip this column" },
    { value: "name", label: "Name" },
    { value: "description", label: "Description" },
    { value: "uid", label: "UID (updates that item)" },
    { value: "folder", label: "Folder (path, like A / B)" },
    ...fields.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <>
      <FileInput
        label="Spreadsheet"
        description="A .csv or .xlsx file. The first row holds the column names. Each other row becomes an item, or updates the item its UID names."
        placeholder="Choose a file"
        accept=".csv,.xlsx,text/csv"
        onChange={load}
      />
      {problem && (
        <Alert color="red" role="alert">
          {problem}
        </Alert>
      )}
      {table && (
        <Table.ScrollContainer minWidth={400}>
          <Table withTableBorder aria-label="Column mapping">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Column in the file</Table.Th>
                <Table.Th>First value</Table.Th>
                <Table.Th>Import as</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {header.map((title, column) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: columns of one file never reorder
                <Table.Tr key={column}>
                  <Table.Td>{title || `Column ${column + 1}`}</Table.Td>
                  <Table.Td c="dimmed" maw={220} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {(rows[0]?.[column] ?? "").slice(0, 80)}
                  </Table.Td>
                  <Table.Td>
                    <NativeSelect
                      size="xs"
                      aria-label={`Import ${title || `column ${column + 1}`} as`}
                      data={options.map((o) => ({
                        ...o,
                        // One column per target.
                        disabled: o.value !== "" && targets.some((t, other) => t === o.value && other !== column),
                      }))}
                      value={targets[column] ?? ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setTargets((previous) => header.map((_, i) => (i === column ? value : (previous[i] ?? ""))));
                      }}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <ImportReview
        place={place}
        nodes={mapped ? keepFormatting(mapped.nodes) : null}
        problems={mapped?.errors ?? []}
        onDone={onDone}
      />
    </>
  );
}
