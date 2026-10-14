import { toCsv } from "@app/importers";
import { Alert, Anchor, Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  download,
  evidenceName,
  isTestSet,
  type LastResult,
  type Outcome,
  type RequirementVerification,
} from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { useProject } from "./ProjectPage.tsx";
import { OutcomeBadge, resultText, statusText, VerificationBadge } from "./Verification.tsx";

/** The latest result of a test case, with who recorded it, in which cycle, and its evidence. */
type ReportResult = LastResult & {
  runAt: string;
  recordedBy: string;
  source: "manual" | "junit" | "run";
  runId: string | null;
  cycleId: string | null;
  cycle: string | null;
  defectUrl: string | null;
  evidence: { id: string; name: string | null }[];
};
type VerificationReport = {
  requirements: Record<string, RequirementVerification>;
  tests: Record<string, ReportResult>;
};
type Flaky = { tests: { itemId: string; outcomes: Outcome[] }[] };

const csvFile = (name: string, rows: (string | number)[][]) =>
  download(`${name}.csv`, new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
const day = (date: string) => new Date(date).toLocaleDateString();

/** Reports worked out from the stored results: what verifies each requirement, and which tests are flaky. */
export function ReportsPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const report = useQuery({
    queryKey: ["projects", projectId, "reports", "verification"],
    queryFn: () => api<VerificationReport>(`projects/${projectId}/reports/verification`),
    enabled: Boolean(project),
  });
  const flaky = useQuery({
    queryKey: ["projects", projectId, "reports", "flaky"],
    queryFn: () => api<Flaky>(`projects/${projectId}/reports/flaky`),
    enabled: Boolean(project),
  });
  if (!project) return null;
  const node = new Map(project.nodes.map((n) => [n.id, n]));
  const setName = new Map(project.sets.map((set) => [set.id, set.name]));
  const itemLink = (id: string) => (
    <>
      <RouterAnchor to="/projects/$projectId/items/$nodeId" params={{ projectId, nodeId: id }} size="sm">
        {node.get(id)?.uid}
      </RouterAnchor>{" "}
      {node.get(id)?.name}
    </>
  );
  const title = (id: string) => `${node.get(id)?.uid} ${node.get(id)?.name}`;
  // In the order of the explorer: set by set, as the project lists its items.
  const requirements = project.nodes.filter(
    (n) => n.kind === "item" && !isTestSet(project.sets.find((set) => set.id === n.setId)),
  );
  const where = (result: ReportResult) =>
    `${day(result.runAt)} · ${result.recordedBy}${result.cycle ? ` · ${result.cycle}` : result.source === "junit" ? " · from CI" : ""}`;

  const exportVerification = () =>
    csvFile(`${project.project.name} verification report`, [
      [
        "Set",
        "ID",
        "Name",
        "Verification",
        "Test ID",
        "Test",
        "Last result",
        "Run on",
        "By",
        "Cycle",
        "Evidence",
        "Defect",
      ],
      ...requirements.flatMap((item) => {
        const entry = report.data?.requirements[item.id];
        const head = [setName.get(item.setId) ?? "", item.uid ?? "", item.name, statusText(entry)];
        if (!entry || entry.tests.length === 0) return [head];
        return entry.tests.map((test) => {
          const result = report.data?.tests[test.itemId];
          return [
            ...head,
            node.get(test.itemId)?.uid ?? "",
            node.get(test.itemId)?.name ?? "",
            test.outcome ? resultText({ outcome: test.outcome, outOfDate: test.outOfDate }) : "Not run",
            result ? day(result.runAt) : "",
            result?.recordedBy ?? "",
            result?.cycle ?? "",
            result?.evidence.map((file) => `${location.origin}/api/attachments/${file.id}`).join(" ") ?? "",
            result?.defectUrl ?? "",
          ];
        });
      }),
    ]);

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} size="h2">
          Reports
        </Title>
        <Text c="dimmed" size="sm">
          Worked out from the results stored now. The summary of one cycle is on its own page, and the cycles of a plan
          are compared on the plan's page.
        </Text>
      </div>
      {(report.isError || flaky.isError) && (
        <Alert color="red" role="alert">
          {(report.error ?? flaky.error)?.message}
        </Alert>
      )}

      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={2} size="h4">
            Requirement verification
          </Title>
          <Button size="compact-sm" variant="default" onClick={exportVerification} disabled={!report.data}>
            Export CSV
          </Button>
        </Group>
        {report.data && requirements.length === 0 && <Text c="dimmed">This project has no requirements yet.</Text>}
        {report.data && requirements.length > 0 && (
          <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Requirement verification report">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Requirement</Table.Th>
                <Table.Th w={220}>Verification</Table.Th>
                <Table.Th>Tests, with the latest result of each</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {requirements.map((item) => {
                const entry = report.data.requirements[item.id];
                return (
                  <Table.Tr key={item.id} style={{ verticalAlign: "top" }}>
                    <Table.Td>{itemLink(item.id)}</Table.Td>
                    <Table.Td>
                      <VerificationBadge entry={entry} />
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={6}>
                        {entry?.tests.map((test) => {
                          const result = report.data.tests[test.itemId];
                          return (
                            <div key={test.itemId}>
                              <Group gap={6}>
                                <Text size="sm">{itemLink(test.itemId)}</Text>
                                {test.outcome ? (
                                  <OutcomeBadge result={{ outcome: test.outcome, outOfDate: test.outOfDate }} />
                                ) : (
                                  <Text size="xs" c="dimmed">
                                    Not run
                                  </Text>
                                )}
                              </Group>
                              {result && (
                                <Group gap="xs">
                                  <Text size="xs" c="dimmed">
                                    {where(result)}
                                  </Text>
                                  {result.runId && (
                                    <RouterAnchor
                                      to="/projects/$projectId/runs/$testRunId"
                                      params={{ projectId, testRunId: result.runId }}
                                      size="xs"
                                    >
                                      Run
                                    </RouterAnchor>
                                  )}
                                  {result.evidence.map((file) => (
                                    <Anchor
                                      key={file.id}
                                      href={`/api/attachments/${file.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      size="xs"
                                    >
                                      {evidenceName({ name: file.name, contentType: "" })}
                                    </Anchor>
                                  ))}
                                  {result.defectUrl && (
                                    <Anchor href={result.defectUrl} target="_blank" rel="noreferrer" size="xs">
                                      Defect
                                    </Anchor>
                                  )}
                                </Group>
                              )}
                            </div>
                          );
                        })}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Stack gap="xs">
        <Group justify="space-between">
          <div>
            <Title order={2} size="h4">
              Flaky tests
            </Title>
            <Text c="dimmed" size="sm">
              Test cases whose last five results changed outcome more than once.
            </Text>
          </div>
          <Button
            size="compact-sm"
            variant="default"
            disabled={!flaky.data?.tests.length}
            onClick={() =>
              csvFile(`${project.project.name} flaky tests`, [
                ["ID", "Test case", "Last results, oldest first"],
                ...(flaky.data?.tests ?? []).map((test) => [
                  node.get(test.itemId)?.uid ?? "",
                  node.get(test.itemId)?.name ?? "",
                  test.outcomes.join(", "),
                ]),
              ])
            }
          >
            Export CSV
          </Button>
        </Group>
        {flaky.data?.tests.length === 0 && <Text c="dimmed">No flaky tests.</Text>}
        {flaky.data && flaky.data.tests.length > 0 && (
          <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Flaky tests" maw={900}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Test case</Table.Th>
                <Table.Th>Last results, oldest first</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {flaky.data.tests.map((test) => (
                <Table.Tr key={test.itemId} aria-label={title(test.itemId)}>
                  <Table.Td>{itemLink(test.itemId)}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {test.outcomes.map((outcome, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: a result here has no identity but its place in the list
                        <OutcomeBadge key={index} result={{ outcome, outOfDate: false }} />
                      ))}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Stack>
  );
}
