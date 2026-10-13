import { ActionIcon, Alert, Box, Button, Flex, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { api, type ProjectDetail, type TreeNode } from "./api.ts";
import { RouterNavLink } from "./links.tsx";

export function useProject() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  return useQuery({ queryKey: ["projects", projectId], queryFn: () => api<ProjectDetail>(`projects/${projectId}`) });
}

/** Children of a set (pass the set id) or of a folder (pass the folder's node id), in order. */
export function childrenOf(nodes: TreeNode[], containerId: string) {
  return nodes.filter((n) => (n.parentId ?? n.setId) === containerId);
}

/** Every item inside a set or folder, including those in sub-folders, in explorer order. */
export function itemsWithin(nodes: TreeNode[], containerId: string): TreeNode[] {
  return childrenOf(nodes, containerId).flatMap((n) => (n.kind === "item" ? [n] : itemsWithin(nodes, n.id)));
}

/** Project frame: explorer on the left, the selected set, folder or item on the right. */
export function ProjectPage() {
  const project = useProject();
  const selected = useParams({ strict: false });
  const navigate = useNavigate();
  // Everything starts expanded; this holds the ids the user has collapsed.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  if (project.isPending) return null;
  if (project.isError) {
    return (
      <Alert color="red" role="alert" m="lg">
        {project.error.message}
      </Alert>
    );
  }
  const { project: info, sets, nodes } = project.data;
  const selectedId = selected.nodeId ?? selected.setId;
  const toggle = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** One explorer level: each row is an expand button (when it has children) and a link. */
  const branch = (containerId: string | null, depth: number) => {
    const rows = containerId
      ? childrenOf(nodes, containerId).map((node) => ({ id: node.id, node, set: undefined }))
      : sets.map((set) => ({ id: set.id, node: undefined, set }));
    if (rows.length === 0) return null;
    return (
      <Box component="ul" m={0} p={0} style={{ listStyle: "none" }}>
        {rows.map(({ id, node, set }) => {
          const label = set ? set.name : node.kind === "item" ? `${node.uid} ${node.name}` : node.name;
          const hasChildren = nodes.some((n) => (n.parentId ?? n.setId) === id);
          const open = !collapsed.has(id);
          const link = {
            label,
            active: id === selectedId,
            "aria-current": id === selectedId ? ("page" as const) : undefined,
            py: 4,
            fw: set ? 600 : undefined,
          };
          return (
            <li key={id}>
              <Group gap={0} wrap="nowrap" pl={depth * 16 + 4}>
                {hasChildren ? (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
                    onClick={() => toggle(id)}
                  >
                    {open ? "▾" : "▸"}
                  </ActionIcon>
                ) : (
                  <Box w={22} style={{ flexShrink: 0 }} />
                )}
                {set ? (
                  <RouterNavLink
                    to="/projects/$projectId/sets/$setId"
                    params={{ projectId: info.id, setId: id }}
                    {...link}
                  />
                ) : (
                  <RouterNavLink
                    to={
                      node.kind === "folder"
                        ? "/projects/$projectId/folders/$nodeId"
                        : "/projects/$projectId/items/$nodeId"
                    }
                    params={{ projectId: info.id, nodeId: id }}
                    {...link}
                  />
                )}
              </Group>
              {hasChildren && open && branch(id, depth + 1)}
            </li>
          );
        })}
      </Box>
    );
  };

  return (
    <Flex h="100%">
      <Box
        component="nav"
        aria-label="Explorer"
        w={300}
        bg="gray.0"
        style={{ borderRight: "1px solid var(--mantine-color-gray-3)", overflow: "auto", flexShrink: 0 }}
      >
        <Text fw={700} p="sm" pb="xs">
          {info.name}
        </Text>
        <search>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const q = String(new FormData(event.currentTarget).get("q")).trim();
              if (q) navigate({ to: "/projects/$projectId/search", params: { projectId: info.id }, search: { q } });
            }}
          >
            <TextInput
              name="q"
              aria-label="Search this project"
              placeholder="Search this project"
              size="xs"
              mx="sm"
              mb="xs"
            />
          </form>
        </search>
        {branch(null, 0)}
        <RouterNavLink
          to="/projects/$projectId/matrix"
          params={{ projectId: info.id }}
          label="Traceability matrix"
          mt="sm"
          pl={26}
          py={4}
        />
        <RouterNavLink
          to="/projects/$projectId/baselines"
          params={{ projectId: info.id }}
          label="Baselines"
          pl={26}
          py={4}
        />
        <RouterNavLink
          to="/projects/$projectId/activity"
          params={{ projectId: info.id }}
          label="Activity"
          pl={26}
          py={4}
        />
        <RouterNavLink
          to="/projects/$projectId/members"
          params={{ projectId: info.id }}
          label="Members"
          pl={26}
          py={4}
        />
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
      {project.data?.role === "admin" && (
        <div>
          <Button
            component="a"
            href={`/api/projects/${project.data.project.id}/backup`}
            download
            variant="default"
            mt="md"
          >
            Download backup
          </Button>
          <Text c="dimmed" size="sm" mt={4} maw={560}>
            One file with every item, version, relationship, comment, baseline and image of this project. An instance
            administrator can restore it as a new project from the Projects page.
          </Text>
        </div>
      )}
    </Stack>
  );
}
