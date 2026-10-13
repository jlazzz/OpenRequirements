import { Alert, Box, Flex, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useParams } from "@tanstack/react-router";
import { api, type ProjectDetail } from "./api.ts";
import { RouterNavLink } from "./links.tsx";

function useProject() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  return useQuery({ queryKey: ["projects", projectId], queryFn: () => api<ProjectDetail>(`projects/${projectId}`) });
}

/** Project frame: explorer on the left, the selected set on the right. */
export function ProjectPage() {
  const project = useProject();
  const { setId } = useParams({ strict: false });

  if (project.isPending) return null;
  if (project.isError) {
    return (
      <Alert color="red" role="alert" m="lg">
        {project.error.message}
      </Alert>
    );
  }
  const { project: info, sets } = project.data;

  return (
    <Flex h="100%">
      <Box
        component="nav"
        aria-label="Explorer"
        w={280}
        bg="gray.0"
        style={{ borderRight: "1px solid var(--mantine-color-gray-3)", overflow: "auto", flexShrink: 0 }}
      >
        <Text fw={700} p="sm" pb="xs">
          {info.name}
        </Text>
        {sets.map((set) => (
          <RouterNavLink
            key={set.id}
            to="/projects/$projectId/sets/$setId"
            params={{ projectId: info.id, setId: set.id }}
            label={set.name}
            description={set.uidPrefix}
            active={set.id === setId}
            aria-current={set.id === setId ? "page" : undefined}
          />
        ))}
      </Box>
      <Box flex={1} p="lg" style={{ overflow: "auto" }}>
        <Outlet />
      </Box>
    </Flex>
  );
}

export function ProjectHome() {
  const project = useProject();
  return (
    <Stack gap="xs">
      <Title order={1} size="h2">
        {project.data?.project.name}
      </Title>
      <Text c="dimmed">Choose a set in the explorer on the left.</Text>
    </Stack>
  );
}

export function SetPage() {
  const project = useProject();
  const { setId } = useParams({ from: "/projects/$projectId/sets/$setId" });
  const set = project.data?.sets.find((s) => s.id === setId);
  if (!set) return <Alert color="red">Set not found.</Alert>;

  return (
    <Stack gap="xs">
      <Title order={1} size="h2">
        {set.name}
      </Title>
      <Text c="dimmed" size="sm">
        Item type: {set.itemType} · UID prefix: {set.uidPrefix}
      </Text>
      <Text c="dimmed">No items yet.</Text>
    </Stack>
  );
}
