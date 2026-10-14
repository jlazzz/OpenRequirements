import { ActionIcon, Alert, Box, Button, Flex, Group, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { api, canEdit, isSuspect, type ProjectDetail, type TreeNode } from "./api.ts";
import { RouterAnchor, RouterNavLink } from "./links.tsx";
import { useLinks } from "./Relationships.tsx";
import { KindIcon, StatusDot } from "./Status.tsx";
import { useVerification } from "./Verification.tsx";

export function useProject() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  return useQuery({ queryKey: ["projects", projectId], queryFn: () => api<ProjectDetail>(`projects/${projectId}`) });
}

/** Children of a set (pass the set id) or of a folder (pass the folder's node id), in order. */
export function childrenOf(nodes: TreeNode[], containerId: string) {
  return nodes.filter((n) => (n.parentId ?? n.setId) === containerId);
}

/** Every item inside a set, folder or item, including those in sub-folders and child items, in explorer order. */
export function itemsWithin(nodes: TreeNode[], containerId: string): TreeNode[] {
  return childrenOf(nodes, containerId).flatMap((n) => [
    ...(n.kind === "item" ? [n] : []),
    ...itemsWithin(nodes, n.id),
  ]);
}

/** Project frame: explorer on the left, the selected set, folder or item on the right. */
export function ProjectPage() {
  const project = useProject();
  const selected = useParams({ strict: false });
  const navigate = useNavigate();
  // Sets start open and folders closed, so a project with hundreds of items opens as a short list.
  // This holds the ids the user has switched the other way, and is remembered per browser.
  const [toggled, setToggled] = useLocalStorage<string[]>({
    key: `explorer-toggled:${selected.projectId}`,
    defaultValue: [],
  });
  const suspectCount = useLinks(selected.projectId ?? "").data?.links.filter(isSuspect).length;
  const nodeList = project.data?.nodes;
  const selectedNodeId = selected.nodeId;
  // Opens the folders around the selected item, so it is always visible after following a link.
  useEffect(() => {
    const closed: string[] = [];
    let at = nodeList?.find((n) => n.id === selectedNodeId);
    while (at?.parentId) {
      const parentId = at.parentId;
      closed.push(parentId);
      at = nodeList?.find((n) => n.id === parentId);
    }
    setToggled((previous) => {
      const missing = closed.filter((id) => !previous.includes(id));
      return missing.length > 0 ? [...previous, ...missing] : previous;
    });
  }, [nodeList, selectedNodeId, setToggled]);

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
    setToggled((previous) => (previous.includes(id) ? previous.filter((other) => other !== id) : [...previous, id]));
  // Folders and items that hold something: what "expand all" opens.
  const folderIds = nodes.filter((n) => nodes.some((child) => child.parentId === n.id)).map((n) => n.id);

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
          const open = Boolean(set) !== toggled.includes(id);
          const link = {
            label,
            active: id === selectedId,
            "aria-current": id === selectedId ? ("page" as const) : undefined,
            py: 1,
            px: 6,
            noWrap: true,
            // Lets a long name be cut short with "…" instead of widening the explorer.
            style: { flex: 1, minWidth: 0 },
            title: label,
            fw: set ? 600 : undefined,
            leftSection: <KindIcon kind={set ? "set" : node.kind} />,
            rightSection: node?.kind === "item" ? <StatusDot status={node.status} /> : undefined,
            styles: { section: { marginInlineEnd: 6 }, label: { fontSize: "var(--mantine-font-size-sm)" } },
          };
          return (
            <li key={id}>
              <Group gap={0} wrap="nowrap" pl={depth * 14 + 2}>
                {hasChildren ? (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="xs"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
                    onClick={() => toggle(id)}
                  >
                    {open ? "▾" : "▸"}
                  </ActionIcon>
                ) : (
                  <Box w={18} style={{ flexShrink: 0 }} />
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
    <Flex h="100%" className="print-flow">
      <Box
        component="nav"
        aria-label="Explorer"
        className="print-hide"
        w={320}
        miw={200}
        maw="60vw"
        bg="var(--mantine-color-default-hover)"
        // Drag the bottom-right corner to make the explorer wider or narrower.
        style={{
          borderRight: "1px solid var(--mantine-color-default-border)",
          overflowX: "hidden",
          overflowY: "auto",
          flexShrink: 0,
          resize: "horizontal",
        }}
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
        <Group gap={4} mx="sm" mb={4}>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => setToggled(folderIds)}
            disabled={folderIds.length === 0}
          >
            Expand all
          </Button>
          <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setToggled([])}>
            Collapse all
          </Button>
        </Group>
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
          to="/projects/$projectId/suspect"
          params={{ projectId: info.id }}
          label={suspectCount ? `Suspect links (${suspectCount})` : "Suspect links"}
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
          to="/projects/$projectId/reviews"
          params={{ projectId: info.id }}
          label="Reviews"
          pl={26}
          py={4}
        />
        <RouterNavLink
          to="/projects/$projectId/test-plans"
          params={{ projectId: info.id }}
          label="Test plans"
          pl={26}
          py={4}
        />
        <RouterNavLink
          to="/projects/$projectId/reports"
          params={{ projectId: info.id }}
          label="Reports"
          pl={26}
          py={4}
        />
        {canEdit(project.data?.role) && (
          <RouterNavLink
            to="/projects/$projectId/import"
            params={{ projectId: info.id }}
            label="Import ReqIF"
            pl={26}
            py={4}
          />
        )}
        <RouterNavLink
          to="/projects/$projectId/activity"
          params={{ projectId: info.id }}
          label="Activity"
          pl={26}
          py={4}
        />
        <RouterNavLink
          to="/projects/$projectId/trash"
          params={{ projectId: info.id }}
          label="Deleted items"
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
        {project.data?.role === "admin" && (
          <RouterNavLink
            to="/projects/$projectId/integrations"
            params={{ projectId: info.id }}
            label="Integrations"
            pl={26}
            py={4}
          />
        )}
      </Box>
      <Box flex={1} p="lg" className="print-flow" style={{ overflow: "auto" }}>
        <Outlet />
      </Box>
    </Flex>
  );
}

