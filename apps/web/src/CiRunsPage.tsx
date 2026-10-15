import { Anchor, Badge, Group, NativeSelect, Progress, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { api, type Outcome } from "./api.ts";
import { EmptyState } from "./help.tsx";
import { RouterAnchor } from "./links.tsx";
import { useProject } from "./ProjectPage.tsx";

type Counts = { passed: number; failed: number; skipped: number; unmatched: number };
type CiRun = Counts & {
  id: string;
  pipeline: string;
  branch: string;
  commit: string;
  buildUrl: string;
  createdBy: string;
  createdAt: string;
};
type CiRunDetail = {
  run: CiRun & { unmatchedNames: string[] };
  results: {
    id: string;
    itemId: string;
    uid: string | null;
    name: string;
    outcome: Outcome;
    revision: number;
    note: string;
    requirements: { id: string; uid: string | null; name: string }[];
  }[];
};

const when = (date: string) => new Date(date).toLocaleString();
const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : null);

function CountsBar({ run }: { run: Counts }) {
  const total = run.passed + run.failed + run.skipped + run.unmatched;
  const part = (value: number) => (total ? (value / total) * 100 : 0);
  return (
    <Stack gap={2}>
      <Progress.Root size="lg">
        <Progress.Section value={part(run.passed)} color="green" />
        <Progress.Section value={part(run.failed)} color="red" />
        <Progress.Section value={part(run.skipped)} color="gray" />
        <Progress.Section value={part(run.unmatched)} color="yellow" />
      </Progress.Root>
      <Text size="xs" c="dimmed">
        {run.passed} passed · {run.failed} failed · {run.skipped} skipped · {run.unmatched} unmatched
      </Text>
    </Stack>
  );
}

/** One row per CI upload, newest first, filterable by pipeline and branch. */
export function CiRunsPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const [pipeline, setPipeline] = useState("");
  const [branch, setBranch] = useState("");
  const query = new URLSearchParams();
  if (pipeline) query.set("pipeline", pipeline);
  if (branch) query.set("branch", branch);
  const runs = useQuery({
    queryKey: ["projects", projectId, "ci-runs", pipeline, branch],
    queryFn: () =>
      api<{ runs: CiRun[]; pipelines: string[]; branches: string[] }>(`projects/${projectId}/ci-runs?${query}`),
    enabled: Boolean(project),
  });
  if (!project) return null;
  const options = (all: string[], label: string) => [
    { value: "", label },
    ...all.filter(Boolean).map((v) => ({ value: v, label: v })),
  ];
  return (
    <Stack p="md" gap="md">
      <Title order={2}>CI runs</Title>
      <Group>
        <NativeSelect
          aria-label="Pipeline"
          value={pipeline}
          onChange={(e) => setPipeline(e.currentTarget.value)}
          data={options(runs.data?.pipelines ?? [], "All pipelines")}
        />
        <NativeSelect
          aria-label="Branch"
          value={branch}
          onChange={(e) => setBranch(e.currentTarget.value)}
          data={options(runs.data?.branches ?? [], "All branches")}
        />
      </Group>
      {runs.data?.runs.length === 0 && (
        <EmptyState page="verification" label="How to send CI results">
          No CI uploads yet. Send a JUnit report to <code>/api/projects/{projectId}/verification-results/junit</code>.
        </EmptyState>
      )}
      <Table>
        <Table.Tbody>
          {runs.data?.runs.map((run) => (
            <Table.Tr key={run.id}>
              <Table.Td>
                <RouterAnchor to="/projects/$projectId/ci-runs/$ciRunId" params={{ projectId, ciRunId: run.id }}>
                  {run.pipeline || "(no pipeline)"}
                </RouterAnchor>
                <Text size="xs" c="dimmed">
                  {run.branch || "no branch"}
                  {run.commit && ` · ${run.commit.slice(0, 8)}`}
                </Text>
              </Table.Td>
              <Table.Td w={320}>
                <CountsBar run={run} />
              </Table.Td>
              <Table.Td>
                <Text size="xs">{when(run.createdAt)}</Text>
                <Text size="xs" c="dimmed">
                  {run.createdBy}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

/** One upload: each reported test, the requirements it verifies, and the names that matched no test case. */
export function CiRunPage() {
  const { ciRunId } = useParams({ strict: false }) as { ciRunId: string };
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const detail = useQuery({
    queryKey: ["ci-runs", ciRunId],
    queryFn: () => api<CiRunDetail>(`ci-runs/${ciRunId}`),
  });
  const data = detail.data;
  if (!data) return null;
  const { run, results } = data;
  const build = safeUrl(run.buildUrl);
  return (
    <Stack p="md" gap="md">
      <RouterAnchor to="/projects/$projectId/ci-runs" params={{ projectId }} size="sm">
        CI runs
      </RouterAnchor>
      <Title order={2}>{run.pipeline || "CI run"}</Title>
      <Text size="sm" c="dimmed">
        {when(run.createdAt)} · {run.createdBy}
        {run.branch && ` · ${run.branch}`}
        {run.commit && ` · ${run.commit}`}
        {build && (
          <>
            {" · "}
            <Anchor href={build} target="_blank" rel="noreferrer" size="sm">
              build
            </Anchor>
          </>
        )}
      </Text>
      <CountsBar run={run} />
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Test case</Table.Th>
            <Table.Th>Outcome</Table.Th>
            <Table.Th>Verifies</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {results.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>
                <RouterAnchor to="/projects/$projectId/items/$nodeId" params={{ projectId, nodeId: r.itemId }}>
                  {r.uid}
                </RouterAnchor>{" "}
                {r.name}
                {r.note && (
                  <Text size="xs" c="dimmed">
                    {r.note}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Badge color={r.outcome === "pass" ? "green" : "red"}>{r.outcome}</Badge>
              </Table.Td>
              <Table.Td>
                {r.requirements.length === 0 && (
                  <Text size="sm" c="dimmed">
                    none
                  </Text>
                )}
                {r.requirements.map((q) => (
                  <div key={q.id}>
                    <RouterAnchor
                      to="/projects/$projectId/items/$nodeId"
                      params={{ projectId, nodeId: q.id }}
                      size="sm"
                    >
                      {q.uid}
                    </RouterAnchor>{" "}
                    {q.name}
                  </div>
                ))}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Title order={4}>
        Unmatched ({run.unmatched}) · skipped ({run.skipped})
      </Title>
      {run.unmatchedNames.length === 0 ? (
        <Text size="sm" c="dimmed">
          Every reported test named a test case.
        </Text>
      ) : (
        <Stack gap={2}>
          {run.unmatchedNames.map((name) => (
            <Text key={name} size="sm">
              {name}
            </Text>
          ))}
          {run.unmatched > run.unmatchedNames.length && (
            <Text size="xs" c="dimmed">
              Only the first {run.unmatchedNames.length} names are kept.
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
