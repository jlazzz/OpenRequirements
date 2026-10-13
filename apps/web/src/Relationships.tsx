import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, canEdit, isSuspect, type LiveLink, type ProjectDetail, type ProjectLinks, type TreeNode } from "./api.ts";
import { RouterAnchor } from "./links.tsx";

type Direction = "upstream" | "downstream";

/** Every live relationship of a project, shared by the item side panel, the List view and the matrix. */
export function useLinks(projectId: string) {
  return useQuery({
    queryKey: ["projects", projectId, "links"],
    queryFn: () => api<ProjectLinks>(`projects/${projectId}/links`),
  });
}

/** Confirms suspect relationships against the versions on screen. The server refuses if an item changed since. */
export function useConfirmLinks(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (links: LiveLink[]) =>
      api(`projects/${projectId}/links/confirm`, {
        links: links.map((l) => ({
          id: l.id,
          upstreamRevision: l.current.upstream,
          downstreamRevision: l.current.downstream,
        })),
      }),
    // Also after a refusal, so the screen shows the versions that are now current.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId, "links"] }),
  });
}

export function SuspectBadge() {
  return (
    <Badge color="orange" variant="light" size="sm" title="An item changed since this relationship was confirmed">
      Suspect
    </Badge>
  );
}

/** Side panel listing an item's upstream and downstream relationships, with add and remove. */
export function Relationships({ data, itemId }: { data: ProjectDetail; itemId: string }) {
  const projectId = data.project.id;
  const queryClient = useQueryClient();
  const links = useLinks(projectId);
  const [adding, setAdding] = useState<Direction | null>(null);
  const editor = canEdit(data.role);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["projects", projectId, "links"] });
  const remove = useMutation({
    mutationFn: (linkId: string) => api(`links/${linkId}`, undefined, "DELETE"),
    onSuccess: refresh,
  });

  const confirm = useConfirmLinks(projectId);

  const nodeOf = (id: string) => data.nodes.find((n) => n.id === id);
  const typeName = (id: string) => links.data?.linkTypes.find((t) => t.id === id)?.name ?? "";
  const mine = (links.data?.links ?? []).filter((l) => l.upstreamId === itemId || l.downstreamId === itemId);
  const section = (direction: Direction) => {
    const rows = mine
      .filter((l) => (direction === "upstream" ? l.downstreamId : l.upstreamId) === itemId)
      .map((link) => ({ link, other: nodeOf(direction === "upstream" ? link.upstreamId : link.downstreamId) }));
    return (
      <div>
        <Group justify="space-between" mb={2}>
          <Text size="sm" fw={600}>
            {direction === "upstream" ? "Upstream" : "Downstream"} ({rows.length})
          </Text>
          {editor && (
            <Button
              size="compact-xs"
              variant="default"
              aria-label={`Add ${direction} relationship`}
              onClick={() => setAdding(direction)}
            >
              Add
            </Button>
          )}
        </Group>
        {rows.length === 0 && (
          <Text size="sm" c="dimmed">
            None
          </Text>
        )}
        {rows.map(
          ({ link, other }) =>
            other && (
              <Group key={link.id} gap={4} wrap="nowrap" align="flex-start">
                <Box flex={1} miw={0}>
                  <RouterAnchor
                    to="/projects/$projectId/items/$nodeId"
                    params={{ projectId, nodeId: other.id }}
                    size="sm"
                  >
                    {other.uid} {other.name}
                  </RouterAnchor>
                  <Text size="xs" c="dimmed">
                    {typeName(link.typeId)}
                  </Text>
                  {isSuspect(link) && (
                    <Group gap={6} mt={2}>
                      <SuspectBadge />
                      {editor && (
                        <Button
                          size="compact-xs"
                          variant="default"
                          aria-label={`Confirm relationship with ${other.uid}`}
                          onClick={() => confirm.mutate([link])}
                          loading={confirm.isPending && confirm.variables?.[0]?.id === link.id}
                        >
                          Confirm
                        </Button>
                      )}
                    </Group>
                  )}
                </Box>
                {editor && (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Remove relationship with ${other.uid}`}
                    onClick={() => remove.mutate(link.id)}
                    loading={remove.isPending && remove.variables === link.id}
                  >
                    ×
                  </ActionIcon>
                )}
              </Group>
            ),
        )}
      </div>
    );
  };

  return (
    <Box component="aside" aria-label="Relationships">
      <Title order={2} size="h5" mb={4}>
        Relationships
      </Title>
      {(links.isError || remove.isError || confirm.isError) && (
        <Alert color="red" role="alert">
          {(links.error ?? remove.error ?? confirm.error)?.message}
        </Alert>
      )}
      <Stack gap="sm">
        {section("upstream")}
        {section("downstream")}
      </Stack>
      <Modal opened={adding !== null} onClose={() => setAdding(null)} title={`Add ${adding} relationship`}>
        {adding && links.data && (
          <AddRelationship
            data={data}
            links={links.data}
            itemId={itemId}
            direction={adding}
            onDone={async () => {
              await refresh();
              setAdding(null);
            }}
          />
        )}
      </Modal>
    </Box>
  );
}

const MAX_RESULTS = 20;

function AddRelationship(props: {
  data: ProjectDetail;
  links: ProjectLinks;
  itemId: string;
  direction: Direction;
  onDone: () => void;
}) {
  const { data, links, itemId, direction } = props;
  const [typeId, setTypeId] = useState(links.linkTypes[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const create = useMutation({
    mutationFn: (otherId: string) =>
      api("links", {
        typeId,
        upstreamId: direction === "upstream" ? otherId : itemId,
        downstreamId: direction === "upstream" ? itemId : otherId,
      }),
    onSuccess: props.onDone,
  });

  const linked = new Set(
    links.links.flatMap((l) =>
      l.upstreamId === itemId ? [l.downstreamId] : l.downstreamId === itemId ? [l.upstreamId] : [],
    ),
  );
  const setName = (node: TreeNode) => data.sets.find((s) => s.id === node.setId)?.name ?? "";
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const candidates = data.nodes.filter(
    (n) =>
      n.kind === "item" &&
      n.id !== itemId &&
      !linked.has(n.id) &&
      words.every((word) => `${n.uid} ${n.name}`.toLowerCase().includes(word)),
  );

  return (
    <Stack gap="sm">
      <Select
        label="Relationship type"
        data={links.linkTypes.map((t) => ({ value: t.id, label: t.name }))}
        value={typeId}
        onChange={setTypeId}
        allowDeselect={false}
      />
      <TextInput
        label={`Find the ${direction} item`}
        description="Search by ID or name. Items already linked to this one are not listed."
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        data-autofocus
      />
      {create.isError && (
        <Alert color="red" role="alert">
          {create.error.message}
        </Alert>
      )}
      <ScrollArea.Autosize mah={280}>
        {candidates.length === 0 && (
          <Text size="sm" c="dimmed">
            No matching items.
          </Text>
        )}
        {candidates.slice(0, MAX_RESULTS).map((node) => (
          <UnstyledButton
            key={node.id}
            display="block"
            w="100%"
            p={6}
            disabled={create.isPending}
            onClick={() => create.mutate(node.id)}
            className="mantine-focus-auto"
            style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}
          >
            <Text size="sm">
              {node.uid} {node.name}
            </Text>
            <Text size="xs" c="dimmed">
              {setName(node)}
            </Text>
          </UnstyledButton>
        ))}
        {candidates.length > MAX_RESULTS && (
          <Text size="xs" c="dimmed" pt={4}>
            Showing the first {MAX_RESULTS} of {candidates.length}. Type more to narrow the list.
          </Text>
        )}
      </ScrollArea.Autosize>
    </Stack>
  );
}
