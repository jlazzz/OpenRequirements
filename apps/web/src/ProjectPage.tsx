import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Flex,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { api, type ProjectDetail, type ProjectSet, type TreeNode } from "./api.ts";
import { RouterAnchor, RouterNavLink } from "./links.tsx";

export function useProject() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  return useQuery({ queryKey: ["projects", projectId], queryFn: () => api<ProjectDetail>(`projects/${projectId}`) });
}

/** Children of a set (pass the set id) or of a folder (pass the folder's node id), in order. */
function childrenOf(nodes: TreeNode[], containerId: string) {
  return nodes.filter((n) => (n.parentId ?? n.setId) === containerId);
}

/** Project frame: explorer on the left, the selected set, folder or item on the right. */
export function ProjectPage() {
  const project = useProject();
  const selected = useParams({ strict: false });
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
        {branch(null, 0)}
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
  if (!project.data || !set) return <Alert color="red">Set not found.</Alert>;
  return <Container data={project.data} set={set} title={set.name} />;
}

export function FolderPage() {
  const project = useProject();
  const { nodeId } = useParams({ from: "/projects/$projectId/folders/$nodeId" });
  const folder = project.data?.nodes.find((n) => n.id === nodeId && n.kind === "folder");
  const set = project.data?.sets.find((s) => s.id === folder?.setId);
  if (!project.data || !folder || !set) return <Alert color="red">Folder not found.</Alert>;
  return <Container data={project.data} set={set} folder={folder} title={folder.name} />;
}

/** A set or one of its folders: what it contains, and buttons to add to it. */
function Container({
  data,
  set,
  folder,
  title,
}: {
  data: ProjectDetail;
  set: ProjectSet;
  folder?: TreeNode;
  title: string;
}) {
  const [adding, setAdding] = useState<"item" | "folder" | null>(null);
  const projectId = data.project.id;
  const rows = childrenOf(data.nodes, folder?.id ?? set.id);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1} size="h2">
            {title}
          </Title>
          <Text c="dimmed" size="sm">
            {folder ? `Folder in ${set.name}` : `Set of ${set.itemType} items`} · UID prefix {set.uidPrefix}
          </Text>
        </div>
        <Group gap="xs">
          <Button variant="default" onClick={() => setAdding("folder")}>
            Add folder
          </Button>
          <Button onClick={() => setAdding("item")}>Add item</Button>
        </Group>
      </Group>

      {rows.length === 0 ? (
        <Text c="dimmed">Nothing here yet.</Text>
      ) : (
        <Table withTableBorder highlightOnHover bg="white">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={120}>UID</Table.Th>
              <Table.Th>Name</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((node) => (
              <Table.Tr key={node.id}>
                <Table.Td>
                  {node.uid ?? (
                    <Text c="dimmed" size="sm" span>
                      Folder
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <RouterAnchor
                    to={
                      node.kind === "folder"
                        ? "/projects/$projectId/folders/$nodeId"
                        : "/projects/$projectId/items/$nodeId"
                    }
                    params={{ projectId, nodeId: node.id }}
                  >
                    {node.name}
                  </RouterAnchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={adding !== null}
        onClose={() => setAdding(null)}
        title={adding === "folder" ? "Add folder" : `Add ${set.itemType}`}
      >
        {adding && (
          <AddNodeForm
            kind={adding}
            projectId={projectId}
            setId={set.id}
            parentId={folder?.id}
            onDone={() => setAdding(null)}
          />
        )}
      </Modal>
    </Stack>
  );
}

function AddNodeForm(props: {
  kind: "item" | "folder";
  projectId: string;
  setId: string;
  parentId?: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: (name: string) =>
      api<{ node: TreeNode }>(`sets/${props.setId}/nodes`, { kind: props.kind, name, parentId: props.parentId }),
    onSuccess: async ({ node }) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", props.projectId] });
      props.onDone();
      if (node.kind === "item") {
        await navigate({
          to: "/projects/$projectId/items/$nodeId",
          params: { projectId: props.projectId, nodeId: node.id },
        });
      }
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(String(new FormData(event.currentTarget).get("name")));
  };

  return (
    <form onSubmit={onSubmit}>
      <Stack gap="sm">
        <TextInput name="name" label="Name" required maxLength={200} data-autofocus />
        {create.isError && (
          <Alert color="red" role="alert">
            {create.error.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Add
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
