import { toCsv, toDocx } from "@app/importers";
import { Alert, Button, Group, Select, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { download, isSuspect, isTestSet, type LiveLink, type ProjectSet, type TreeNode } from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { itemsWithin, useProject } from "./ProjectPage.tsx";
import { useLinks } from "./Relationships.tsx";
import { StatusBadge, StatusDot } from "./Status.tsx";
import { OutcomeBadge, useVerification, VerificationBadge } from "./Verification.tsx";

/** Traceability matrix: the items of one set down the side, another set across the top, a mark where two are linked. */
export function MatrixPage() {
  const project = useProject().data;
  const search = useSearch({ from: "/projects/$projectId/matrix" });
  const navigate = useNavigate({ from: "/projects/$projectId/matrix" });
  const links = useLinks(project?.project.id ?? "");
  const verification = useVerification(project?.project.id ?? "").data;
  if (!project) return null;
  // A test case shows its latest result; any other item shows its verification status.
  const verified = (set: ProjectSet, node: TreeNode) =>
    isTestSet(set) ? (
      <OutcomeBadge result={verification?.tests[node.id]} />
    ) : (
      <VerificationBadge entry={verification?.requirements[node.id]} />
    );

  const { sets, nodes } = project;
  const rowSet = sets.find((s) => s.id === search.rows) ?? sets[0];
  const colSet = sets.find((s) => s.id === search.cols) ?? sets.find((s) => s.id !== rowSet?.id) ?? sets[0];
  if (!rowSet || !colSet) return <Alert color="red">This project has no sets.</Alert>;
  const rows = itemsWithin(nodes, rowSet.id);
  const cols = itemsWithin(nodes, colSet.id);
  const pairs = new Map(
    (links.data?.links ?? []).flatMap((l): [string, LiveLink][] => [
      [`${l.upstreamId}:${l.downstreamId}`, l],
      [`${l.downstreamId}:${l.upstreamId}`, l],
    ]),
  );
  const linked = (a: TreeNode, b: TreeNode) => pairs.has(`${a.id}:${b.id}`);
  const suspect = (a: TreeNode, b: TreeNode) => {
    const link = pairs.get(`${a.id}:${b.id}`);
    return link !== undefined && isSuspect(link);
  };
  const unlinked = rows.filter((row) => !cols.some((col) => linked(row, col))).length;
  const options = sets.map((s) => ({ value: s.id, label: s.name }));
  const choose = (key: "rows" | "cols") => (value: string | null) =>
    navigate({ search: (previous) => ({ ...previous, [key]: value ?? undefined }) });
  const item = (node: TreeNode) =>
    ({ to: "/projects/$projectId/items/$nodeId", params: { projectId: project.project.id, nodeId: node.id } }) as const;

  // The same rows the screen shows: "●" linked, "⚠" suspect.
  const grid = [
    [rowSet.name, ...cols.map((c) => `${c.uid} ${c.name}`.trim())],
    ...rows.map((row) => [
      `${row.uid} ${row.name}`.trim(),
      ...cols.map((col) => (suspect(row, col) ? "⚠" : linked(row, col) ? "●" : "")),
    ]),
  ];
  const fileBase = `Matrix ${rowSet.name} x ${colSet.name}`.replace(/[^\w.-]+/g, "_");
  const exportCsv = () => download(`${fileBase}.csv`, new Blob([toCsv(grid)], { type: "text/csv;charset=utf-8" }));
  const exportWord = async () => {
    const title = `Traceability matrix: ${rowSet.name} against ${colSet.name}`;
    const day = new Date().toISOString().slice(0, 10);
    const bytes = await toDocx(
      { title, lines: [project.project.name, `Exported ${day}`, "● linked. ⚠ suspect."], header: title },
      [],
      new Map(),
      grid,
    );
    download(
      `${fileBase}.docx`,
      new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
  };

  return (
    <Stack gap="sm">
      <Title order={1} size="h2">
        Traceability matrix
      </Title>
      <Group>
        <Select label="Rows" data={options} value={rowSet.id} onChange={choose("rows")} allowDeselect={false} />
        <Select label="Columns" data={options} value={colSet.id} onChange={choose("cols")} allowDeselect={false} />
        {rows.length > 0 && cols.length > 0 && (
          <Group gap="xs" align="end">
            <Button variant="default" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="default" onClick={exportWord}>
              Export Word
            </Button>
          </Group>
        )}
      </Group>
      {links.isError && (
        <Alert color="red" role="alert">
          {links.error.message}
        </Alert>
      )}
      {rows.length === 0 || cols.length === 0 ? (
        <Text c="dimmed">Both sets need at least one item.</Text>
      ) : (
        <>
          <Text size="sm" c="dimmed">
            ● linked. ⚠ suspect: an item changed since the relationship was confirmed.
          </Text>
          <Text size="sm" c={unlinked > 0 ? "orange.8" : "dimmed"}>
            {unlinked} of {rows.length} {rowSet.name} items have no relationship with any {colSet.name} item.
          </Text>
          <Table.ScrollContainer minWidth={240 + cols.length * 110}>
            <Table
              withTableBorder
              withColumnBorders
              bg="var(--mantine-color-body)"
              aria-label={`${rowSet.name} against ${colSet.name}`}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th miw={240}>{rowSet.name}</Table.Th>
                  {cols.map((col) => (
                    <Table.Th key={col.id} ta="center" style={{ whiteSpace: "nowrap" }}>
                      <Tooltip label={col.name}>
                        <RouterAnchor {...item(col)} size="sm" mr={4}>
                          {col.uid}
                        </RouterAnchor>
                      </Tooltip>
                      <StatusDot status={col.status} />
                      <div>{verified(colSet, col)}</div>
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Th scope="row" fw={400}>
                      <RouterAnchor {...item(row)} size="sm" mr={6}>
                        {row.uid} {row.name}
                      </RouterAnchor>
                      <StatusBadge status={row.status} /> {verified(rowSet, row)}
                    </Table.Th>
                    {cols.map((col) => (
                      <Table.Td
                        key={col.id}
                        ta="center"
                        bg={
                          suspect(row, col)
                            ? "var(--mantine-color-orange-light)"
                            : linked(row, col)
                              ? "var(--mantine-color-blue-light)"
                              : undefined
                        }
                      >
                        {linked(row, col) && (
                          <span
                            role="img"
                            aria-label={`${row.uid} is linked to ${col.uid}${suspect(row, col) ? ", suspect" : ""}`}
                            title={suspect(row, col) ? "Suspect: an item changed since this was confirmed" : undefined}
                          >
                            {suspect(row, col) ? "⚠" : "●"}
                          </span>
                        )}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}
