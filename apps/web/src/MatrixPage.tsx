import { Alert, Group, Select, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { TreeNode } from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { itemsWithin, useProject } from "./ProjectPage.tsx";
import { useLinks } from "./Relationships.tsx";
import { StatusBadge, StatusDot } from "./Status.tsx";

/** Traceability matrix: the items of one set down the side, another set across the top, a mark where two are linked. */
export function MatrixPage() {
  const project = useProject().data;
  const search = useSearch({ from: "/projects/$projectId/matrix" });
  const navigate = useNavigate({ from: "/projects/$projectId/matrix" });
  const links = useLinks(project?.project.id ?? "");
  if (!project) return null;

  const { sets, nodes } = project;
  const rowSet = sets.find((s) => s.id === search.rows) ?? sets[0];
  const colSet = sets.find((s) => s.id === search.cols) ?? sets.find((s) => s.id !== rowSet?.id) ?? sets[0];
  if (!rowSet || !colSet) return <Alert color="red">This project has no sets.</Alert>;
  const rows = itemsWithin(nodes, rowSet.id);
  const cols = itemsWithin(nodes, colSet.id);
  const pairs = new Set(
    (links.data?.links ?? []).flatMap((l) => [
      `${l.upstreamId}:${l.downstreamId}`,
      `${l.downstreamId}:${l.upstreamId}`,
    ]),
  );
  const linked = (a: TreeNode, b: TreeNode) => pairs.has(`${a.id}:${b.id}`);
  const unlinked = rows.filter((row) => !cols.some((col) => linked(row, col))).length;
  const options = sets.map((s) => ({ value: s.id, label: s.name }));
  const choose = (key: "rows" | "cols") => (value: string | null) =>
    navigate({ search: (previous) => ({ ...previous, [key]: value ?? undefined }) });
  const item = (node: TreeNode) =>
    ({ to: "/projects/$projectId/items/$nodeId", params: { projectId: project.project.id, nodeId: node.id } }) as const;

  return (
    <Stack gap="sm">
      <Title order={1} size="h2">
        Traceability matrix
      </Title>
      <Group>
        <Select label="Rows" data={options} value={rowSet.id} onChange={choose("rows")} allowDeselect={false} />
        <Select label="Columns" data={options} value={colSet.id} onChange={choose("cols")} allowDeselect={false} />
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
          <Text size="sm" c={unlinked > 0 ? "orange.8" : "dimmed"}>
            {unlinked} of {rows.length} {rowSet.name} items have no relationship with any {colSet.name} item.
          </Text>
          <Table.ScrollContainer minWidth={240 + cols.length * 80}>
            <Table withTableBorder withColumnBorders bg="white" aria-label={`${rowSet.name} against ${colSet.name}`}>
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
                      <StatusBadge status={row.status} />
                    </Table.Th>
                    {cols.map((col) => (
                      <Table.Td key={col.id} ta="center" bg={linked(row, col) ? "blue.0" : undefined}>
                        {linked(row, col) && (
                          <span role="img" aria-label={`${row.uid} is linked to ${col.uid}`}>
                            ●
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
