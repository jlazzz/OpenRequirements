import { Alert, Button, Stack, Table, Text, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, canEdit } from "./api.ts";
import { useProject } from "./ProjectPage.tsx";

type Deleted = {
  id: string;
  kind: "folder" | "item";
  uid: string | null;
  name: string;
  set: string;
  deletedAt: string;
};

/** Deleted folders and items of the project. Nothing is ever removed for good, so everything here can come back. */
export function TrashPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const queryClient = useQueryClient();
  const trash = useQuery({
    queryKey: ["projects", projectId, "trash"],
    queryFn: () => api<{ deleted: Deleted[] }>(`projects/${projectId}/trash`),
    enabled: Boolean(project),
  });
  const restore = useMutation({
    mutationFn: (id: string) => api(`nodes/${id}/restore`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });
  if (!project) return null;

  return (
    <Stack gap="sm" maw={900}>
      <div>
        <Title order={1} size="h2">
          Deleted items
        </Title>
        <Text c="dimmed" size="sm">
          Restoring a folder brings back what was deleted with it. An item whose folder is still deleted comes back at
          the top of its set.
        </Text>
      </div>
      {(trash.isError || restore.isError) && (
        <Alert color="red" role="alert">
          {(trash.error ?? restore.error)?.message}
        </Alert>
      )}
      {trash.data?.deleted.length === 0 && <Text c="dimmed">Nothing has been deleted.</Text>}
      {trash.data && trash.data.deleted.length > 0 && (
        <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Deleted items">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Set</Table.Th>
              <Table.Th>Deleted</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {trash.data.deleted.map((node) => (
              <Table.Tr key={node.id}>
                <Table.Td>{node.kind === "folder" ? `Folder: ${node.name}` : `${node.uid} ${node.name}`}</Table.Td>
                <Table.Td>{node.set}</Table.Td>
                <Table.Td>{new Date(node.deletedAt).toLocaleString()}</Table.Td>
                <Table.Td ta="right">
                  {canEdit(project.role) && (
                    <Button
                      size="compact-sm"
                      variant="default"
                      aria-label={`Restore ${node.uid ?? node.name}`}
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(node.id)}
                    >
                      Restore
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
