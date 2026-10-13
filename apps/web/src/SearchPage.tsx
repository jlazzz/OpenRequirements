import { Alert, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { api } from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { useProject } from "./ProjectPage.tsx";

/** Items of the project whose ID, name, description or field values contain every word searched for. */
export function SearchPage() {
  const project = useProject().data;
  const { q = "" } = useSearch({ from: "/projects/$projectId/search" });
  const projectId = project?.project.id ?? "";
  const found = useQuery({
    queryKey: ["projects", projectId, "search", q],
    queryFn: () => api<{ ids: string[] }>(`projects/${projectId}/search?q=${encodeURIComponent(q)}`),
    enabled: Boolean(project && q),
  });
  if (!project) return null;
  const ids = new Set(found.data?.ids);
  // Explorer order, so results from one set stay together.
  const results = project.nodes.filter((n) => ids.has(n.id));

  return (
    <Stack gap="sm">
      <Title order={1} size="h2">
        Search: {q}
      </Title>
      {found.isError && (
        <Alert color="red" role="alert">
          {found.error.message}
        </Alert>
      )}
      {found.data && (
        <Text c="dimmed" size="sm" aria-live="polite">
          {results.length} {results.length === 1 ? "item" : "items"} found
          {found.data.ids.length >= 200 ? " (showing the first 200)" : ""}
        </Text>
      )}
      {results.length > 0 && (
        <Table withTableBorder highlightOnHover bg="white" aria-label="Search results">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={130}>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Set</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {results.map((node) => (
              <Table.Tr key={node.id}>
                <Table.Td>{node.uid}</Table.Td>
                <Table.Td>
                  <RouterAnchor to="/projects/$projectId/items/$nodeId" params={{ projectId, nodeId: node.id }}>
                    {node.name}
                  </RouterAnchor>
                </Table.Td>
                <Table.Td>{project.sets.find((s) => s.id === node.setId)?.name}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
