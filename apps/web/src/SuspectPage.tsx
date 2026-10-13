import { Alert, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { canEdit, type LiveLink } from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { useProject } from "./ProjectPage.tsx";
import { useConfirmLinks, useLinks } from "./Relationships.tsx";

type End = "upstream" | "downstream";

/** Review queue: every relationship with an end that changed since it was confirmed, grouped by the item that changed. */
export function SuspectPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const links = useLinks(projectId);
  const confirm = useConfirmLinks(projectId);
  if (!project) return null;

  const editor = canEdit(project.role);
  const nodeOf = (id: string) => project.nodes.find((n) => n.id === id);
  const typeName = (id: string) => links.data?.linkTypes.find((t) => t.id === id)?.name ?? "";
  // A relationship whose two ends both changed is listed under both items.
  const groups = new Map<string, { link: LiveLink; end: End }[]>();
  for (const link of links.data?.links ?? []) {
    for (const end of ["upstream", "downstream"] as const) {
      if (!link.changed[end]) continue;
      const itemId = link[`${end}Id`];
      groups.set(itemId, [...(groups.get(itemId) ?? []), { link, end }]);
    }
  }
  const item = (nodeId: string) =>
    ({ to: "/projects/$projectId/items/$nodeId", params: { projectId, nodeId } }) as const;

  return (
    <Stack gap="sm" maw={900}>
      <div>
        <Title order={1} size="h2">
          Suspect links
        </Title>
        <Text c="dimmed" size="sm">
          A relationship is suspect when an item on either end got a new version after the relationship was made or last
          confirmed. Open the changed item and compare its versions, then confirm that the relationship still holds.
        </Text>
      </div>
      {(links.isError || confirm.isError) && (
        <Alert color="red" role="alert">
          {(links.error ?? confirm.error)?.message}
        </Alert>
      )}
      {links.data && groups.size === 0 && <Text c="dimmed">No suspect links. Nothing to review.</Text>}
      {[...groups].map(([itemId, rows]) => {
        const changed = nodeOf(itemId);
        if (!changed) return null;
        return (
          <Paper key={itemId} withBorder p="sm" component="section" aria-label={`Changed: ${changed.uid}`}>
            <Group justify="space-between" mb={4}>
              <Text size="sm">
                <RouterAnchor {...item(itemId)} fw={600}>
                  {changed.uid} {changed.name}
                </RouterAnchor>{" "}
                changed
              </Text>
              {editor && (
                <Button
                  size="compact-sm"
                  variant="default"
                  aria-label={`Confirm all for ${changed.uid}`}
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate(rows.map((r) => r.link))}
                >
                  Confirm all for this item
                </Button>
              )}
            </Group>
            <Table aria-label={`Suspect relationships of ${changed.uid}`}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Related item</Table.Th>
                  <Table.Th>Relationship</Table.Th>
                  <Table.Th>{changed.uid} changed</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(({ link, end }) => {
                  const other = nodeOf(end === "upstream" ? link.downstreamId : link.upstreamId);
                  if (!other) return null;
                  return (
                    <Table.Tr key={link.id}>
                      <Table.Td>
                        <RouterAnchor {...item(other.id)} size="sm">
                          {other.uid} {other.name}
                        </RouterAnchor>
                      </Table.Td>
                      <Table.Td>
                        {typeName(link.typeId)}, {end === "upstream" ? "downstream" : "upstream"}
                      </Table.Td>
                      <Table.Td>
                        version {link.confirmed[end]} → {link.current[end]}
                      </Table.Td>
                      <Table.Td ta="right">
                        {editor && (
                          <Button
                            size="compact-sm"
                            variant="default"
                            aria-label={`Confirm ${changed.uid} with ${other.uid}`}
                            disabled={confirm.isPending}
                            onClick={() => confirm.mutate([link])}
                          >
                            Confirm
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        );
      })}
    </Stack>
  );
}
