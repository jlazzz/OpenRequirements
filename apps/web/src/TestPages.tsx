import { toCsv } from "@app/importers";
import { type RichNode, type Step, stepDoc } from "@app/shared";
import {
  Alert,
  Anchor,
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  FileButton,
  Group,
  Modal,
  NativeSelect,
  Progress,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import {
  api,
  canEdit,
  download,
  type Evidence,
  isTestSet,
  type Member,
  type Outcome,
  type RunState,
  type RunSummary,
  type TreeNode,
  uploadFile,
} from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { itemsWithin, useProject } from "./ProjectPage.tsx";
import { useLinks } from "./Relationships.tsx";
import { RichView } from "./RichView.tsx";
import { EvidenceLinks } from "./Verification.tsx";

type Counts = Record<RunState, number>;
type PlanRow = {
  id: string;
  name: string;
  createdAt: string;
  author: string;
  cases: number;
  cycles: number;
  openCycles: number;
};
type PlanDetail = {
  plan: { id: string; name: string; createdAt: string; author: string };
  /** The plan's test cases, in plan order. An empty group means no group. */
  cases: { itemId: string; group: string }[];
  cycles: {
    id: string;
    name: string;
    environment: string;
    baselineId: string | null;
    createdAt: string;
    closedAt: string | null;
    runs: Counts;
  }[];
};
/** Every cycle of a plan, oldest first, and the state each test case reached in each. */
type PlanHistoryData = {
  cycles: { id: string; name: string; createdAt: string }[];
  tests: { itemId: string; uid: string; name: string; states: Record<string, RunState> }[];
};
type CycleDetail = {
  cycle: {
    id: string;
    name: string;
    environment: string;
    planId: string;
    plan: string;
    /** The baseline the cycle verifies, when it names one. */
    baselineId: string | null;
    baseline: string | null;
    createdAt: string;
    author: string;
    closedAt: string | null;
    closedBy: string | null;
  };
  runs: RunSummary[];
};
type RunStep = Step & { outcome: Outcome | null; actual: string; by: string | null; at: string | null };
type RunDetail = {
  run: Omit<RunSummary, "done" | "total"> & {
    /** The frozen test case: what the cycle saw when it started. */
    description: RichNode;
    steps: RunStep[];
    result: { outcome: Outcome; note: string; defectUrl: string | null; at: string; by: string } | null;
    /** Evidence files, oldest first. */
    attachments: Evidence[];
  };
  cycle: { id: string; name: string; environment: string; closedAt: string | null; planId: string; plan: string };
  /** The same person's next unfinished run in the cycle. */
  nextRunId: string | null;
  canExecute: boolean;
};
type People = { members: Member[]; instanceAdmins: { userId: string; name: string }[] };

const RUN_STATE: Record<RunState, { label: string; color: string }> = {
  passed: { label: "Passed", color: "green" },
  failed: { label: "Failed", color: "red" },
  blocked: { label: "Blocked", color: "orange" },
  in_progress: { label: "In progress", color: "blue" },
  not_started: { label: "Not started", color: "gray" },
};
const STATES = Object.keys(RUN_STATE) as RunState[];
const OUTCOME: Record<Outcome, { label: string; color: string; key: string }> = {
  pass: { label: "Pass", color: "green", key: "p" },
  fail: { label: "Fail", color: "red", key: "f" },
  blocked: { label: "Blocked", color: "orange", key: "b" },
};
const OUTCOMES = Object.keys(OUTCOME) as Outcome[];
const NO_GROUP = "No group";
const when = (date: string) => new Date(date).toLocaleString();
const countRuns = (runs: { state: RunState }[]) => {
  const counts = Object.fromEntries(STATES.map((state) => [state, 0])) as Counts;
  for (const run of runs) counts[run.state] += 1;
  return counts;
};

export function RunStateBadge({ state }: { state: RunState }) {
  return (
    <Badge color={RUN_STATE[state].color} variant="light" radius="sm" size="sm" style={{ flexShrink: 0 }}>
      {RUN_STATE[state].label}
    </Badge>
  );
}

/** How the runs of a cycle stand, as one bar. The same numbers are given in words beside it. */
function RunProgress({ counts }: { counts: Counts }) {
  const total = STATES.reduce((sum, state) => sum + counts[state], 0);
  const words = STATES.filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${RUN_STATE[state].label.toLowerCase()}`)
    .join(", ");
  return (
    <Group gap="xs" wrap="nowrap">
      <Progress.Root size="lg" w={160} aria-hidden style={{ flexShrink: 0 }}>
        {STATES.filter((state) => state !== "not_started" && counts[state] > 0).map((state) => (
          <Progress.Section key={state} value={(counts[state] / total) * 100} color={RUN_STATE[state].color} />
        ))}
      </Progress.Root>
      <Text size="xs" c="dimmed">
        {words || "No runs"}
      </Text>
    </Group>
  );
}

const csvFile = (name: string, rows: (string | number)[][]) =>
  download(`${name}.csv`, new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));

/** Runs counted by state, one row per group or person, with a total. */
function Tally({ label, rows }: { label: string; rows: [string, Counts][] }) {
  return (
    <Table withTableBorder bg="var(--mantine-color-body)" aria-label={`Runs by ${label.toLowerCase()}`}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{label}</Table.Th>
          {STATES.map((state) => (
            <Table.Th key={state} w={110}>
              {RUN_STATE[state].label}
            </Table.Th>
          ))}
          <Table.Th w={80}>Runs</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(([name, counts]) => (
          <Table.Tr key={name}>
            <Table.Td>{name}</Table.Td>
            {STATES.map((state) => (
              <Table.Td key={state} c={counts[state] ? undefined : "dimmed"}>
                {counts[state]}
              </Table.Td>
            ))}
            <Table.Td>{STATES.reduce((sum, state) => sum + counts[state], 0)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Cycle summary: how the runs stand, by group and by the person they are assigned to. */
function CycleSummary({ name, runs }: { name: string; runs: RunSummary[] }) {
  const by = (key: (run: RunSummary) => string): [string, Counts][] => {
    const groups = new Map<string, RunSummary[]>();
    for (const run of runs) groups.set(key(run), [...(groups.get(key(run)) ?? []), run]);
    return [...groups].map(([label, members]) => [label, countRuns(members)]);
  };
  const groups = by((run) => run.group || NO_GROUP);
  const people = by((run) => run.assignee ?? "Nobody");
  const lines = (kind: string, rows: [string, Counts][]) =>
    rows.map(([label, counts]) => [kind, label, ...STATES.map((state) => counts[state])]);
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={2} size="h4">
          Summary
        </Title>
        <Button
          size="compact-sm"
          variant="default"
          onClick={() =>
            csvFile(`${name} summary`, [
              ["By", "Name", ...STATES.map((state) => RUN_STATE[state].label)],
              ...lines("Group", groups),
              ...lines("Assigned to", people),
            ])
          }
        >
          Export CSV
        </Button>
      </Group>
      <Tally label="Group" rows={groups} />
      <Tally label="Assigned to" rows={people} />
    </Stack>
  );
}

/** Plan history: the cycles of a plan side by side, one row per test case. This is how two cycles are compared. */
function PlanHistory({ projectId, planId, plan }: { projectId: string; planId: string; plan: string }) {
  const history = useQuery({
    queryKey: ["projects", projectId, "test-plans", planId, "history"],
    queryFn: () => api<PlanHistoryData>(`test-plans/${planId}/history`),
  });
  const [changedOnly, setChangedOnly] = useState(false);
  if (!history.data || history.data.cycles.length === 0) return null;
  const { cycles, tests } = history.data;
  const [previous, last] = cycles.slice(-2);
  // A test changed when its state in the last cycle is not what it was in the one before.
  const changed = (test: PlanHistoryData["tests"][number]) =>
    previous !== undefined && last !== undefined && test.states[previous.id] !== test.states[last.id];
  const shown = tests.filter((test) => !changedOnly || changed(test));
  const label = (state: RunState | undefined) => (state ? RUN_STATE[state].label : "");
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={2} size="h4">
          History
        </Title>
        <Group gap="sm">
          {cycles.length > 1 && (
            <Switch
              label="Only what changed in the last cycle"
              checked={changedOnly}
              onChange={(e) => setChangedOnly(e.currentTarget.checked)}
            />
          )}
          <Button
            size="compact-sm"
            variant="default"
            onClick={() =>
              csvFile(`${plan} history`, [
                ["ID", "Test case", ...cycles.map((cycle) => cycle.name)],
                ...shown.map((test) => [test.uid, test.name, ...cycles.map((cycle) => label(test.states[cycle.id]))]),
              ])
            }
          >
            Export CSV
          </Button>
        </Group>
      </Group>
      {shown.length === 0 ? (
        <Text c="dimmed">Nothing changed between the last two cycles.</Text>
      ) : (
        <Table.ScrollContainer minWidth={300 + 130 * cycles.length}>
          <Table withTableBorder withColumnBorders bg="var(--mantine-color-body)" aria-label="Cycles side by side">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Test case</Table.Th>
                {cycles.map((cycle) => (
                  <Table.Th key={cycle.id} w={130}>
                    <RouterAnchor
                      to="/projects/$projectId/cycles/$testCycleId"
                      params={{ projectId, testCycleId: cycle.id }}
                      size="sm"
                    >
                      {cycle.name}
                    </RouterAnchor>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((test) => (
                <Table.Tr key={test.itemId}>
                  <Table.Td fw={changed(test) ? 600 : undefined}>
                    <RouterAnchor
                      to="/projects/$projectId/items/$nodeId"
                      params={{ projectId, nodeId: test.itemId }}
                      size="sm"
                    >
                      {test.uid}
                    </RouterAnchor>{" "}
                    {test.name}
                  </Table.Td>
                  {cycles.map((cycle) => {
                    const state = test.states[cycle.id];
                    return (
                      <Table.Td key={cycle.id}>
                        {state ? (
                          <RunStateBadge state={state} />
                        ) : (
                          <Text size="xs" c="dimmed">
                            Not in the cycle
                          </Text>
                        )}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

/** Splits rows into their groups, in the order the groups first appear. */
function grouped<T extends { group: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
  return [...groups];
}

/** The project's test plans, and the form to make one. */
export function TestPlansPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const queryKey = ["projects", projectId, "test-plans"];
  const list = useQuery({
    queryKey,
    queryFn: () => api<{ plans: PlanRow[] }>(`projects/${projectId}/test-plans`),
    enabled: Boolean(project),
  });
  const create = useMutation({
    mutationFn: (name: string) => api<{ id: string }>(`projects/${projectId}/test-plans`, { name }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey });
      await navigate({ to: "/projects/$projectId/test-plans/$testPlanId", params: { projectId, testPlanId: id } });
    },
  });
  if (!project) return null;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(String(new FormData(event.currentTarget).get("name")));
  };

  return (
    <Stack gap="md" maw={900}>
      <div>
        <Title order={1} size="h2">
          Test plans
        </Title>
        <Text c="dimmed" size="sm">
          A test plan is a selection of test cases for a goal, such as a release. Each pass through a plan is a test
          cycle: one run per test case, executed step by step. A finished run records a result on its test case.
        </Text>
      </div>
      {(list.isError || create.isError) && (
        <Alert color="red" role="alert">
          {(list.error ?? create.error)?.message}
        </Alert>
      )}
      {list.data?.plans.length === 0 && <Text c="dimmed">No test plans yet.</Text>}
      {list.data && list.data.plans.length > 0 && (
        <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Test plans">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Test cases</Table.Th>
              <Table.Th>Cycles</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>By</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.data.plans.map((plan) => (
              <Table.Tr key={plan.id}>
                <Table.Td>
                  <RouterAnchor
                    to="/projects/$projectId/test-plans/$testPlanId"
                    params={{ projectId, testPlanId: plan.id }}
                    size="sm"
                  >
                    {plan.name}
                  </RouterAnchor>
                </Table.Td>
                <Table.Td>{plan.cases}</Table.Td>
                <Table.Td>
                  {plan.cycles}
                  {plan.openCycles > 0 && ` (${plan.openCycles} open)`}
                </Table.Td>
                <Table.Td>{when(plan.createdAt)}</Table.Td>
                <Table.Td>{plan.author}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {canEdit(project.role) && (
        <form onSubmit={onSubmit}>
          <Group align="flex-end" maw={560}>
            <TextInput
              name="name"
              label="New test plan"
              placeholder="Release 1.2 verification"
              required
              maxLength={200}
              flex={1}
            />
            <Button type="submit" loading={create.isPending}>
              Create
            </Button>
          </Group>
        </form>
      )}
    </Stack>
  );
}

/** One plan: its test cases in groups, its cycles, and for editors the forms to change the plan and start a cycle. */
export function TestPlanPage() {
  const project = useProject().data;
  const { projectId, testPlanId } = useParams({ from: "/projects/$projectId/test-plans/$testPlanId" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ["projects", projectId, "test-plans", testPlanId],
    queryFn: () => api<PlanDetail>(`test-plans/${testPlanId}`),
  });
  const links = useLinks(projectId).data;
  const baselines = useQuery({
    queryKey: ["projects", projectId, "baselines"],
    queryFn: () => api<{ baselines: { id: string; name: string }[] }>(`projects/${projectId}/baselines`),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [addGroup, setAddGroup] = useState("");
  const [moveGroup, setMoveGroup] = useState("");
  const [scope, setScope] = useState("all");
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  // Every change to the plan goes through here: afterwards the plan and the list of plans are read again.
  const change = useMutation({
    mutationFn: (request: () => Promise<unknown>) => request(),
    onSuccess: () => {
      setSelected([]);
      setDialog(null);
      return queryClient.invalidateQueries({ queryKey: ["projects", projectId, "test-plans"] });
    },
  });
  const start = useMutation({
    mutationFn: (body: object) => api<{ id: string }>(`test-plans/${testPlanId}/cycles`, body),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", projectId, "test-plans"] });
      await navigate({ to: "/projects/$projectId/cycles/$testCycleId", params: { projectId, testCycleId: id } });
    },
  });

  if (detail.isError) {
    return (
      <Alert color="red" role="alert">
        {detail.error.message}
      </Alert>
    );
  }
  if (!project || !detail.data) return null;
  const { plan, cases, cycles } = detail.data;
  const editor = canEdit(project.role);
  const nodes = new Map(project.nodes.map((node) => [node.id, node]));
  const groups = [...new Set(cases.map((c) => c.group).filter(Boolean))].sort();

  // Where test cases can be added from: a whole set of test cases, one of its folders, or every test case linked by
  // the verifying relationship type ("Verified by") to the items of another set.
  const testSets = project.sets.filter(isTestSet);
  const isTestCase = (id: string) => testSets.some((set) => set.id === nodes.get(id)?.setId);
  const pathOf = (folder: TreeNode): string => {
    const parent = folder.parentId ? nodes.get(folder.parentId) : undefined;
    return parent ? `${pathOf(parent)} / ${folder.name}` : folder.name;
  };
  const verifying = new Set(links?.linkTypes.filter((type) => type.role === "verifies").map((type) => type.id));
  const sources = [
    { group: "A whole set", items: testSets.map((set) => ({ value: `in:${set.id}`, label: set.name })) },
    {
      group: "A folder",
      items: project.nodes
        .filter((node) => node.kind === "folder" && isTestCase(node.id))
        .map((folder) => ({ value: `in:${folder.id}`, label: pathOf(folder) })),
    },
    {
      group: "Every test that verifies the items of",
      items: project.sets
        .filter((set) => !isTestSet(set))
        .map((set) => ({ value: `verifies:${set.id}`, label: set.name })),
    },
  ].filter((entry) => entry.items.length > 0);
  const itemsOf = (value: string): string[] => {
    const [kind = "", id = ""] = value.split(":");
    const inside = itemsWithin(project.nodes, id).map((node) => node.id);
    if (kind === "in") return inside;
    const verified = new Set(inside);
    const tests = (links?.links ?? [])
      .filter((link) => verifying.has(link.typeId) && verified.has(link.upstreamId) && isTestCase(link.downstreamId))
      .map((link) => link.downstreamId);
    return [...new Set(tests)];
  };
  const inPlan = new Set(cases.map((c) => c.itemId));
  const toAdd = source ? itemsOf(source).filter((id) => !inPlan.has(id)) : [];

  const onStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    start.mutate({
      name: String(form.get("name")),
      environment: String(form.get("environment")),
      baselineId: String(form.get("baselineId")) || undefined,
      ...(scope.startsWith("group:") ? { scope: "group", group: scope.slice(6) } : { scope }),
    });
  };
  const onRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    change.mutate(() => api(`test-plans/${testPlanId}`, { name }, "PATCH"));
  };
  const remove = () =>
    change.mutate(async () => {
      await api(`test-plans/${testPlanId}`, undefined, "DELETE");
      await navigate({ to: "/projects/$projectId/test-plans", params: { projectId } });
    });
  const toggle = (ids: string[], on: boolean) =>
    setSelected((previous) => (on ? [...new Set([...previous, ...ids])] : previous.filter((id) => !ids.includes(id))));

  return (
    <Stack gap="lg" maw={900}>
      <div>
        <Group justify="space-between">
          <Title order={1} size="h2">
            {plan.name}
          </Title>
          {editor && (
            <Group gap="xs">
              <Button variant="default" onClick={() => setDialog("rename")}>
                Rename
              </Button>
              <Button variant="default" color="red" onClick={() => setDialog("delete")}>
                Delete
              </Button>
            </Group>
          )}
        </Group>
        <Text c="dimmed" size="sm">
          Test plan · created by {plan.author} on {when(plan.createdAt)}
        </Text>
      </div>
      {(change.isError || start.isError) && (
        <Alert color="red" role="alert">
          {(change.error ?? start.error)?.message}
        </Alert>
      )}

      <Stack gap="sm">
        <Title order={2} size="h4">
          Test cycles
        </Title>
        {cycles.length === 0 && <Text c="dimmed">No cycle has been started from this plan.</Text>}
        {cycles.length > 0 && (
          <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Test cycles">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Environment</Table.Th>
                <Table.Th>Started</Table.Th>
                <Table.Th>State</Table.Th>
                <Table.Th>Runs</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cycles.map((cycle) => (
                <Table.Tr key={cycle.id}>
                  <Table.Td>
                    <RouterAnchor
                      to="/projects/$projectId/cycles/$testCycleId"
                      params={{ projectId, testCycleId: cycle.id }}
                      size="sm"
                    >
                      {cycle.name}
                    </RouterAnchor>
                  </Table.Td>
                  <Table.Td>{cycle.environment}</Table.Td>
                  <Table.Td>{when(cycle.createdAt)}</Table.Td>
                  <Table.Td>{cycle.closedAt ? "Closed" : "Open"}</Table.Td>
                  <Table.Td>
                    <RunProgress counts={cycle.runs} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {editor && cases.length > 0 && (
          <form onSubmit={onStart}>
            <Group align="flex-end" gap="sm">
              <TextInput name="name" label="New cycle" placeholder="Round 1" required maxLength={200} />
              <TextInput name="environment" label="Environment" placeholder="Bench 2, firmware 1.4" maxLength={200} />
              <NativeSelect
                label="Run"
                value={scope}
                onChange={(e) => setScope(e.currentTarget.value)}
                data={[
                  { value: "all", label: `All ${cases.length} test cases` },
                  ...groups.map((name) => ({ value: `group:${name}`, label: `Only the group “${name}”` })),
                  ...(cycles.length > 0
                    ? [{ value: "failed", label: "Only what failed or was blocked in the last cycle" }]
                    : []),
                ]}
              />
              <NativeSelect
                name="baselineId"
                label="Verifies baseline"
                data={[
                  { value: "", label: "None" },
                  ...(baselines.data?.baselines ?? []).map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
              <Button type="submit" loading={start.isPending}>
                Start cycle
              </Button>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Starting a cycle makes one run per test case and freezes the version each test case has now. A cycle that
              verifies a baseline is listed in the reviews of that baseline.
            </Text>
          </form>
        )}
      </Stack>

      <PlanHistory projectId={projectId} planId={testPlanId} plan={plan.name} />

      <Stack gap="sm">
        <Title order={2} size="h4">
          Test cases ({cases.length})
        </Title>
        {cases.length === 0 && <Text c="dimmed">This plan has no test cases yet.</Text>}
        {grouped(cases)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, members]) => {
            const ids = members.map((c) => c.itemId);
            const label = name || NO_GROUP;
            return (
              <Table key={name} withTableBorder bg="var(--mantine-color-body)" aria-label={`Test cases in ${label}`}>
                <Table.Thead>
                  <Table.Tr>
                    {editor && (
                      <Table.Th w={36}>
                        <Checkbox
                          aria-label={`Select all in ${label}`}
                          checked={ids.every((id) => selected.includes(id))}
                          onChange={(e) => toggle(ids, e.currentTarget.checked)}
                        />
                      </Table.Th>
                    )}
                    <Table.Th>
                      {label} ({members.length})
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {members.map(({ itemId }) => {
                    const node = nodes.get(itemId);
                    return (
                      <Table.Tr key={itemId}>
                        {editor && (
                          <Table.Td>
                            <Checkbox
                              aria-label={`Select ${node?.uid}`}
                              checked={selected.includes(itemId)}
                              onChange={(e) => toggle([itemId], e.currentTarget.checked)}
                            />
                          </Table.Td>
                        )}
                        <Table.Td>
                          <RouterAnchor
                            to="/projects/$projectId/items/$nodeId"
                            params={{ projectId, nodeId: itemId }}
                            size="sm"
                          >
                            {node?.uid}
                          </RouterAnchor>{" "}
                          {node?.name}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            );
          })}
        {editor && selected.length > 0 && (
          <Group align="flex-end" gap="sm">
            <Autocomplete
              label={`Group for the ${selected.length} selected`}
              description="Leave empty for no group."
              data={groups}
              maxLength={100}
              value={moveGroup}
              onChange={setMoveGroup}
            />
            <Button
              variant="default"
              loading={change.isPending}
              onClick={() =>
                change.mutate(() =>
                  api(`test-plans/${testPlanId}/cases`, { itemIds: selected, group: moveGroup }, "PATCH"),
                )
              }
            >
              Move to group
            </Button>
            <Button
              variant="default"
              loading={change.isPending}
              onClick={() => change.mutate(() => api(`test-plans/${testPlanId}/cases/remove`, { itemIds: selected }))}
            >
              Remove from plan
            </Button>
          </Group>
        )}
        {editor && (
          <Group align="flex-end" gap="sm">
            <Select
              label="Add test cases from"
              placeholder="Choose a set or folder"
              data={sources}
              value={source}
              onChange={setSource}
              searchable
              w={320}
            />
            <Autocomplete
              label="Into group"
              placeholder={NO_GROUP}
              data={groups}
              maxLength={100}
              value={addGroup}
              onChange={setAddGroup}
            />
            <Button
              disabled={toAdd.length === 0}
              loading={change.isPending}
              onClick={() =>
                change.mutate(async () => {
                  await api(`test-plans/${testPlanId}/cases`, { itemIds: toAdd, group: addGroup });
                  setSource(null);
                })
              }
            >
              {source ? `Add ${toAdd.length} test ${toAdd.length === 1 ? "case" : "cases"}` : "Add"}
            </Button>
          </Group>
        )}
      </Stack>

      <Modal
        opened={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "rename" ? "Rename test plan" : `Delete ${plan.name}?`}
      >
        <form onSubmit={onRename}>
          <Stack gap="sm">
            {dialog === "rename" ? (
              <TextInput name="name" label="Name" defaultValue={plan.name} required maxLength={200} data-autofocus />
            ) : (
              <Text size="sm">
                The plan leaves the list. Its cycles, their runs and the results they recorded are kept.
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              {dialog === "rename" ? (
                <Button type="submit" loading={change.isPending}>
                  Rename
                </Button>
              ) : (
                <Button color="red" onClick={remove} loading={change.isPending}>
                  Delete
                </Button>
              )}
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

/** One cycle: its runs in the plan's groups with state, assignee and progress. Editors assign runs and close the cycle. */
export function TestCyclePage() {
  const project = useProject().data;
  const { projectId, testCycleId } = useParams({ from: "/projects/$projectId/cycles/$testCycleId" });
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["projects", projectId, "test-cycles", testCycleId],
    queryFn: () => api<CycleDetail>(`test-cycles/${testCycleId}`),
  });
  const editor = canEdit(project?.role);
  const people = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => api<People>(`projects/${projectId}/members`),
    enabled: editor,
  });
  const [state, setState] = useState("");
  const [who, setWho] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [assignee, setAssignee] = useState("");
  const [closing, setClosing] = useState(false);
  const change = useMutation({
    mutationFn: (request: () => Promise<unknown>) => request(),
    onSuccess: () => {
      setSelected([]);
      setClosing(false);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "test-cycles"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "test-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["test-runs"] }),
      ]);
    },
  });

  if (detail.isError) {
    return (
      <Alert color="red" role="alert">
        {detail.error.message}
      </Alert>
    );
  }
  if (!project || !detail.data) return null;
  const { cycle, runs } = detail.data;
  const open = !cycle.closedAt;
  // Executing a run needs the Reviewer role or higher. Instance administrators are admins of every project.
  const able = new Map<string, string>();
  for (const admin of people.data?.instanceAdmins ?? []) able.set(admin.userId, admin.name);
  for (const member of people.data?.members ?? []) if (member.role !== "viewer") able.set(member.userId, member.name);
  const assignees = new Map(runs.flatMap((run) => (run.assigneeId ? [[run.assigneeId, run.assignee ?? ""]] : [])));
  const shown = runs
    .filter((run) => !state || run.state === state)
    .filter((run) => !who || (who === "none" ? !run.assigneeId : run.assigneeId === who));
  const shownIds = shown.map((run) => run.id);
  const toggle = (ids: string[], on: boolean) =>
    setSelected((previous) => (on ? [...new Set([...previous, ...ids])] : previous.filter((id) => !ids.includes(id))));

  return (
    <Stack gap="md" maw={1000}>
      <div>
        <Group justify="space-between">
          <Title order={1} size="h2">
            {cycle.name}
          </Title>
          {editor && open && (
            <Button variant="default" onClick={() => setClosing(true)}>
              Close cycle
            </Button>
          )}
        </Group>
        <Text c="dimmed" size="sm">
          Test cycle of{" "}
          <RouterAnchor
            to="/projects/$projectId/test-plans/$testPlanId"
            params={{ projectId, testPlanId: cycle.planId }}
            inherit
          >
            {cycle.plan}
          </RouterAnchor>
          {cycle.environment && ` · ${cycle.environment}`} · started by {cycle.author} on {when(cycle.createdAt)}
          {cycle.closedAt && ` · closed by ${cycle.closedBy} on ${when(cycle.closedAt)}`}
          {cycle.baselineId && (
            <>
              {" · verifies baseline "}
              <RouterAnchor
                to="/projects/$projectId/baselines/$baselineId"
                params={{ projectId, baselineId: cycle.baselineId }}
                inherit
              >
                {cycle.baseline}
              </RouterAnchor>
            </>
          )}
        </Text>
      </div>
      <RunProgress counts={countRuns(runs)} />
      {change.isError && (
        <Alert color="red" role="alert">
          {change.error.message}
        </Alert>
      )}
      <Group align="flex-end" gap="sm">
        <NativeSelect
          label="State"
          value={state}
          onChange={(e) => setState(e.currentTarget.value)}
          data={[
            { value: "", label: "Every state" },
            ...STATES.map((value) => ({ value, label: RUN_STATE[value].label })),
          ]}
        />
        <NativeSelect
          label="Assigned to"
          value={who}
          onChange={(e) => setWho(e.currentTarget.value)}
          data={[
            { value: "", label: "Anyone" },
            { value: "none", label: "Nobody" },
            ...[...assignees].map(([value, label]) => ({ value, label })),
          ]}
        />
        {editor && open && (
          <>
            <NativeSelect
              label={`Assign the ${selected.length} selected to`}
              value={assignee}
              onChange={(e) => setAssignee(e.currentTarget.value)}
              data={[
                { value: "", label: "Nobody" },
                ...[...able].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
              ]}
            />
            <Button
              variant="default"
              disabled={selected.length === 0}
              loading={change.isPending}
              onClick={() =>
                change.mutate(() =>
                  api(`test-cycles/${testCycleId}/assign`, { runIds: selected, assigneeId: assignee || null }),
                )
              }
            >
              Assign
            </Button>
          </>
        )}
      </Group>
      {shown.length === 0 && <Text c="dimmed">No runs match.</Text>}
      {shown.length > 0 && (
        <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Test runs">
          <Table.Thead>
            <Table.Tr>
              {editor && open && (
                <Table.Th w={36}>
                  <Checkbox
                    aria-label="Select all runs shown"
                    checked={shownIds.every((id) => selected.includes(id))}
                    onChange={(e) => toggle(shownIds, e.currentTarget.checked)}
                  />
                </Table.Th>
              )}
              <Table.Th>Test case</Table.Th>
              <Table.Th>Version</Table.Th>
              <Table.Th>Assigned to</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th>Steps</Table.Th>
            </Table.Tr>
          </Table.Thead>
          {grouped(shown).map(([name, members]) => (
            <Table.Tbody key={name}>
              {(name || grouped(runs).length > 1) && (
                <Table.Tr bg="var(--mantine-color-default-hover)">
                  <Table.Th colSpan={6} scope="rowgroup">
                    {name || NO_GROUP} ({members.length})
                  </Table.Th>
                </Table.Tr>
              )}
              {members.map((run) => (
                <Table.Tr key={run.id}>
                  {editor && open && (
                    <Table.Td>
                      <Checkbox
                        aria-label={`Select the run of ${run.uid}`}
                        checked={selected.includes(run.id)}
                        onChange={(e) => toggle([run.id], e.currentTarget.checked)}
                      />
                    </Table.Td>
                  )}
                  <Table.Td>
                    <RouterAnchor
                      to="/projects/$projectId/runs/$testRunId"
                      params={{ projectId, testRunId: run.id }}
                      size="sm"
                    >
                      {run.uid}
                    </RouterAnchor>{" "}
                    {run.name}
                  </Table.Td>
                  <Table.Td>{run.revision}</Table.Td>
                  <Table.Td c={run.assignee ? undefined : "dimmed"}>{run.assignee ?? "Nobody"}</Table.Td>
                  <Table.Td>
                    <RunStateBadge state={run.state} />
                    {run.finished || run.state === "not_started" || run.state === "in_progress"
                      ? ""
                      : " · not finished"}
                  </Table.Td>
                  <Table.Td>
                    {run.done} of {run.total}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          ))}
        </Table>
      )}

      <CycleSummary name={cycle.name} runs={runs} />

      <Modal opened={closing} onClose={() => setClosing(false)} title={`Close ${cycle.name}?`}>
        <Stack gap="sm">
          <Text size="sm">
            Closing is permanent. Nothing more can be recorded in this cycle, and runs that are not finished record no
            result.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setClosing(false)}>
              Cancel
            </Button>
            <Button
              loading={change.isPending}
              onClick={() => change.mutate(() => api(`test-cycles/${testCycleId}/close`, {}))}
            >
              Close cycle
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

/** The execution screen of one run. */
export function TestRunPage() {
  const { projectId, testRunId } = useParams({ from: "/projects/$projectId/runs/$testRunId" });
  const detail = useQuery({
    queryKey: ["projects", projectId, "test-runs", testRunId],
    queryFn: () => api<RunDetail>(`test-runs/${testRunId}`),
  });
  if (detail.isError) {
    return (
      <Alert color="red" role="alert">
        {detail.error.message}
      </Alert>
    );
  }
  // The key gives every run its own boxes for actual results.
  return detail.data ? <Execution key={testRunId} projectId={projectId} data={detail.data} /> : null;
}

/**
 * The frozen test case with one row per step: action, expected result, a box for what actually happened, and
 * Pass / Fail / Blocked. Keyboard: arrow keys choose a step, P, F and B record its result.
 */
function Execution({ projectId, data: { run, cycle, nextRunId, canExecute } }: { projectId: string; data: RunDetail }) {
  const queryClient = useQueryClient();
  const [actuals, setActuals] = useState(() => run.steps.map((step) => step.actual));
  const firstOpen = run.steps.findIndex((step) => !step.outcome);
  const [at, setAt] = useState(Math.max(firstOpen, 0));
  const [note, setNote] = useState("");
  const [defectUrl, setDefectUrl] = useState("");
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "test-runs"] }),
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "test-cycles"] }),
    ]);
  const record = useMutation({
    mutationFn: (body: { steps: number[]; outcome: Outcome; actual?: string }) =>
      api(`test-runs/${run.id}/steps`, body),
    onSuccess: async (_, { steps }) => {
      await refresh();
      // After a single step, move on to the next step that has no result yet.
      const next = run.steps.findIndex((step, index) => index > at && !step.outcome);
      if (steps.length === 1 && next >= 0) setAt(next);
    },
  });
  const finish = useMutation({
    mutationFn: () =>
      api(`test-runs/${run.id}/finish`, { note, ...(defectUrl.trim() && { defectUrl: defectUrl.trim() }) }),
    // The run recorded a verification result, so everything about the project is read again.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["test-runs"] }),
      ]),
  });
  // Evidence: each file is uploaded to the project, then attached to the run, on one step or on the whole test.
  const attach = useMutation({
    mutationFn: async ({ files, step }: { files: File[]; step?: number }) => {
      for (const file of files) {
        const { id } = await uploadFile(projectId, file);
        await api(`test-runs/${run.id}/attachments`, { attachmentId: id, step });
      }
    },
    onSettled: refresh,
  });
  const mark = (index: number, outcome: Outcome) =>
    record.mutate({ steps: [index + 1], outcome, actual: actuals[index] });
  const remaining = run.steps.flatMap((step, index) => (step.outcome ? [] : [index + 1]));

  useEffect(() => {
    if (!canExecute) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Typing in a box is typing, not a shortcut.
      if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const outcome = OUTCOMES.find((value) => OUTCOME[value].key === event.key.toLowerCase());
      if (outcome) mark(at, outcome);
      else if (event.key === "ArrowDown") setAt(Math.min(at + 1, run.steps.length - 1));
      else if (event.key === "ArrowUp") setAt(Math.max(at - 1, 0));
      else return;
      event.preventDefault();
    };
    // A pasted screenshot becomes evidence of the highlighted step. Pasted text has no files and is left alone.
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      attach.mutate({ files, step: at + 1 });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  });

  const cyclePage = (
    <RouterAnchor to="/projects/$projectId/cycles/$testCycleId" params={{ projectId, testCycleId: cycle.id }} inherit>
      {cycle.name}
    </RouterAnchor>
  );
  const nextRun = nextRunId && (
    <RouterAnchor to="/projects/$projectId/runs/$testRunId" params={{ projectId, testRunId: nextRunId }} size="sm">
      Next run →
    </RouterAnchor>
  );
  const canFinish = canExecute && (run.state === "passed" || run.state === "failed" || run.state === "blocked");

  return (
    <Stack gap="md" maw={1100}>
      <div>
        <Group gap="sm">
          <Badge variant="light" size="lg" radius="sm">
            {run.uid}
          </Badge>
          <RunStateBadge state={run.state} />
          <Text c="dimmed" size="sm">
            Version {run.revision} ·{" "}
            <RouterAnchor to="/projects/$projectId/items/$nodeId" params={{ projectId, nodeId: run.itemId }} inherit>
              open the test case
            </RouterAnchor>
          </Text>
          <Group ml="auto">{nextRun}</Group>
        </Group>
        <Title order={1} size="h3" mt={4}>
          {run.name}
        </Title>
        <Text c="dimmed" size="sm">
          Run in {cyclePage}
          {cycle.environment && ` · ${cycle.environment}`} · assigned to {run.assignee ?? "nobody"}
          {run.group && ` · group ${run.group}`}
        </Text>
      </div>
      <RichView doc={run.description} />
      {(record.isError || finish.isError || attach.isError) && (
        <Alert color="red" role="alert">
          {(record.error ?? finish.error ?? attach.error)?.message}
        </Alert>
      )}
      {cycle.closedAt && !run.finished && <Alert color="gray">This cycle is closed. The run was not finished.</Alert>}

      <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Steps" style={{ whiteSpace: "pre-wrap" }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={40}>#</Table.Th>
            <Table.Th>Action</Table.Th>
            <Table.Th>Expected result</Table.Th>
            <Table.Th>Actual result</Table.Th>
            <Table.Th w={230}>Result</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {run.steps.map((step, index) => (
            <Table.Tr
              // biome-ignore lint/suspicious/noArrayIndexKey: a step has no identity but its place in the frozen list
              key={index}
              bg={canExecute && index === at ? "var(--mantine-primary-color-light)" : undefined}
              aria-current={canExecute && index === at ? "step" : undefined}
              onClick={() => setAt(index)}
              // A file dropped on a step becomes its evidence.
              onDragOver={canExecute ? (event) => event.preventDefault() : undefined}
              onDrop={
                canExecute
                  ? (event) => {
                      event.preventDefault();
                      attach.mutate({ files: [...event.dataTransfer.files], step: index + 1 });
                    }
                  : undefined
              }
              style={{ verticalAlign: "top" }}
            >
              <Table.Td>{index + 1}</Table.Td>
              <Table.Td>
                <RichView doc={stepDoc(step.action)} />
              </Table.Td>
              <Table.Td>
                <RichView doc={stepDoc(step.expected)} />
              </Table.Td>
              <Table.Td>
                {canExecute ? (
                  <Textarea
                    aria-label={`Actual result of step ${index + 1}`}
                    autosize
                    minRows={1}
                    maxLength={5000}
                    value={actuals[index] ?? ""}
                    onFocus={() => setAt(index)}
                    onChange={(e) => {
                      const text = e.currentTarget.value;
                      setActuals((previous) => previous.map((old, other) => (other === index ? text : old)));
                    }}
                  />
                ) : (
                  step.actual
                )}
                <Group gap="xs" mt={4}>
                  <EvidenceLinks files={run.attachments.filter((file) => file.step === index + 1)} showStep={false} />
                  {canExecute && (
                    <FileButton multiple onChange={(files) => attach.mutate({ files, step: index + 1 })}>
                      {(props) => (
                        <Button
                          {...props}
                          size="compact-xs"
                          variant="subtle"
                          aria-label={`Attach evidence to step ${index + 1}`}
                          loading={attach.isPending && attach.variables?.step === index + 1}
                        >
                          Attach
                        </Button>
                      )}
                    </FileButton>
                  )}
                </Group>
              </Table.Td>
              <Table.Td>
                {canExecute ? (
                  <Button.Group>
                    {OUTCOMES.map((outcome) => (
                      <Button
                        key={outcome}
                        size="compact-sm"
                        color={OUTCOME[outcome].color}
                        variant={step.outcome === outcome ? "filled" : "default"}
                        aria-pressed={step.outcome === outcome}
                        aria-label={`${OUTCOME[outcome].label} step ${index + 1}`}
                        onClick={() => mark(index, outcome)}
                      >
                        {OUTCOME[outcome].label}
                      </Button>
                    ))}
                  </Button.Group>
                ) : step.outcome ? (
                  <Badge color={OUTCOME[step.outcome].color} variant="light" radius="sm" size="sm">
                    {OUTCOME[step.outcome].label}
                  </Badge>
                ) : (
                  <Text size="sm" c="dimmed">
                    Not done
                  </Text>
                )}
                {step.by && step.at && (
                  <Text size="xs" c="dimmed" mt={2}>
                    {step.by} · {when(step.at)}
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Group gap="xs">
        <Text size="sm" fw={600}>
          Evidence of the whole test:
        </Text>
        <EvidenceLinks files={run.attachments.filter((file) => file.step === null)} />
        {run.attachments.every((file) => file.step !== null) && (
          <Text size="sm" c="dimmed">
            none
          </Text>
        )}
        {canExecute && (
          <FileButton multiple onChange={(files) => attach.mutate({ files })}>
            {(props) => (
              <Button
                {...props}
                size="compact-sm"
                variant="default"
                loading={attach.isPending && attach.variables?.step === undefined}
              >
                Attach files
              </Button>
            )}
          </FileButton>
        )}
      </Group>
      {canExecute && (
        <Text size="xs" c="dimmed">
          Evidence can be an image, PDF, text, log, CSV or zip file. Drop a file on a step, or paste a screenshot: it
          goes to the highlighted step. Evidence cannot be removed afterwards.
        </Text>
      )}

      {canExecute && (
        <Stack gap="sm" maw={560}>
          <Group gap="sm">
            <Button
              variant="default"
              disabled={remaining.length === 0}
              loading={record.isPending}
              onClick={() => record.mutate({ steps: remaining, outcome: "pass" })}
            >
              Pass all remaining
            </Button>
            <Text size="xs" c="dimmed">
              Keyboard: ↑ ↓ choose a step, P pass, F fail, B blocked.
            </Text>
          </Group>
          {canFinish && (
            <>
              <Textarea
                label="Note"
                description="Optional. Stored with the result."
                autosize
                minRows={2}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
              />
              {run.state === "failed" && (
                <TextInput
                  type="url"
                  label="Defect link"
                  description="Where the defect is tracked, for example a Jira or GitHub issue."
                  placeholder="https://"
                  maxLength={2000}
                  value={defectUrl}
                  onChange={(e) => setDefectUrl(e.currentTarget.value)}
                />
              )}
            </>
          )}
          <div>
            <Button disabled={!canFinish} loading={finish.isPending} onClick={() => finish.mutate()}>
              Finish run{canFinish ? ` as ${RUN_STATE[run.state].label.toLowerCase()}` : ""}
            </Button>
            <Text size="xs" c="dimmed" mt={4}>
              Finishing records the result on the test case, for version {run.revision}. A finished run cannot be
              changed.
            </Text>
          </div>
        </Stack>
      )}
      {run.result && (
        <Alert color={OUTCOME[run.result.outcome].color} title={`Finished: ${OUTCOME[run.result.outcome].label}`}>
          <Stack gap={4} align="flex-start">
            <Text size="sm">
              By {run.result.by} on {when(run.result.at)}
            </Text>
            {run.result.note && (
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {run.result.note}
              </Text>
            )}
            {run.result.defectUrl && (
              <Anchor href={run.result.defectUrl} target="_blank" rel="noreferrer" size="sm">
                Defect: {run.result.defectUrl}
              </Anchor>
            )}
            {nextRun}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
