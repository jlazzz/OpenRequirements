import type { RichNode } from "@app/shared";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  MultiSelect,
  NativeSelect,
  PasswordInput,
  Stack,
  Table,
  Text,
  Textarea,
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
  type Comment,
  canComment,
  canEdit,
  formatValue,
  type Member,
  type SetItems,
  type TreeNode,
} from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { itemsWithin, useProject } from "./ProjectPage.tsx";
import { RichView } from "./RichView.tsx";
import { useSession } from "./Root.tsx";
import { StatusBadge } from "./Status.tsx";

type State = "open" | "closed" | "approved" | "rejected";
type Part = "reviewer" | "approver";
type Mark = "reviewed" | "approved" | "rejected";
type ReviewRow = {
  id: string;
  name: string;
  state: State;
  baselineId: string;
  baseline: string;
  createdAt: string;
  closedAt: string | null;
  author: string;
  /** The signed-in user's part in the review, if they have one. */
  myRole: Part | null;
};
type Signature = { meaning: "approval" | "rejection"; signerName: string; signedAt: string; valid: boolean };
type ReviewDetail = {
  review: ReviewRow & { closedBy: string | null; statusSet: boolean };
  participants: { userId: string; name: string; role: Part; signature?: Signature }[];
  /** Each participant's latest mark per item. */
  marks: { itemId: string; userId: string; mark: Mark; at: string }[];
  outcomes: Record<string, "approved" | "rejected" | "undecided">;
  comments: (Comment & { itemId: string })[];
  /** The test cycles run to verify this review's baseline, with their runs counted by state. */
  cycles: { id: string; name: string; closedAt: string | null; runs: Record<string, number> }[];
};
type Entry = TreeNode & { revision: number | null; description: RichNode | null; attributes: Attributes | null };
type Closed = { state: State; updated: number; skipped: string[] };
type People = { members: Member[]; instanceAdmins: { userId: string; name: string }[] };

const STATE_LABEL: Record<State, string> = {
  open: "Open",
  closed: "Closed",
  approved: "Approved",
  rejected: "Rejected",
};
const when = (date: string) => new Date(date).toLocaleString();

