import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  FileInput,
  Group,
  NativeSelect,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  api,
  canEdit,
  type Evidence,
  evidenceName,
  type Item,
  isTestSet,
  type LastResult,
  type Outcome,
  type ProjectDetail,
  type RequirementVerification,
  type Result,
  uploadFile,
  type Verification,
  type VerificationStatus,
} from "./api.ts";
import { RouterAnchor } from "./links.tsx";

const STATUS: Record<VerificationStatus, { label: string; color: string }> = {
  not_covered: { label: "Not covered", color: "gray" },
  not_run: { label: "Not run", color: "yellow" },
  passing: { label: "Passing", color: "green" },
  failing: { label: "Failing", color: "red" },
};
const OUTCOME: Record<Outcome, { label: string; color: string }> = {
  pass: { label: "Pass", color: "green" },
  fail: { label: "Fail", color: "red" },
  blocked: { label: "Blocked", color: "orange" },
};
export const STATUSES = Object.entries(STATUS).map(([value, { label }]) => ({ value, label }));
const OUT_OF_DATE = "The test case or the requirement changed after this result, so it no longer counts";

/** The verification status of every requirement and the latest result of every test case in a project. */
export function useVerification(projectId: string) {
  return useQuery({
    // Under the project's key, so saving a version of any item refreshes it.
    queryKey: ["projects", projectId, "verification"],
    queryFn: () => api<Verification>(`projects/${projectId}/verification`),
  });
}

/** A requirement's status in words, for sorting, filtering and CSV. */
export const statusText = (entry: RequirementVerification | undefined) =>
  entry ? `${STATUS[entry.status].label}${entry.outOfDate ? " (out of date)" : ""}` : "";
/** A test case's latest result in words. */
export const resultText = (result: Pick<LastResult, "outcome" | "outOfDate"> | undefined) =>
  result ? `${OUTCOME[result.outcome].label}${result.outOfDate ? " (out of date)" : ""}` : "";

function Mark({ label, color, outOfDate }: { label: string; color: string; outOfDate: boolean }) {
  return (
    <Group gap={4} wrap="nowrap" display="inline-flex" style={{ verticalAlign: "middle" }}>
      <Badge color={color} variant="light" radius="sm" size="sm" style={{ flexShrink: 0 }}>
        {label}
      </Badge>
      {outOfDate && (
        <Badge color="orange" variant="outline" radius="sm" size="sm" title={OUT_OF_DATE} style={{ flexShrink: 0 }}>
          Out of date
        </Badge>
      )}
    </Group>
  );
}

/** A requirement's verification status as a coloured label. Renders nothing until the status is known. */
export function VerificationBadge({ entry }: { entry: RequirementVerification | undefined }) {
  return entry ? <Mark {...STATUS[entry.status]} outOfDate={entry.outOfDate} /> : null;
}

/** A result as a coloured label. Renders nothing for a test case that was never run. */
export function OutcomeBadge({ result }: { result: Pick<LastResult, "outcome" | "outOfDate"> | undefined }) {
  return result ? <Mark {...OUTCOME[result.outcome]} outOfDate={result.outOfDate} /> : null;
}

/** Side panel of an item: the results of a test case, or the verification status of anything else. */
export function VerificationPanel({ data, item }: { data: ProjectDetail; item: Item }) {
  return isTestSet(data.sets.find((s) => s.id === item.setId)) ? (
    <Results data={data} item={item} />
  ) : (
    <VerifiedBy data={data} itemId={item.id} />
  );
}

