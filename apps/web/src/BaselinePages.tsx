import { type BaselineChange, compareBaseline, type RichNode } from "@app/shared";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import {
  type Attributes,
  api,
  canEdit,
  formatValue,
  type Link,
  type RequirementVerification,
  type SetItems,
  type TreeNode,
} from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { itemsWithin, useProject } from "./ProjectPage.tsx";
import { useLinks } from "./Relationships.tsx";
import { ExportMenu } from "./Reqif.tsx";
import { RichView } from "./RichView.tsx";
import { StatusBadge } from "./Status.tsx";
import { useVerification, VerificationBadge } from "./Verification.tsx";
import { RevisionDiff } from "./Versions.tsx";

type Baseline = { id: string; name: string; setId: string | null; createdAt: string; author: string };
/** A folder or item as the baseline froze it. Items carry the revision that was current then. */
type Entry = TreeNode & { revision: number | null; description: RichNode | null; attributes: Attributes | null };
/** `suspect` is null when the baseline was made before suspect links were recorded. */
type BaselineDetail = {
  baseline: Baseline;
  entries: Entry[];
  links: (Link & { suspect: boolean | null })[];
  /** The verification status the baseline froze, by item id. Empty for a baseline made before status was frozen. */
  verification: Record<string, Pick<RequirementVerification, "status" | "outOfDate">>;
};

