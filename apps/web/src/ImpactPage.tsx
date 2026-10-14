import { Alert, Box, Group, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { api, type Impact, isSuspect, type TraceNode } from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { useProject } from "./ProjectPage.tsx";
import { SuspectBadge, useLinks } from "./Relationships.tsx";
import { StatusBadge } from "./Status.tsx";

/** Impact analysis: everything downstream of one item, and everything upstream of it, at any depth, as two trees. */
export function ImpactPage() {
  const { projectId, nodeId } = useParams({ from: "/projects/$projectId/items/$nodeId/impact" });
  const project = useProject().data;
  const links = useLinks(projectId);
  const impact = useQuery({
    queryKey: ["projects", projectId, "impact", nodeId],
    queryFn: () => api<Impact>(`items/${nodeId}/impact`),
  });
  const item = project?.nodes.find((n) => n.id === nodeId);
  if (!project || !item) return null;

  const nodeOf = new Map(project.nodes.map((n) => [n.id, n]));
  const setName = new Map(project.sets.map((s) => [s.id, s.name]));
  const linkOf = new Map((links.data?.links ?? []).map((l) => [l.id, l]));
  const typeName = new Map((links.data?.linkTypes ?? []).map((t) => [t.id, t.name]));
  const distinct = (nodes: TraceNode[], found = new Set<string>()) => {
    for (const node of nodes) {
      if (node.itemId !== nodeId) found.add(node.itemId);
      distinct(node.children, found);
    }
    return found;
  };

  const tree = (nodes: TraceNode[]) => (
    <Box component="ul" m={0} pl={20} style={{ listStyle: "none" }}>
      {nodes.map((node) => {
        const related = nodeOf.get(node.itemId);
        const link = linkOf.get(node.linkId);
        if (!related) return null;
        return (
          <li key={node.linkId}>
            <Group gap={8} py={3} wrap="nowrap">
              <Text size="sm">
                <RouterAnchor
                  to="/projects/$projectId/items/$nodeId"
                  params={{ projectId, nodeId: related.id }}
                  inherit
                >
                  {related.uid}
                </RouterAnchor>{" "}
                {related.name}
              </Text>
              <StatusBadge status={related.status} />
              {link && isSuspect(link) && <SuspectBadge />}
              <Text size="xs" c="dimmed">
                {[setName.get(related.setId), link && typeName.get(link.typeId)].filter(Boolean).join(" · ")}
                {node.stop === "loop" && " · ↺ loop: already on this path"}
                {node.stop === "repeat" && " · shown above"}
              </Text>
            </Group>
            {node.children.length > 0 && tree(node.children)}
          </li>
        );
      })}
    </Box>
  );
  const section = (heading: string, hint: string, nodes: TraceNode[]) => (
    <section>
      <Title order={2} size="h4">
        {heading} ({distinct(nodes).size})
      </Title>
      <Text size="sm" c="dimmed" mb={4}>
        {hint}
      </Text>
      {nodes.length === 0 ? (
        <Text size="sm" c="dimmed">
          None
        </Text>
      ) : (
        <Box
          bg="var(--mantine-color-body)"
          py="xs"
          pr="md"
          style={{ border: "1px solid var(--mantine-color-default-border)", overflowX: "auto" }}
        >
          {tree(nodes)}
        </Box>
      )}
    </section>
  );

  return (
    <Stack gap="md">
      <div>
        <Title order={1} size="h2">
          Impact analysis
        </Title>
        <Group gap={8}>
          <Text>
            <RouterAnchor to="/projects/$projectId/items/$nodeId" params={{ projectId, nodeId }} inherit>
              {item.uid}
            </RouterAnchor>{" "}
            {item.name}
          </Text>
          <StatusBadge status={item.status} />
        </Group>
      </div>
      {impact.isError && (
        <Alert color="red" role="alert">
          {impact.error.message}
        </Alert>
      )}
      {impact.data && (
        <>
          {section("Downstream", "Items that may need to change if this item changes.", impact.data.downstream)}
          {section("Upstream", "Items this one exists because of.", impact.data.upstream)}
        </>
      )}
    </Stack>
  );
}
