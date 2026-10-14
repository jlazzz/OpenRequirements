import { toCsv } from "@app/importers";
import { tracePaths } from "@app/shared";
import { Alert, Button, Group, NativeSelect, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import {
  api,
  download,
  isSuspect,
  isTestSet,
  type ProjectDetail,
  type ProjectSet,
  type SetTrace,
  type TraceNode,
  type TreeNode,
} from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { itemsWithin } from "./ProjectPage.tsx";
import { useLinks } from "./Relationships.tsx";
import { StatusBadge } from "./Status.tsx";
import { OutcomeBadge, STATUSES, statusText, useVerification, VerificationBadge } from "./Verification.tsx";

type Props = { data: ProjectDetail; set: ProjectSet; containerId: string; title: string };
const LEVELS = ["0", "1", "2", "3", "4"];
const PAGE = 100;

/**
 * Trace view: one block of rows per item, its upstream items in columns to the left and its downstream items
 * to the right, one column per level. An item with several related items spans their rows.
 */
export function TraceView({ data, set, containerId, title }: Props) {
  const projectId = data.project.id;
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const up = search.up ?? 1;
  const down = search.down ?? 2;
  const trace = useQuery({
    queryKey: ["projects", projectId, "trace", set.id, up, down, search.target, search.linkType, search.baseline],
    queryFn: () => {
      const q = new URLSearchParams({ up: String(up), down: String(down) });
      if (search.target) q.set("target", search.target);
      if (search.linkType) q.set("linkTypeId", search.linkType);
      if (search.baseline) q.set("baselineId", search.baseline);
      return api<SetTrace>(`sets/${set.id}/trace?${q}`);
    },
  });
  const baselines = useQuery({
    queryKey: ["projects", projectId, "baselines"],
    queryFn: () => api<{ baselines: { id: string; name: string }[] }>(`projects/${projectId}/baselines`),
  });
  const [shown, setShown] = useState(PAGE);
  const links = useLinks(projectId);
  const verification = useVerification(projectId).data;
  const testSets = new Set(data.sets.filter(isTestSet).map((s) => s.id));
  const go = (change: {
    up?: number;
    down?: number;
    target?: string;
    linkType?: string;
    baseline?: string;
    status?: string;
  }) => {
    setShown(PAGE);
    navigate({
      to: ".",
      search: {
        view: "trace",
        up,
        down,
        target: search.target,
        linkType: search.linkType,
        baseline: search.baseline,
        status: search.status,
        ...change,
      },
    });
  };

  const nodeOf = new Map(data.nodes.map((n) => [n.id, n]));
  // Tracing a baseline uses what was suspect then, not now.
  const suspect = new Set(trace.data?.suspectLinkIds ?? (links.data?.links ?? []).filter(isSuspect).map((l) => l.id));
  const traced = new Map((trace.data?.rows ?? []).map((r) => [r.itemId, r]));
  // Explorer order, and only the items of the folder when a folder is open.
  const allItems = itemsWithin(data.nodes, containerId);
  const statuses = [...new Set(allItems.map((i) => i.status).filter((x): x is string => Boolean(x)))].sort();
  const blocks = allItems.flatMap((item) => {
    if (search.status && item.status !== search.status) return [];
    const row = traced.get(item.id);
    if (!row) return [];
    const upstream = tracePaths(row.upstream);
    const downstream = tracePaths(row.downstream);
    const height = Math.max(1, upstream.length, downstream.length);
    return [{ item, row, upstream, downstream, height }];
  });
  // Columns left to right: the furthest upstream level first, the furthest downstream level last.
  const upLevels = Array.from({ length: up }, (_, i) => up - 1 - i);
  const downLevels = Array.from({ length: down }, (_, i) => i);

  const target = data.sets.find((s) => s.id === trace.data?.targetSetId);
  const uncovered = blocks.filter((b) => !b.row.hasDownstream).length;
  const reaching = blocks.filter((b) => b.row.reachesTarget).length;
  const statusOf = (item: TreeNode) => verification?.requirements[item.id];
  const verified = STATUSES.map(
    ({ value, label }) => `${blocks.filter((b) => statusOf(b.item)?.status === value).length} ${label.toLowerCase()}`,
  ).join(", ");

  const label = (node: TraceNode | undefined) => {
    const item = node && nodeOf.get(node.itemId);
    return item ? `${item.uid} ${item.name}` : "";
  };
  const exportCsv = () => {
    const csv = toCsv([
      [
        ...upLevels.map((l) => `Upstream ${l + 1}`),
        "ID",
        "Name",
        "State",
        ...(testSets.has(set.id) ? [] : ["Verification"]),
        ...downLevels.map((l) => `Downstream ${l + 1}`),
      ],
      ...blocks.flatMap((b) =>
        Array.from({ length: b.height }, (_, i) => [
          ...upLevels.map((l) => label(b.upstream[i]?.[l])),
          b.item.uid ?? "",
          b.item.name,
          b.item.status ?? "",
          ...(testSets.has(set.id) ? [] : [statusText(statusOf(b.item))]),
          ...downLevels.map((l) => label(b.downstream[i]?.[l])),
        ]),
      ),
    ]);
    download(`${title} trace.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  };

  // A test case shows its latest result. Other items show their status; "Not covered" only on the traced items themselves,
  // where it is the point, and not on every related user need.
  const itemCell = (item: TreeNode, traced = false) => (
    <Group gap={6} wrap="nowrap" align="flex-start">
      <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
        <RouterAnchor to="/projects/$projectId/items/$nodeId" params={{ projectId, nodeId: item.id }} inherit>
          {item.uid}
        </RouterAnchor>{" "}
        {item.name}
      </Text>
      <StatusBadge status={item.status} />
      {testSets.has(item.setId) ? (
        <OutcomeBadge result={verification?.tests[item.id]} />
      ) : (
        (traced || statusOf(item)?.status !== "not_covered") && <VerificationBadge entry={statusOf(item)} />
      )}
    </Group>
  );
  /** The cells of one level column for one block: a related item spans the rows of everything beyond it. */
  const levelCell = (paths: TraceNode[][], level: number, i: number, key: string) => {
    const node = paths[i]?.[level];
    if (i > 0 && paths[i - 1]?.[level] === node) return null;
    let span = 1;
    while (i + span < paths.length && paths[i + span]?.[level] === node) span++;
    const item = node && nodeOf.get(node.itemId);
    return (
      <Table.Td key={key} rowSpan={span} bg={node && suspect.has(node.linkId) ? "orange.0" : undefined}>
        {item && itemCell(item)}
        {node && suspect.has(node.linkId) && (
          <Text size="xs" c="orange.8">
            ⚠ Suspect
          </Text>
        )}
        {node?.stop === "loop" && (
          <Text size="xs" c="dimmed">
            ↺ Loop: already on this path
          </Text>
        )}
      </Table.Td>
    );
  };
  /** Pads a block's paths with empty ones, so the blank space below a short list merges into one cell. */
  const padded = (paths: TraceNode[][], height: number) => [
    ...paths,
    ...Array.from({ length: height - paths.length }, () => []),
  ];

  return (
    <>
      <Group gap="sm" align="flex-end" className="print-hide">
        <NativeSelect
          label="Upstream levels"
          data={LEVELS}
          value={String(up)}
          onChange={(e) => go({ up: Number(e.currentTarget.value) })}
        />
        <NativeSelect
          label="Downstream levels"
          data={LEVELS}
          value={String(down)}
          onChange={(e) => go({ down: Number(e.currentTarget.value) })}
        />
        <NativeSelect
          label="Coverage: reaches"
          data={[
            ...(target ? [] : [{ value: "", label: "Choose a set" }]),
            ...data.sets.filter((s) => s.id !== set.id).map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={target?.id ?? ""}
          onChange={(e) => go({ target: e.currentTarget.value })}
        />
        <NativeSelect
          label="Relationship type"
          data={[
            { value: "", label: "All" },
            ...(links.data?.linkTypes ?? []).map((t) => ({ value: t.id, label: t.name })),
          ]}
          value={search.linkType ?? ""}
          onChange={(e) => go({ linkType: e.currentTarget.value || undefined })}
        />
        <NativeSelect
          label="Status"
          data={[{ value: "", label: "Any" }, ...statuses]}
          value={search.status ?? ""}
          onChange={(e) => go({ status: e.currentTarget.value || undefined })}
        />
        <NativeSelect
          label="Trace of"
          data={[
            { value: "", label: "Current state" },
            ...(baselines.data?.baselines ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
          value={search.baseline ?? ""}
          onChange={(e) => go({ baseline: e.currentTarget.value || undefined })}
        />
        <Button variant="default" onClick={exportCsv} disabled={!trace.data}>
          Export CSV
        </Button>
      </Group>
      {trace.isError && (
        <Alert color="red" role="alert">
          {trace.error.message}
        </Alert>
      )}
      {trace.data && (
        <>
          <Text size="sm" c={uncovered > 0 ? "orange.8" : "dimmed"}>
            {uncovered} of {blocks.length} have no downstream relationship.
            {target && target.id !== set.id && ` ${reaching} of ${blocks.length} reach an item in ${target.name}.`}
          </Text>
          {verification && !testSets.has(set.id) && (
            <Text size="sm" c="dimmed">
              Verification: {verified}.
            </Text>
          )}
          <Table.ScrollContainer minWidth={(up + down + 1) * 240}>
            <Table withTableBorder withColumnBorders bg="var(--mantine-color-body)" aria-label={`Trace of ${title}`}>
              <Table.Thead>
                <Table.Tr>
                  {upLevels.map((l) => (
                    <Table.Th key={`u${l}`} w={240}>
                      Upstream {l + 1}
                    </Table.Th>
                  ))}
                  <Table.Th w={280}>{set.name}</Table.Th>
                  {downLevels.map((l) => (
                    <Table.Th key={`d${l}`} w={240}>
                      Downstream {l + 1}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {blocks.slice(0, shown).flatMap((b) => {
                  const upstream = padded(b.upstream, b.height);
                  const downstream = padded(b.downstream, b.height);
                  return Array.from({ length: b.height }, (_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the rows of a block have no identity of their own
                    <Table.Tr key={`${b.item.id}:${i}`} style={{ verticalAlign: "top" }}>
                      {upLevels.map((l) => levelCell(upstream, l, i, `u${l}`))}
                      {i === 0 && (
                        <Table.Th scope="row" rowSpan={b.height} fw={400} bg="var(--mantine-color-default-hover)">
                          {itemCell(b.item, true)}
                        </Table.Th>
                      )}
                      {downLevels.map((l) => levelCell(downstream, l, i, `d${l}`))}
                    </Table.Tr>
                  ));
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {blocks.length > shown && (
            <Button variant="default" className="print-hide" onClick={() => setShown(shown + PAGE)}>
              Show more ({shown} of {blocks.length} items shown)
            </Button>
          )}
        </>
      )}
    </>
  );
}