/** Per set: how many items, how many are not covered, how many relationships are suspect, and verification status. */
function Dashboard({ data }: { data: ProjectDetail }) {
  const links = useLinks(data.project.id).data;
  const verification = useVerification(data.project.id).data;
  const rows = data.sets.map((set) => {
    const items = data.nodes.filter((n) => n.setId === set.id && n.kind === "item");
    const ids = new Set(items.map((i) => i.id));
    const count = (status: string) => items.filter((i) => verification?.requirements[i.id]?.status === status).length;
    const tests = verification ? items.filter((i) => verification.tests[i.id]) : [];
    const suspect = (links?.links ?? []).filter(
      (l) => isSuspect(l) && (ids.has(l.upstreamId) || ids.has(l.downstreamId)),
    ).length;
    return {
      set,
      items: items.length,
      suspect,
      tests: tests.length,
      notCovered: count("not_covered"),
      notRun: count("not_run"),
      passing: count("passing"),
      failing: count("failing"),
    };
  });
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table withTableBorder aria-label="Sets of this project">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Set</Table.Th>
            <Table.Th>Items</Table.Th>
            <Table.Th>Not covered</Table.Th>
            <Table.Th>Suspect</Table.Th>
            <Table.Th>Verification</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => {
            const verified = r.notCovered + r.notRun + r.passing + r.failing > 0;
            return (
              <Table.Tr key={r.set.id}>
                <Table.Td>
                  <RouterAnchor
                    to="/projects/$projectId/sets/$setId"
                    params={{ projectId: data.project.id, setId: r.set.id }}
                  >
                    {r.set.name}
                  </RouterAnchor>
                </Table.Td>
                <Table.Td>{r.items}</Table.Td>
                <Table.Td>{verified ? r.notCovered : "–"}</Table.Td>
                <Table.Td c={r.suspect > 0 ? "orange.8" : undefined}>{r.suspect}</Table.Td>
                <Table.Td>
                  {verified
                    ? `${r.passing} passing, ${r.failing} failing, ${r.notRun} not run`
                    : r.tests > 0
                      ? `${r.tests} with results`
                      : "–"}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
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
      {project.data && <Dashboard data={project.data} />}
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