/** The project's reviews, newest first, and the form to start one from a baseline. */
export function ReviewsPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const queryClient = useQueryClient();
  const queryKey = ["projects", projectId, "reviews"];
  const list = useQuery({
    queryKey,
    queryFn: () => api<{ reviews: ReviewRow[] }>(`projects/${projectId}/reviews`),
    enabled: Boolean(project),
  });
  const editor = canEdit(project?.role);
  const baselines = useQuery({
    queryKey: ["projects", projectId, "baselines"],
    queryFn: () => api<{ baselines: { id: string; name: string }[] }>(`projects/${projectId}/baselines`),
    enabled: editor,
  });
  const people = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => api<People>(`projects/${projectId}/members`),
    enabled: editor,
  });
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [approvers, setApprovers] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: (body: object) => api(`projects/${projectId}/reviews`, body),
    onSuccess: () => {
      setReviewers([]);
      setApprovers([]);
      return queryClient.invalidateQueries({ queryKey });
    },
  });
  if (!project) return null;
  // Taking part needs the Reviewer role or higher. Instance administrators are admins of every project.
  const able = new Map<string, string>();
  for (const admin of people.data?.instanceAdmins ?? []) able.set(admin.userId, admin.name);
  for (const member of people.data?.members ?? []) if (member.role !== "viewer") able.set(member.userId, member.name);
  const choices = [...able].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    create.mutate(
      { name: String(fields.get("name")), baselineId: String(fields.get("baselineId")), reviewers, approvers },
      { onSuccess: () => form.reset() },
    );
  };

  return (
    <Stack gap="md" maw={900}>
      <div>
        <Title order={1} size="h2">
          Reviews
        </Title>
        <Text c="dimmed" size="sm">
          A review is held on a baseline, so what is reviewed cannot change. Reviewers comment and mark items reviewed.
          Approvers approve or reject each item and sign with their password.
        </Text>
      </div>
      {(list.isError || create.isError) && (
        <Alert color="red" role="alert">
          {(list.error ?? create.error)?.message}
        </Alert>
      )}
      {list.data?.reviews.length === 0 && <Text c="dimmed">No reviews yet.</Text>}
      {list.data && list.data.reviews.length > 0 && (
        <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Reviews">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>State</Table.Th>
              <Table.Th>Baseline</Table.Th>
              <Table.Th>Your part</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>By</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.data.reviews.map((review) => (
              <Table.Tr key={review.id}>
                <Table.Td>
                  <RouterAnchor
                    to="/projects/$projectId/reviews/$reviewId"
                    params={{ projectId, reviewId: review.id }}
                    size="sm"
                  >
                    {review.name}
                  </RouterAnchor>
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={STATE_LABEL[review.state]} />
                </Table.Td>
                <Table.Td>{review.baseline}</Table.Td>
                <Table.Td>{review.myRole === "approver" ? "Approver" : review.myRole ? "Reviewer" : ""}</Table.Td>
                <Table.Td>{when(review.createdAt)}</Table.Td>
                <Table.Td>{review.author}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {editor && baselines.data?.baselines.length === 0 && (
        <Text size="sm">
          To start a review, first{" "}
          <RouterAnchor to="/projects/$projectId/baselines" params={{ projectId }} size="sm">
            create a baseline
          </RouterAnchor>
          .
        </Text>
      )}
      {editor && baselines.data && baselines.data.baselines.length > 0 && (
        <form onSubmit={onSubmit}>
          <Stack gap="sm" maw={560}>
            <Title order={2} size="h4">
              New review
            </Title>
            <TextInput name="name" label="Name" placeholder="Design review 1.0" required maxLength={200} />
            <NativeSelect
              name="baselineId"
              label="Baseline to review"
              data={baselines.data.baselines.map((b) => ({ value: b.id, label: b.name }))}
            />
            <MultiSelect
              label="Reviewers"
              description="Comment and mark items reviewed."
              data={choices}
              value={reviewers}
              onChange={setReviewers}
              searchable
            />
            <MultiSelect
              label="Approvers"
              description="Also approve or reject each item, and sign. Every approver must approve an item for it to be approved."
              data={choices}
              value={approvers}
              onChange={setApprovers}
              searchable
            />
            <div>
              <Button type="submit" loading={create.isPending} disabled={reviewers.length + approvers.length === 0}>
                Start review
              </Button>
            </div>
          </Stack>
        </form>
      )}
    </Stack>
  );
}

const OUTCOME = {
  approved: { color: "green", label: "Approved" },
  rejected: { color: "red", label: "Rejected" },
  undecided: { color: "gray", label: "Undecided" },
};

/** One review: the frozen items with everyone's marks, comments per item, signing for approvers and closing for editors. */
export function ReviewPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const session = useSession().data;
  const me = session?.user;
  const hasPassword = session?.password !== false;
  const { reviewId } = useParams({ from: "/projects/$projectId/reviews/$reviewId" });
  const queryClient = useQueryClient();
  const queryKey = ["projects", projectId, "reviews", reviewId];
  const detail = useQuery({ queryKey, queryFn: () => api<ReviewDetail>(`reviews/${reviewId}`) });
  const baselineId = detail.data?.review.baselineId;
  const frozen = useQuery({
    queryKey: ["projects", projectId, "baselines", baselineId],
    queryFn: () => api<{ baseline: { setId: string | null }; entries: Entry[] }>(`baselines/${baselineId}`),
    enabled: Boolean(baselineId),
  });
  const sets = (project?.sets ?? []).filter(
    (s) => frozen.data && (!frozen.data.baseline.setId || s.id === frozen.data.baseline.setId),
  );
  // Only the field names are used from these: the values shown are the frozen ones.
  const fields = useQueries({
    queries: sets.map((set) => ({
      queryKey: ["projects", projectId, "sets", set.id],
      queryFn: () => api<SetItems>(`sets/${set.id}/items`),
    })),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "reviews"], exact: true }),
    ]);
  const mark = useMutation({
    mutationFn: (body: { itemIds: string[]; mark: Mark | "cleared" }) => api(`reviews/${reviewId}/marks`, body),
    onSuccess: refresh,
  });
  const sign = useMutation({
    // Without a password: the person has just confirmed themself at the identity provider.
    mutationFn: (password?: string) => api(`reviews/${reviewId}/sign`, password === undefined ? {} : { password }),
    onSuccess: () => {
      setDialog(null);
      return refresh();
    },
  });
  const close = useMutation({
    mutationFn: (setStatus: boolean) => api<Closed>(`reviews/${reviewId}/close`, { setStatus }),
    onSuccess: () => {
      setDialog(null);
      // Closing may have written new versions, so everything about the project is read again.
      return queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
  const [body, setBody] = useState("");
  const comment = useMutation({
    mutationFn: (itemId: string) => api(`items/${itemId}/comments`, { body, reviewId }),
    onSuccess: () => {
      setBody("");
      return refresh();
    },
  });
  const [shownId, setShownId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"sign" | "close" | null>(null);
  const [setStatus, setSetStatus] = useState(true);
  const [newPerson, setNewPerson] = useState("");
  const [newRole, setNewRole] = useState<Part>("reviewer");
  const editor = canEdit(project?.role);
  const people = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => api<People>(`projects/${projectId}/members`),
    enabled: editor && detail.data?.review.state === "open",
  });
  const addPerson = useMutation({
    mutationFn: () => api(`reviews/${reviewId}/participants`, { userId: newPerson, role: newRole }),
    onSuccess: () => {
      setNewPerson("");
      return refresh();
    },
  });
  const removePerson = useMutation({
    mutationFn: (userId: string) => api(`reviews/${reviewId}/participants/${userId}`, undefined, "DELETE"),
    onSuccess: refresh,
  });

  const failed = detail.error ?? frozen.error;
  if (failed) {
    return (
      <Alert color="red" role="alert">
        {failed.message}
      </Alert>
    );
  }
  if (!project || !detail.data || !frozen.data) return null;
  const { review, participants, marks, outcomes, comments, cycles } = detail.data;
  const entries = frozen.data.entries;
  const items = entries.filter((e) => e.kind === "item");
  const open = review.state === "open";
  const mine = participants.find((p) => p.userId === me?.id);
  const canMark = open && mine !== undefined && !mine.signature;
  const approver = mine?.role === "approver";
  const markOf = (itemId: string, userId: string | undefined) =>
    marks.find((m) => m.itemId === itemId && m.userId === userId)?.mark;
  const decided = (userId: string) =>
    items.filter((item) => ["approved", "rejected"].includes(markOf(item.id, userId) ?? "")).length;
  const undecided = items.filter((item) => !["approved", "rejected"].includes(markOf(item.id, me?.id) ?? ""));
  const approvers = participants.filter((p) => p.role === "approver");
  const allSigned = approvers.length > 0 && approvers.every((p) => p.signature);
  const allApproved = items.every((item) => outcomes[item.id] === "approved");
  const set = (itemId: string, value: Mark) =>
    mark.mutate({ itemIds: [itemId], mark: markOf(itemId, me?.id) === value ? "cleared" : value });
  const shown = items.find((item) => item.id === shownId);
  const shownFields = shown ? (fields[sets.findIndex((s) => s.id === shown.setId)]?.data?.fields ?? []) : [];
  const error = mark.error ?? comment.error ?? close.error ?? addPerson.error ?? removePerson.error;
  // Who could still be added: Reviewer role or higher, and not already taking part.
  const able = new Map<string, string>();
  for (const admin of people.data?.instanceAdmins ?? []) able.set(admin.userId, admin.name);
  for (const member of people.data?.members ?? []) if (member.role !== "viewer") able.set(member.userId, member.name);
  const addable = [...able]
    .filter(([userId]) => !participants.some((p) => p.userId === userId))
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const manage = editor && open;

  const controls = (itemId: string) =>
    approver ? (
      <Button.Group>
        <Button
          size="compact-xs"
          color="green"
          variant={markOf(itemId, me?.id) === "approved" ? "filled" : "default"}
          aria-pressed={markOf(itemId, me?.id) === "approved"}
          disabled={!canMark}
          onClick={() => set(itemId, "approved")}
        >
          Approve
        </Button>
        <Button
          size="compact-xs"
          color="red"
          variant={markOf(itemId, me?.id) === "rejected" ? "filled" : "default"}
          aria-pressed={markOf(itemId, me?.id) === "rejected"}
          disabled={!canMark}
          onClick={() => set(itemId, "rejected")}
        >
          Reject
        </Button>
      </Button.Group>
    ) : mine ? (
      <Checkbox
        size="xs"
        label="Reviewed"
        checked={markOf(itemId, me?.id) === "reviewed"}
        disabled={!canMark}
        onChange={() => set(itemId, "reviewed")}
      />
    ) : null;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="xs">
            <Title order={1} size="h2">
              {review.name}
            </Title>
            <StatusBadge status={STATE_LABEL[review.state]} />
          </Group>
          <Text c="dimmed" size="sm">
            Review of baseline{" "}
            <RouterAnchor
              to="/projects/$projectId/baselines/$baselineId"
              params={{ projectId, baselineId: review.baselineId }}
              size="sm"
            >
              {review.baseline}
            </RouterAnchor>{" "}
            · started by {review.author} on {when(review.createdAt)}
            {review.closedAt && ` · closed by ${review.closedBy} on ${when(review.closedAt)}`}
            {review.statusSet && " · Status was set to Approved on its items"}
          </Text>
        </div>
        <Group gap="xs" className="print-hide">
          <Button variant="default" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
          {!open && (
            <Button variant="default" component="a" href={`/api/reviews/${reviewId}/docx`} download>
              Word record (.docx)
            </Button>
          )}
          {canMark && approver && undecided.length > 0 && (
            <Button
              variant="default"
              loading={mark.isPending}
              onClick={() => mark.mutate({ itemIds: undecided.map((i) => i.id), mark: "approved" })}
            >
              Approve all remaining ({undecided.length})
            </Button>
          )}
          {canMark && approver && (
            <Button disabled={undecided.length > 0} onClick={() => setDialog("sign")}>
              Sign and submit
            </Button>
          )}
          {open && canEdit(project.role) && (
            <Button color="dark" onClick={() => setDialog("close")}>
              Close review
            </Button>
          )}
        </Group>
      </Group>

      {error && (
        <Alert color="red" role="alert">
          {error.message}
        </Alert>
      )}
      {close.data && (
        <Alert color={close.data.state === "approved" ? "green" : "gray"} title={`Review ${close.data.state}`}>
          {close.data.updated > 0 && `Status set to Approved on ${close.data.updated} items. `}
          {close.data.skipped.length > 0 &&
            `Not updated, because they were edited or deleted after the baseline: ${close.data.skipped.join(", ")}.`}
        </Alert>
      )}
      {mine?.signature && open && <Alert color="blue">You have signed this review. Your decisions are final.</Alert>}

      {cycles.length > 0 && (
        <Text size="sm">
          <Text span fw={600}>
            Test evidence for this baseline:
          </Text>{" "}
          {cycles.map((cycle, index) => (
            <span key={cycle.id}>
              {index > 0 && " · "}
              <RouterAnchor
                to="/projects/$projectId/cycles/$testCycleId"
                params={{ projectId, testCycleId: cycle.id }}
                inherit
              >
                {cycle.name}
              </RouterAnchor>{" "}
              (
              {Object.entries(cycle.runs)
                .map(([state, count]) => `${count} ${state.replace("_", " ")}`)
                .join(", ")}
              , {cycle.closedAt ? "closed" : "still open"})
            </span>
          ))}
        </Text>
      )}

      <Table withTableBorder bg="var(--mantine-color-body)" aria-label="Reviewers and approvers" maw={900}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Part</Table.Th>
            <Table.Th>Progress</Table.Th>
            <Table.Th>Signature</Table.Th>
            {manage && <Table.Th />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {participants.map((person) => (
            <Table.Tr key={person.userId}>
              <Table.Td>{person.name}</Table.Td>
              <Table.Td>{person.role === "approver" ? "Approver" : "Reviewer"}</Table.Td>
              <Table.Td>
                {person.role === "approver"
                  ? `${decided(person.userId)} of ${items.length} decided`
                  : `${items.filter((item) => markOf(item.id, person.userId)).length} of ${items.length} reviewed`}
              </Table.Td>
              <Table.Td>
                {person.signature ? (
                  <Text size="sm">
                    Signed by {person.signature.signerName} on {when(person.signature.signedAt)}. Meaning:{" "}
                    <Text span fw={600}>
                      {person.signature.meaning === "approval" ? "Approval" : "Rejection"}
                    </Text>
                    {!person.signature.valid && (
                      <Badge color="red" ml="xs" radius="sm">
                        Record changed after signing
                      </Badge>
                    )}
                  </Text>
                ) : person.role === "approver" ? (
                  <Text size="sm" c="dimmed">
                    Not signed
                  </Text>
                ) : null}
              </Table.Td>
              {manage && (
                <Table.Td>
                  {!person.signature && participants.length > 1 && (
                    <Button
                      size="compact-xs"
                      variant="default"
                      loading={removePerson.isPending && removePerson.variables === person.userId}
                      onClick={() => removePerson.mutate(person.userId)}
                      aria-label={`Remove ${person.name} from the review`}
                    >
                      Remove
                    </Button>
                  )}
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {manage && (
        <Group align="flex-end" gap="xs" mt="xs">
          <NativeSelect
            label="Add a person"
            value={newPerson}
            onChange={(event) => setNewPerson(event.currentTarget.value)}
            data={[{ value: "", label: "Choose…" }, ...addable]}
          />
          <NativeSelect
            label="Part"
            value={newRole}
            onChange={(event) => setNewRole(event.currentTarget.value as Part)}
            data={[
              { value: "reviewer", label: "Reviewer" },
              { value: "approver", label: "Approver" },
            ]}
          />
          <Button disabled={!newPerson} loading={addPerson.isPending} onClick={() => addPerson.mutate()}>
            Add
          </Button>
        </Group>
      )}

      {sets.map((set) => {
        const rows = itemsWithin(entries, set.id);
        if (rows.length === 0) return null;
        return (
          <section key={set.id}>
            <Title order={2} size="h4" mb={4}>
              {set.name}
            </Title>
            <Table withTableBorder bg="var(--mantine-color-body)" aria-label={`${set.name} in review ${review.name}`}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={110}>ID</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th w={80}>Version</Table.Th>
                  <Table.Th w={110}>Comments</Table.Th>
                  <Table.Th w={120}>Outcome</Table.Th>
                  <Table.Th w={260}>Marks</Table.Th>
                  {canMark && <Table.Th w={170}>Your mark</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => {
                  const outcome = OUTCOME[outcomes[row.id] ?? "undecided"];
                  const others = participants.flatMap((p) => {
                    const value = markOf(row.id, p.userId);
                    return value ? [`${p.name}: ${value}`] : [];
                  });
                  return (
                    <Table.Tr key={row.id}>
                      <Table.Td>
                        <UnstyledButton c="blue" fz="sm" onClick={() => setShownId(row.id)}>
                          {row.uid}
                        </UnstyledButton>
                      </Table.Td>
                      <Table.Td>{row.name}</Table.Td>
                      <Table.Td>{(row as Entry).revision}</Table.Td>
                      <Table.Td>{comments.filter((c) => c.itemId === row.id).length || ""}</Table.Td>
                      <Table.Td>
                        {approvers.length > 0 && (
                          <Badge color={outcome.color} variant="light" radius="sm">
                            {outcome.label}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td fz="xs">{others.join(" · ")}</Table.Td>
                      {canMark && <Table.Td>{controls(row.id)}</Table.Td>}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </section>
        );
      })}

      <Modal
        opened={shown !== undefined}
        onClose={() => setShownId(null)}
        size="lg"
        title={shown && `${shown.uid} ${shown.name}`}
      >
        {shown && (
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              As frozen in the baseline: version {shown.revision}
            </Text>
            <RichView doc={shown.description ?? { type: "doc" }} />
            {shownFields
              .filter((field) => shown.attributes?.[field.id] !== undefined)
              .map((field) => (
                <Text key={field.id} size="sm">
                  <Text span fw={600}>
                    {field.name}:
                  </Text>{" "}
                  {formatValue(shown.attributes?.[field.id])}
                </Text>
              ))}
            {canMark && controls(shown.id)}
            <Title order={3} size="h5">
              Comments in this review
            </Title>
            {comments
              .filter((c) => c.itemId === shown.id)
              .map((c) => (
                <div key={c.id}>
                  <Text size="xs" c="dimmed">
                    <Text span fw={600} c="var(--mantine-color-bright)" inherit>
                      {c.author}
                    </Text>{" "}
                    · {when(c.createdAt)}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {c.body}
                  </Text>
                </div>
              ))}
            {open && canComment(project.role) && (
              <>
                <Textarea
                  aria-label="New review comment"
                  placeholder="Write a comment"
                  autosize
                  minRows={2}
                  maxLength={5000}
                  value={body}
                  onChange={(e) => setBody(e.currentTarget.value)}
                />
                <div>
                  <Button
                    size="compact-sm"
                    disabled={!body.trim()}
                    loading={comment.isPending}
                    onClick={() => comment.mutate(shown.id)}
                  >
                    Post
                  </Button>
                </div>
              </>
            )}
          </Stack>
        )}
      </Modal>

      <Modal opened={dialog === "sign"} onClose={() => setDialog(null)} title="Sign and submit">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sign.mutate(hasPassword ? String(new FormData(event.currentTarget).get("password")) : undefined);
          }}
        >
          <Stack gap="sm">
            <Text size="sm">
              You are signing as{" "}
              <Text span fw={600}>
                {me?.name}
              </Text>
              . Meaning of this signature:{" "}
              <Text span fw={600}>
                {items.every((item) => markOf(item.id, me?.id) === "approved") ? "Approval" : "Rejection"}
              </Text>{" "}
              of {items.length} items in "{review.name}". After signing you cannot change your decisions.
            </Text>
            {hasPassword ? (
              <PasswordInput
                name="password"
                label="Your password"
                required
                autoComplete="current-password"
                data-autofocus
              />
            ) : (
              <Text size="sm">
                First{" "}
                <Anchor href={`/api/oidc/reauth?returnTo=${encodeURIComponent(window.location.pathname)}`}>
                  confirm who you are at {session?.sso ?? "your identity provider"}
                </Anchor>
                . It asks for your password and brings you back here. Then sign within five minutes.
              </Text>
            )}
            {sign.isError && (
              <Alert color="red" role="alert">
                {sign.error.message}
              </Alert>
            )}
            <Button type="submit" loading={sign.isPending}>
              Sign
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal opened={dialog === "close"} onClose={() => setDialog(null)} title="Close review">
        <Stack gap="sm">
          <Text size="sm">
            {!allSigned
              ? approvers.length === 0
                ? "This review has no approvers. It will be closed without a decision."
                : "Not every approver has signed. The review will be closed without a decision."
              : allApproved
                ? "Every approver approved every item. The review will be Approved."
                : "At least one item was rejected. The review will be Rejected."}{" "}
            Closing is permanent: marks, comments and signatures can no longer change.
          </Text>
          {allSigned && allApproved && (
            <Checkbox
              label="Set Status to Approved on the reviewed items"
              description="Items edited or deleted since the baseline are skipped."
              checked={setStatus}
              onChange={(e) => setSetStatus(e.currentTarget.checked)}
            />
          )}
          <div>
            <Button color="dark" loading={close.isPending} onClick={() => close.mutate(setStatus)}>
              Close review
            </Button>
          </div>
        </Stack>
      </Modal>
    </Stack>
  );
}