function VerifiedBy({ data, itemId }: { data: ProjectDetail; itemId: string }) {
  const projectId = data.project.id;
  const verification = useVerification(projectId);
  const entry = verification.data?.requirements[itemId];
  return (
    <Box component="aside" aria-label="Verification">
      <Group gap="xs" mb={4}>
        <Title order={2} size="h5">
          Verification
        </Title>
        <VerificationBadge entry={entry} />
      </Group>
      {verification.isError && (
        <Alert color="red" role="alert">
          {verification.error.message}
        </Alert>
      )}
      {entry?.tests.length === 0 && (
        <Text size="xs" c="dimmed">
          No test case is linked to this item with “Verified by”. Add one under Relationships, as a downstream item.
        </Text>
      )}
      <Stack gap={4}>
        {entry?.tests.map((test) => {
          const node = data.nodes.find((n) => n.id === test.itemId);
          return (
            <Group key={test.itemId} gap={6} wrap="nowrap" align="flex-start">
              <Text size="sm" flex={1} style={{ minWidth: 0 }}>
                <RouterAnchor
                  to="/projects/$projectId/items/$nodeId"
                  params={{ projectId, nodeId: test.itemId }}
                  inherit
                >
                  {node?.uid}
                </RouterAnchor>{" "}
                {node?.name}
              </Text>
              {test.outcome ? (
                <OutcomeBadge result={{ outcome: test.outcome, outOfDate: test.outOfDate }} />
              ) : (
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  Not run
                </Text>
              )}
            </Group>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * Evidence files as links, each named, with its step when it belongs to one (left out where the step is plain, as in
 * the step's own row). Renders nothing when there are none.
 */
export function EvidenceLinks({ files, showStep = true }: { files: Evidence[]; showStep?: boolean }) {
  return files.length === 0 ? null : (
    <Group gap="xs">
      {files.map((file) => (
        <Anchor key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer" size="sm">
          {evidenceName(file)}
          {showStep && file.step ? ` (step ${file.step})` : ""}
        </Anchor>
      ))}
    </Group>
  );
}

const today = () => new Date().toLocaleDateString("en-CA");

function Results({ data, item }: { data: ProjectDetail; item: Item }) {
  const projectId = data.project.id;
  const queryClient = useQueryClient();
  const key = ["projects", projectId, "results", item.id];
  const results = useQuery({ queryKey: key, queryFn: () => api<{ results: Result[] }>(`items/${item.id}/results`) });
  const [outcome, setOutcome] = useState<Outcome>("pass");
  const [revision, setRevision] = useState(item.revision);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<File[]>([]);
  const [open, setOpen] = useState(false);
  const record = useMutation({
    mutationFn: async () => {
      const attachmentIds = [];
      for (const file of evidence) attachmentIds.push((await uploadFile(projectId, file)).id);
      // Today's results carry the time too; an earlier day is recorded as noon, so it reads as that day everywhere.
      const runAt = date === today() ? undefined : new Date(`${date}T12:00:00`).toISOString();
      return api(`items/${item.id}/results`, { outcome, revision, runAt, note, attachmentIds });
    },
    onSuccess: () => {
      setNote("");
      setEvidence([]);
      setOpen(false);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "verification"] }),
      ]);
    },
  });
  const rows = results.data?.results ?? [];

  return (
    <Box component="aside" aria-label="Results">
      <Group gap="xs" mb={4}>
        <Title order={2} size="h5">
          Results ({rows.length})
        </Title>
        <OutcomeBadge result={rows[0]} />
      </Group>
      {(results.isError || record.isError) && (
        <Alert color="red" role="alert">
          {(results.error ?? record.error)?.message}
        </Alert>
      )}
      <Stack gap="sm">
        {canEdit(data.role) &&
          (open ? (
            <Stack gap={6}>
              <SegmentedControl
                aria-label="Outcome"
                size="xs"
                value={outcome}
                onChange={(value) => setOutcome(value as Outcome)}
                data={Object.entries(OUTCOME).map(([value, { label }]) => ({ value, label }))}
              />
              <Group gap="xs" grow>
                <TextInput
                  type="date"
                  size="xs"
                  label="Run on"
                  max={today()}
                  required
                  value={date}
                  onChange={(e) => setDate(e.currentTarget.value)}
                />
                <NativeSelect
                  size="xs"
                  label="Version run"
                  value={String(revision)}
                  onChange={(e) => setRevision(Number(e.currentTarget.value))}
                  data={Array.from({ length: item.revision }, (_, i) => String(item.revision - i))}
                />
              </Group>
              <Textarea
                size="xs"
                label="Note"
                autosize
                minRows={2}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
              />
              <FileInput
                size="xs"
                label="Evidence"
                description="Images, PDF, text, log, CSV or zip files"
                placeholder="Choose files"
                multiple
                clearable
                value={evidence}
                onChange={setEvidence}
              />
              <Group gap="xs">
                <Button size="compact-sm" disabled={!date} loading={record.isPending} onClick={() => record.mutate()}>
                  Record result
                </Button>
                <Button size="compact-sm" variant="default" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                A result cannot be changed afterwards. To correct one, record another.
              </Text>
            </Stack>
          ) : (
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => setOpen(true)}
              style={{ alignSelf: "flex-start" }}
            >
              Record result
            </Button>
          ))}
        {rows.map((result) => (
          <div key={result.id}>
            <Group gap={6} wrap="nowrap">
              <OutcomeBadge result={result} />
              <Text size="xs" c="dimmed">
                Version {result.revision}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {new Date(result.runAt).toLocaleDateString()} · {result.recordedBy}
              {result.source === "junit" && !result.ciRunId && " · from CI"}
              {result.ciRunId && (
                <>
                  {" · "}
                  <RouterAnchor
                    to="/projects/$projectId/ci-runs/$ciRunId"
                    params={{ projectId, ciRunId: result.ciRunId }}
                    inherit
                  >
                    from CI
                  </RouterAnchor>
                </>
              )}
              {result.runId && (
                <>
                  {" · "}
                  <RouterAnchor
                    to="/projects/$projectId/runs/$testRunId"
                    params={{ projectId, testRunId: result.runId }}
                    inherit
                  >
                    test run
                  </RouterAnchor>
                </>
              )}
            </Text>
            {result.note && (
              <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {result.note}
              </Text>
            )}
            {result.defectUrl && (
              <Anchor href={result.defectUrl} target="_blank" rel="noreferrer" size="sm" mr="xs">
                Defect
              </Anchor>
            )}
            <EvidenceLinks files={result.attachments} />
          </div>
        ))}
      </Stack>
    </Box>
  );
}
