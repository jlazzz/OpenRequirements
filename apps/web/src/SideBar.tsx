import { ActionIcon, Box, Group, Text } from "@mantine/core";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api, type RunSummary } from "./api.ts";
import { RouterNavLink } from "./links.tsx";

/** Most entries a side bar section lists before "All …". */
const LIMIT = 10;

type Row = { id: string; label: string; to: string; params: Record<string, string>; hash?: string };

const rowProps = { py: 1, px: 6, noWrap: true, style: { flex: 1, minWidth: 0 } } as const;

/** A heading that opens and closes like an explorer folder; `toggled` holds the ids flipped from closed. */
function Section({
  id,
  label,
  to,
  projectId,
  toggled,
  toggle,
  children,
}: {
  id: string;
  label: string;
  to: string;
  projectId: string;
  toggled: string[];
  toggle: (id: string) => void;
  children: (open: boolean) => ReactNode;
}) {
  const open = toggled.includes(id);
  return (
    <li>
      <Group gap={0} wrap="nowrap" pl={2}>
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
        <RouterNavLink
          to={to}
          params={{ projectId }}
          label={label}
          {...rowProps}
          styles={{ label: { fontSize: "var(--mantine-font-size-sm)" } }}
        />
      </Group>
      {open && children(open)}
    </li>
  );
}

/** The listed rows (at most LIMIT) and the "All …" link that ends them. */
function Rows({
  rows,
  all,
  projectId,
  to,
  empty,
}: {
  rows: Row[];
  all: string;
  projectId: string;
  to: string;
  empty: string;
}) {
  return (
    <Box component="ul" m={0} p={0} pl={26} style={{ listStyle: "none" }}>
      {rows.length === 0 && (
        <Text size="xs" c="dimmed" py={2} px={6}>
          {empty}
        </Text>
      )}
      {rows.slice(0, LIMIT).map((row) => (
        <li key={row.id}>
          <RouterNavLink
            to={row.to}
            params={{ projectId, ...row.params }}
            hash={row.hash}
            label={row.label}
            title={row.label}
            {...rowProps}
            styles={{ label: { fontSize: "var(--mantine-font-size-xs)" } }}
          />
        </li>
      ))}
      <li>
        <RouterNavLink
          to={to}
          params={{ projectId }}
          label={all}
          {...rowProps}
          c="dimmed"
          styles={{ label: { fontSize: "var(--mantine-font-size-xs)" } }}
        />
      </li>
    </Box>
  );
}

type PlanRow = { id: string; name: string; openCycles: number };
type PlanCycles = { cycles: { id: string; name: string; closedAt: string | null }[] };

/**
 * Baselines, Reviews, Test plans, Test runs and Reports as folders of the side bar. Each fetches only
 * once it is open; the query keys are the ones the full pages use, so opening a page after is instant.
 */