/** The project's baselines, newest first, and the form to make a new one. */
export function BaselinesPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const queryClient = useQueryClient();
  const queryKey = ["projects", projectId, "baselines"];
  const list = useQuery({
    queryKey,
    queryFn: () => api<{ baselines: Baseline[] }>(`projects/${projectId}/baselines`),
    enabled: Boolean(project),
  });
  const create = useMutation({
    mutationFn: (body: { name: string; setId?: string }) => api(`projects/${projectId}/baselines`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  if (!project) return null;
  const scope = (setId: string | null) =>
    setId ? (project.sets.find((s) => s.id === setId)?.name ?? "A set") : "Whole project";
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    create.mutate(
      { name: String(fields.get("name")), setId: String(fields.get("setId")) || undefined },
      { onSuccess: () => form.reset() },
    );
  };

  return (
    <Stack gap="md" maw={820}>
      <div>
        <Title order={1} size="h2">
          Baselines
        </Title>
        <Text c="dimmed" size="sm">
          A baseline is a named, frozen copy of a set or of the whole project. It never changes afterwards.
        </Text>
      </div>
      {(list.isError || create.isError) && (
        <Alert color="red" role="alert">
          {(list.error ?? create.error)?.message}
        </Alert>
      )}
      {list.data?.baselines.length === 0 && <Text c="dimmed">No baselines yet.</Text>}
      {list.data && list.data.baselines.length > 0 && (
        <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Baselines">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Covers</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>By</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.data.baselines.map((baseline) => (
              <Table.Tr key={baseline.id}>
                <Table.Td>
                  <RouterAnchor
                    to="/projects/$projectId/baselines/$baselineId"
                    params={{ projectId, baselineId: baseline.id }}
                    size="sm"
                  >
                    {baseline.name}
                  </RouterAnchor>
                </Table.Td>
                <Table.Td>{scope(baseline.setId)}</Table.Td>
                <Table.Td>{new Date(baseline.createdAt).toLocaleString()}</Table.Td>
                <Table.Td>{baseline.author}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {canEdit(project.role) && (
        <form onSubmit={onSubmit}>
          <Group align="flex-end">
            <TextInput name="name" label="New baseline" placeholder="Design review 1.0" required maxLength={200} />
            <NativeSelect
              name="setId"
              label="Covers"
              data={[
                { value: "", label: "Whole project" },
                ...project.sets.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <Button type="submit" loading={create.isPending}>
              Create baseline
            </Button>
          </Group>
        </form>
      )}
    </Stack>
  );
}

const BADGES: Record<BaselineChange, { color: string; label: string }> = {
  changed: { color: "yellow", label: "Changed since" },
  removed: { color: "red", label: "Deleted since" },
  added: { color: "green", label: "Added since" },
};

type Comparison = {
  from: { id: string; name: string };
  to: { id: string; name: string };
  items: { id: string; uid: string; name: string; change: BaselineChange }[];
  links: {
    id: string;
    upstreamUid: string;
    downstreamUid: string;
    change: "added" | "removed" | "suspect" | "unsuspect";
  }[];
  verification: {
    id: string;
    uid: string;
    name: string;
    from: { status: string; outOfDate: boolean };
    to: { status: string; outOfDate: boolean };
  }[];
};
const LINK_CHANGE = { added: "Added", removed: "Removed", suspect: "Became suspect", unsuspect: "No longer suspect" };
const state = (v: { status: string; outOfDate: boolean }) =>
  `${v.status.replace("_", " ")}${v.outOfDate ? " (out of date)" : ""}`;

/** Another baseline of the project picked from a list, and what differs between it and this one. */
function CompareWith({ projectId, baselineId }: { projectId: string; baselineId: string }) {
  const [other, setOther] = useState("");
  const list = useQuery({
    queryKey: ["projects", projectId, "baselines"],
    queryFn: () => api<{ baselines: Baseline[] }>(`projects/${projectId}/baselines`),
  });
  const result = useQuery({
    queryKey: ["baselines", baselineId, "compare", other],
    queryFn: () => api<Comparison>(`baselines/${baselineId}/compare?with=${other}`),
    enabled: other !== "",
  });
  const choices = (list.data?.baselines ?? []).filter((b) => b.id !== baselineId);
  if (choices.length === 0) return null;
  const data = result.data;
  return (
    <Stack gap="xs">
      <NativeSelect
        label="Compare with another baseline"
        value={other}
        onChange={(e) => setOther(e.currentTarget.value)}
        data={[{ value: "", label: "None" }, ...choices.map((b) => ({ value: b.id, label: b.name }))]}
        maw={360}
      />
      {result.isError && (
        <Alert color="red" role="alert">
          {result.error.message}
        </Alert>
      )}
      {data && (
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            From {data.from.name} to {data.to.name}:{" "}
            {data.items.length + data.links.length + data.verification.length === 0 && "no differences."}
          </Text>
          {data.items.map((i) => (
            <Text key={i.id} size="sm">
              {i.uid} {i.name}: {{ added: "Added", removed: "Removed", changed: "Changed" }[i.change]}
            </Text>
          ))}
          {data.links.map((l) => (
            <Text key={l.id} size="sm">
              {l.upstreamUid} → {l.downstreamUid}: {LINK_CHANGE[l.change]}
            </Text>
          ))}
          {data.verification.map((v) => (
            <Text key={v.id} size="sm">
              {v.uid} {v.name}: verification {state(v.from)} → {state(v.to)}
            </Text>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** One baseline: what it froze, set by set, with each item marked where it differs from the project now. */
export function BaselinePage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const { baselineId } = useParams({ from: "/projects/$projectId/baselines/$baselineId" });
  const detail = useQuery({
    queryKey: ["projects", projectId, "baselines", baselineId],
    queryFn: () => api<BaselineDetail>(`baselines/${baselineId}`),
  });
  const setId = detail.data?.baseline.setId;
  const sets = (project?.sets ?? []).filter((s) => detail.data && (!setId || s.id === setId));
  // The same queries List view uses, so the comparison is with exactly what the lists show now.
  const current = useQueries({
    queries: sets.map((set) => ({
      queryKey: ["projects", projectId, "sets", set.id],
      queryFn: () => api<SetItems>(`sets/${set.id}/items`),
    })),
  });
  const liveLinks = useLinks(projectId).data?.links;
  const verifiedNow = useVerification(projectId).data?.requirements;
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [shownId, setShownId] = useState<string | null>(null);

  if (detail.isError) {
    return (
      <Alert color="red" role="alert">
        {detail.error.message}
      </Alert>
    );
  }
  if (!project || !detail.data) return null;
  const { baseline, entries, verification } = detail.data;
  // An item's verification changed when what the baseline froze is not what is worked out now.
  const verifiedThen = (id: string) => {
    const then = verification[id];
    return then && { ...then, tests: [] };
  };
  const statusChanged = (id: string) => {
    const [then, now] = [verification[id], verifiedNow?.[id]];
    return then !== undefined && now !== undefined && (then.status !== now.status || then.outOfDate !== now.outOfDate);
  };
  const frozenById = new Map(entries.map((entry) => [entry.id, entry]));
  const uidOf = (id: string) => (frozenById.get(id) ?? project.nodes.find((n) => n.id === id))?.uid ?? "?";

  const sections = sets.map((set, index) => {
    const now = current[index]?.data;
    const frozen = itemsWithin(entries, set.id) as Entry[];
    const changes = now
      ? compareBaseline(
          frozen.map((e) => ({ id: e.id, revision: e.revision ?? 0 })),
          now.items,
        )
      : new Map<string, BaselineChange>();
    const added = itemsWithin(project.nodes, set.id).filter((n) => changes.get(n.id) === "added");
    const rows = [...frozen, ...added].filter(
      (row) => !differencesOnly || changes.has(row.id) || statusChanged(row.id),
    );
    const statusField = now?.fields.find((f) => f.name === "Status" && f.type === "enum")?.id ?? "";
    return { set, now, changes, rows, total: frozen.length, statusField };
  });
  const differences = sections.reduce((sum, section) => sum + section.changes.size, 0);
  const statusChanges = Object.keys(verification).filter(statusChanged).length;

  // Relationships: those the baseline froze against those live now, within what the baseline covers.
  const inScope = (id: string) =>
    !setId || (frozenById.get(id) ?? project.nodes.find((n) => n.id === id))?.setId === setId;
  const nowLinks = (liveLinks ?? []).filter((l) => inScope(l.upstreamId) || inScope(l.downstreamId));
  const frozenLinkIds = new Set(detail.data.links.map((l) => l.id));
  const nowLinkIds = new Set(nowLinks.map((l) => l.id));
  const arrow = (l: Link) => `${uidOf(l.upstreamId)} → ${uidOf(l.downstreamId)}`;
  const linksAdded = nowLinks.filter((l) => !frozenLinkIds.has(l.id)).map(arrow);
  const linksRemoved = liveLinks ? detail.data.links.filter((l) => !nowLinkIds.has(l.id)).map(arrow) : [];

  const shown = sections.flatMap((section) => {
    if (!shownId || !section.rows.some((row) => row.id === shownId)) return [];
    const item = section.now?.items.find((i) => i.id === shownId);
    return [{ ...section, frozen: frozenById.get(shownId), item, change: section.changes.get(shownId) }];
  })[0];

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1} size="h2">
            {baseline.name}
          </Title>
          <Text c="dimmed" size="sm">
            Baseline of {setId ? sets[0]?.name : "the whole project"} · created by {baseline.author} on{" "}
            {new Date(baseline.createdAt).toLocaleString()} ·{" "}
            {differences === 0 ? "no item has changed since" : `${differences} items differ now`}
            {statusChanges > 0 && ` · verification changed on ${statusChanges}`}
          </Text>
        </div>
        <Group>
          <Switch
            label="Only differences"
            checked={differencesOnly}
            onChange={(e) => setDifferencesOnly(e.currentTarget.checked)}
          />
          <ExportMenu path={`baselines/${baseline.id}`} />
        </Group>
      </Group>

      <CompareWith projectId={projectId} baselineId={baselineId} />

      {sections.map(({ set, changes, rows, total, statusField }) => (
        <section key={set.id}>
          <Title order={2} size="h4" mb={4}>
            {set.name}{" "}
            <Text span c="dimmed" size="sm" fw={400}>
              {total} {total === 1 ? "item" : "items"} in the baseline
            </Text>
          </Title>
          {rows.length === 0 ? (
            <Text c="dimmed" size="sm">
              {differencesOnly ? "No differences." : "No items."}
            </Text>
          ) : (
            <Table
              withTableBorder
              bg="var(--mantine-color-body)"
              aria-label={`${set.name} in baseline ${baseline.name}`}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={130}>ID</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th w={120}>Status then</Table.Th>
                  <Table.Th w={230}>Verification then</Table.Th>
                  <Table.Th w={200}>Folder</Table.Th>
                  <Table.Th w={90}>Version</Table.Th>
                  <Table.Th w={150}>Compared with now</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => {
                  const change = changes.get(row.id);
                  return (
                    <Table.Tr key={row.id}>
                      <Table.Td>
                        <UnstyledButton c="blue" fz="sm" onClick={() => setShownId(row.id)}>
                          {row.uid}
                        </UnstyledButton>
                      </Table.Td>
                      <Table.Td c={change === "added" ? "dimmed" : undefined}>{row.name}</Table.Td>
                      <Table.Td>
                        <StatusBadge status={frozenById.get(row.id)?.attributes?.[statusField]} />
                      </Table.Td>
                      <Table.Td>
                        <VerificationBadge entry={verifiedThen(row.id)} />
                        {statusChanged(row.id) && (
                          <Group gap={4} mt={2}>
                            <Text size="xs" c="dimmed">
                              Now:
                            </Text>
                            <VerificationBadge entry={verifiedNow?.[row.id]} />
                          </Group>
                        )}
                      </Table.Td>
                      <Table.Td>{change !== "added" && row.parentId && frozenById.get(row.parentId)?.name}</Table.Td>
                      <Table.Td>{frozenById.get(row.id)?.revision}</Table.Td>
                      <Table.Td>
                        {change && (
                          <Badge color={BADGES[change].color} variant="light" radius="sm">
                            {BADGES[change].label}
                          </Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </section>
      ))}

      <section>
        <Title order={2} size="h4" mb={4}>
          Relationships{" "}
          <Text span c="dimmed" size="sm" fw={400}>
            {detail.data.links.length} in the baseline
          </Text>
        </Title>
        {(!differencesOnly || linksAdded.length + linksRemoved.length === 0) && (
          <Text size="sm" c="dimmed">
            {detail.data.links.map((l) => `${arrow(l)}${l.suspect ? " (suspect)" : ""}`).join(" · ") || "None."}
          </Text>
        )}
        {linksAdded.length > 0 && <Text size="sm">Added since: {linksAdded.join(" · ")}</Text>}
        {linksRemoved.length > 0 && <Text size="sm">Removed since: {linksRemoved.join(" · ")}</Text>}
      </section>

      <Modal
        opened={shown !== undefined}
        onClose={() => setShownId(null)}
        size="lg"
        title={shown && `${uidOf(shownId ?? "")} ${(shown.frozen ?? shown.item)?.name}`}
      >
        {shown && (
          <Stack gap="sm">
            {shown.change === "added" && <Alert color="green">Added after this baseline. It is not part of it.</Alert>}
            {shown.change === "removed" && <Alert color="red">Deleted since this baseline.</Alert>}
            {shown.frozen && (
              <>
                <Text size="xs" c="dimmed">
                  As frozen in the baseline: version {shown.frozen.revision}
                </Text>
                <RichView doc={shown.frozen.description ?? { type: "doc" }} />
                {(shown.now?.fields ?? [])
                  .filter((field) => shown.frozen?.attributes?.[field.id] !== undefined)
                  .map((field) => (
                    <Text key={field.id} size="sm">
                      <Text span fw={600}>
                        {field.name}:
                      </Text>{" "}
                      {formatValue(shown.frozen?.attributes?.[field.id])}
                    </Text>
                  ))}
              </>
            )}
            {shown.change === "changed" && shown.frozen && shown.item && (
              <>
                <Divider label="Changed since the baseline" labelPosition="left" />
                <RevisionDiff
                  fields={shown.now?.fields ?? []}
                  before={{
                    number: shown.frozen.revision ?? 0,
                    name: shown.frozen.name,
                    description: shown.frozen.description ?? { type: "doc" },
                    attributes: shown.frozen.attributes ?? {},
                  }}
                  after={{ ...shown.item, number: shown.item.revision }}
                />
              </>
            )}
            {shown.item && (
              <RouterAnchor
                to="/projects/$projectId/items/$nodeId"
                params={{ projectId, nodeId: shown.item.id }}
                size="sm"
              >
                Open the current item
              </RouterAnchor>
            )}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
