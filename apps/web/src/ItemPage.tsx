import { Alert, Badge, Group, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { api, type Item } from "./api.ts";

export function ItemPage() {
  const { nodeId } = useParams({ from: "/projects/$projectId/items/$nodeId" });
  const item = useQuery({ queryKey: ["items", nodeId], queryFn: () => api<{ item: Item }>(`items/${nodeId}`) });

  if (item.isPending) return null;
  if (item.isError) {
    return (
      <Alert color="red" role="alert">
        {item.error.message}
      </Alert>
    );
  }
  const { uid, name, description, revision, revisedAt } = item.data.item;

  return (
    <Stack gap="xs">
      <Group gap="sm">
        <Badge variant="light" size="lg" radius="sm">
          {uid}
        </Badge>
        <Title order={1} size="h2">
          {name}
        </Title>
      </Group>
      <Text c="dimmed" size="sm">
        Version {revision} · {new Date(revisedAt).toLocaleString()}
      </Text>
      <Text style={{ whiteSpace: "pre-wrap" }}>
        {description || (
          <Text c="dimmed" span>
            No description yet.
          </Text>
        )}
      </Text>
    </Stack>
  );
}
