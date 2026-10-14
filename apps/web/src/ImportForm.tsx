import { guessTargets, mapRows, parseCsv } from "@app/importers";
import { Alert, Button, FileInput, Group, NativeSelect, Stack, Table, Text } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Field } from "./api.ts";

const MAX_ITEMS = 2000;

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

type Props = { projectId: string; setId: string; parentId?: string; fields: Field[]; onDone: () => void };

/** Spreadsheet import: choose a file, say what each column is, then create one item per row. */
export function ImportForm({ projectId, setId, parentId, fields: all, onDone }: Props) {
  // The steps of a test case are not one cell of text: they are entered on the test case.
  const fields = all.filter((f) => f.type !== "steps");
  const queryClient = useQueryClient();
  const [table, setTable] = useState<string[][] | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [header = [], ...rows] = table ?? [];
  const mapped = mapRows(rows, targets, fields);
  const errors =
    mapped.items.length > MAX_ITEMS
      ? [
          `A file can hold at most ${MAX_ITEMS} items. This one has ${mapped.items.length}. Split it and import each part.`,
        ]
      : mapped.errors;

  const load = async (file: File | null) => {
    setProblem(null);
    setTable(null);
    if (!file) return;
    try {
      const next = await readTable(file);
      if (next.length < 2) throw new Error("The file needs a header row and at least one more row.");
      setTable(next);
      setTargets(guessTargets(next[0] ?? [], fields));
    } catch (error) {
      setProblem(`Could not read the file: ${(error as Error).message}`);
    }
  };
  const run = useMutation({
    mutationFn: () => api<{ created: number }>(`sets/${setId}/import`, { parentId, items: mapped.items }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      onDone();
    },
  });
  const options = [
    { value: "", label: "Skip this column" },
    { value: "name", label: "Name" },
    { value: "description", label: "Description" },
    ...fields.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <Stack gap="sm">
      <FileInput
        label="Spreadsheet"
        description="A .csv or .xlsx file. The first row must hold the column names. Each other row becomes one item."
        placeholder="Choose a file"
        accept=".csv,.xlsx,text/csv"
        onChange={load}
      />
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
      {table && errors.length > 0 && (
        <Alert color="orange" title="Fix these before importing" role="alert">
          {errors.slice(0, 10).map((error) => (
            <Text key={error} size="sm">
              {error}
            </Text>
          ))}
          {errors.length > 10 && <Text size="sm">…and {errors.length - 10} more.</Text>}
          <Text size="sm" mt={4}>
            Correct the file and choose it again, or skip the column.
          </Text>
        </Alert>
      )}
      {(problem || run.isError) && (
        <Alert color="red" role="alert">
          {problem ?? run.error?.message}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!table || errors.length > 0} loading={run.isPending} onClick={() => run.mutate()}>
          {table && errors.length === 0
            ? `Import ${mapped.items.length} ${mapped.items.length === 1 ? "item" : "items"}`
            : "Import"}
        </Button>
      </Group>
    </Stack>
  );
}