export function SideBarSections({
  projectId,
  toggled,
  toggle,
}: {
  projectId: string;
  toggled: string[];
  toggle: (id: string) => void;
}) {
  const isOpen = (id: string) => toggled.includes(id);
  const baselines = useQuery({
    queryKey: ["projects", projectId, "baselines"],
    queryFn: () => api<{ baselines: { id: string; name: string }[] }>(`projects/${projectId}/baselines`),
    enabled: isOpen("baselines"),
  });
  const reviews = useQuery({
    queryKey: ["projects", projectId, "reviews"],
    queryFn: () => api<{ reviews: { id: string; name: string; state: string }[] }>(`projects/${projectId}/reviews`),
    enabled: isOpen("reviews"),
  });
  const plansOpen = isOpen("test-plans") || isOpen("test-runs");
  const plans = useQuery({
    queryKey: ["projects", projectId, "test-plans"],
    queryFn: () => api<{ plans: PlanRow[] }>(`projects/${projectId}/test-plans`),
    enabled: plansOpen,
  });
  // A plan's open cycles are on its detail; only plans that have some are fetched.
  const withOpen = (plans.data?.plans ?? []).filter((plan) => plan.openCycles > 0).slice(0, LIMIT);
  const cycles = useQueries({
    queries: withOpen.map((plan) => ({
      queryKey: ["projects", projectId, "test-plans", plan.id],
      queryFn: () => api<PlanCycles>(`test-plans/${plan.id}`),
    })),
  });
  const openCycles = (index: number) => (cycles[index]?.data?.cycles ?? []).filter((c) => !c.closedAt);
  const runs = useQuery({
    queryKey: ["test-runs", "mine"],
    queryFn: () => api<{ runs: (RunSummary & { project: string })[] }>("test-runs/mine"),
    enabled: isOpen("test-runs"),
  });

  const section = { projectId, toggled, toggle };
  const cycleRows = (): Row[] =>
    withOpen.flatMap((plan, index) =>
      openCycles(index).map((cycle) => ({
        id: cycle.id,
        label: `${cycle.name} · ${plan.name}`,
        to: "/projects/$projectId/cycles/$testCycleId",
        params: { testCycleId: cycle.id },
      })),
    );
  const myRuns: Row[] = (runs.data?.runs ?? [])
    .filter((run) => run.projectId === projectId)
    .map((run) => ({
      id: run.id,
      label: `${run.uid} ${run.name}`,
      to: "/projects/$projectId/runs/$testRunId",
      params: { testRunId: run.id },
    }));

  return (
    <Box component="ul" m={0} p={0} mt="sm" style={{ listStyle: "none" }}>
      <Section id="baselines" label="Baselines" to="/projects/$projectId/baselines" {...section}>
        {() => (
          <Rows
            projectId={projectId}
            to="/projects/$projectId/baselines"
            all="All baselines"
            empty={baselines.isPending ? "Loading…" : "No baselines yet."}
            rows={(baselines.data?.baselines ?? []).map((b) => ({
              id: b.id,
              label: b.name,
              to: "/projects/$projectId/baselines/$baselineId",
              params: { baselineId: b.id },
            }))}
          />
        )}
      </Section>
      <Section id="reviews" label="Reviews" to="/projects/$projectId/reviews" {...section}>
        {() => (
          <Rows
            projectId={projectId}
            to="/projects/$projectId/reviews"
            all="All reviews"
            empty={reviews.isPending ? "Loading…" : "No open reviews."}
            rows={(reviews.data?.reviews ?? [])
              .filter((r) => r.state === "open")
              .map((r) => ({
                id: r.id,
                label: r.name,
                to: "/projects/$projectId/reviews/$reviewId",
                params: { reviewId: r.id },
              }))}
          />
        )}
      </Section>
      <Section id="test-plans" label="Test plans" to="/projects/$projectId/test-plans" {...section}>
        {() => (
          <Rows
            projectId={projectId}
            to="/projects/$projectId/test-plans"
            all="All test plans"
            empty={plans.isPending ? "Loading…" : "No test plans yet."}
            rows={(plans.data?.plans ?? []).flatMap((plan) => {
              const index = withOpen.findIndex((p) => p.id === plan.id);
              return [
                {
                  id: plan.id,
                  label: plan.name,
                  to: "/projects/$projectId/test-plans/$testPlanId",
                  params: { testPlanId: plan.id },
                },
                ...(index < 0 ? [] : openCycles(index)).map((cycle) => ({
                  id: cycle.id,
                  label: `↳ ${cycle.name}`,
                  to: "/projects/$projectId/cycles/$testCycleId",
                  params: { testCycleId: cycle.id },
                })),
              ];
            })}
          />
        )}
      </Section>
      <Section id="test-runs" label="Test runs" to="/projects/$projectId/test-runs" {...section}>
        {() => (
          <Rows
            projectId={projectId}
            to="/projects/$projectId/test-runs"
            all="All test runs"
            empty={runs.isPending || plans.isPending ? "Loading…" : "Nothing open."}
            rows={[...myRuns, ...cycleRows()]}
          />
        )}
      </Section>
      <Section id="reports" label="Reports" to="/projects/$projectId/reports" {...section}>
        {() => (
          <Rows
            projectId={projectId}
            to="/projects/$projectId/reports"
            all="All reports"
            empty=""
            rows={[
              {
                id: "verification",
                label: "Requirement verification",
                to: "/projects/$projectId/reports",
                params: {},
                hash: "verification",
              },
              { id: "flaky", label: "Flaky tests", to: "/projects/$projectId/reports", params: {}, hash: "flaky" },
              { id: "cycle", label: "Cycle summary (open a cycle)", to: "/projects/$projectId/test-plans", params: {} },
              { id: "history", label: "Plan history (open a plan)", to: "/projects/$projectId/test-plans", params: {} },
            ]}
          />
        )}
      </Section>
    </Box>
  );
}
