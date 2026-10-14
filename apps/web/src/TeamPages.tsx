import { Alert, Button, Group, NativeSelect, Select, Stack, Switch, Table, Text, Title } from "@mantine/core";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type ActivityEvent, api, type Member, type Role } from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { useProject } from "./ProjectPage.tsx";
import { useSession } from "./Root.tsx";

const ROLES: { value: Role; label: string }[] = [
  { value: "viewer", label: "Viewer: read only" },
  { value: "reviewer", label: "Reviewer: read and comment" },
  { value: "editor", label: "Editor: change items and relationships" },
  { value: "admin", label: "Admin: also manage members" },
];

type Members = { members: Member[]; instanceAdmins: { userId: string; name: string }[] };
type Candidates = { candidates: { userId: string; name: string; email: string }[] };

/** Who can open the project, and with which role. Project admins can change it. */
export function MembersPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const isAdmin = project?.role === "admin";
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => api<Members>(`projects/${projectId}/members`),
    enabled: Boolean(project),
  });
  const candidates = useQuery({
    queryKey: ["projects", projectId, "candidates"],
    queryFn: () => api<Candidates>(`projects/${projectId}/candidates`),
    enabled: isAdmin,
  });
  const [adding, setAdding] = useState<{ userId: string | null; role: Role }>({ userId: null, role: "editor" });
  const refresh = () =>
    Promise.all(
      ["members", "candidates"].map((key) => queryClient.invalidateQueries({ queryKey: ["projects", projectId, key] })),
    );
  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api(`projects/${projectId}/members/${userId}`, { role }, "PUT"),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`projects/${projectId}/members/${userId}`, undefined, "DELETE"),
    onSuccess: refresh,
  });
  if (!project) return null;
  const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label.split(":")[0];

  return (
    <Stack gap="md" maw={820}>
      <Title order={1} size="h2">
        Members
      </Title>
      {(members.isError || setRole.isError || remove.isError) && (
        <Alert color="red" role="alert">
          {(members.error ?? setRole.error ?? remove.error)?.message}
        </Alert>
      )}
      {members.data?.members.length === 0 && <Text c="dimmed">No members yet.</Text>}
      {members.data && members.data.members.length > 0 && (
        <Table withTableBorder bg="white" aria-label="Project members">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              {isAdmin && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {members.data.members.map((member) => (
              <Table.Tr key={member.userId}>
                <Table.Td>{member.name}</Table.Td>
                <Table.Td>{member.email}</Table.Td>
                <Table.Td>
                  {isAdmin ? (
                    <NativeSelect
                      size="xs"
                      aria-label={`Role of ${member.name}`}
                      data={ROLES}
                      value={member.role}
                      onChange={(e) => setRole.mutate({ userId: member.userId, role: e.currentTarget.value as Role })}
                    />
                  ) : (
                    roleLabel(member.role)
                  )}
                </Table.Td>
                {isAdmin && (
                  <Table.Td ta="right">
                    <Button
                      size="compact-sm"
                      variant="default"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => remove.mutate(member.userId)}
                    >
                      Remove
                    </Button>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {members.data && (
        <Text size="sm" c="dimmed">
          Instance administrators can do everything in every project without being listed:{" "}
          {members.data.instanceAdmins.map((a) => a.name).join(", ")}.
        </Text>
      )}

      {isAdmin && (
        <Group align="flex-end">
          <Select
            label="Add a member"
            placeholder={
              candidates.data?.candidates.length === 0
                ? "Everyone with an account is already a member"
                : "Choose a person"
            }
            data={(candidates.data?.candidates ?? []).map((c) => ({
              value: c.userId,
              label: `${c.name} (${c.email})`,
            }))}
            value={adding.userId}
            onChange={(userId) => setAdding((previous) => ({ ...previous, userId }))}
            searchable
            w={320}
          />
          <NativeSelect
            label="Role"
            data={ROLES}
            value={adding.role}
            onChange={(e) => setAdding((previous) => ({ ...previous, role: e.currentTarget.value as Role }))}
          />
          <Button
            disabled={!adding.userId}
            loading={setRole.isPending}
            onClick={() => {
              if (adding.userId) setRole.mutate({ userId: adding.userId, role: adding.role });
              setAdding((previous) => ({ ...previous, userId: null }));
            }}
          >
            Add
          </Button>
        </Group>
      )}
      {isAdmin && (
        <Text size="sm" c="dimmed">
          Someone missing from the list needs an account first. An instance administrator invites them under Users.
        </Text>
      )}
    </Stack>
  );
}

const VERBS: Record<string, string> = {
  "project.create": "created the project",
  "item.create": "created",
  "item.revise": "saved a new version of",
  "item.move": "moved",
  "item.delete": "deleted",
  "item.restore": "restored",
  "folder.restore": "restored folder",
  "folder.create": "created folder",
  "folder.rename": "renamed a folder to",
  "folder.move": "moved folder",
  "folder.delete": "deleted folder",
  "link.create": "linked",
  "link.delete": "removed the relationship",
  "comment.create": "commented on",
  "comment.delete": "deleted a comment on",
  "baseline.create": "created baseline",
  "item.import": "imported",
  "result.pass": "recorded a pass on",
  "result.fail": "recorded a failure on",
  "result.blocked": "recorded a blocked run of",
  "junit.import": "imported from CI:",
  "project.restore": "restored the project from a backup",
  "project.backup": "downloaded a backup",
  "member.set": "set the role of",
  "member.remove": "removed member",
};

/** The project's activity stream: who did what, newest first. */
export function ActivityPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const me = useSession().data?.user?.id;
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const activity = useInfiniteQuery({
    queryKey: ["projects", projectId, "activity"],
    queryFn: ({ pageParam }) =>
      api<{ events: ActivityEvent[]; more: boolean }>(
        `projects/${projectId}/activity${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: "",
    getNextPageParam: (last) => (last.more ? last.events.at(-1)?.at : undefined),
    enabled: Boolean(project),
  });
  if (!project) return null;
  const events = (activity.data?.pages.flatMap((page) => page.events) ?? []).filter(
    (event) => !mentionsOnly || (me !== undefined && event.data?.mentions?.includes(me)),
  );

  return (
    <Stack gap="sm" maw={820}>
      <Group justify="space-between">
        <Title order={1} size="h2">
          Activity
        </Title>
        <Switch
          label="Only where I am mentioned"
          checked={mentionsOnly}
          onChange={(e) => setMentionsOnly(e.currentTarget.checked)}
        />
      </Group>
      {activity.isError && (
        <Alert color="red" role="alert">
          {activity.error.message}
        </Alert>
      )}
      {activity.data && events.length === 0 && <Text c="dimmed">Nothing to show.</Text>}
      <Stack gap={6} component="ol" p={0} m={0} style={{ listStyle: "none" }}>
        {events.map((event) => (
          <Text key={event.id} component="li" size="sm">
            <Text span c="dimmed" size="xs" mr="sm">
              {new Date(event.at).toLocaleString()}
            </Text>
            <Text span fw={600}>
              {event.actor ?? "Someone"}
            </Text>{" "}
            {VERBS[event.action] ?? event.action}{" "}
            {event.entityType === "item" && !event.action.endsWith(".delete") ? (
              <RouterAnchor
                to="/projects/$projectId/items/$nodeId"
                params={{ projectId, nodeId: event.entityId }}
                inherit
              >
                {event.data?.label}
              </RouterAnchor>
            ) : (
              event.entityType !== "project" && event.data?.label
            )}
            {me && event.data?.mentions?.includes(me) ? " and mentioned you" : ""}
          </Text>
        ))}
      </Stack>
      {activity.hasNextPage && (
        <Button
          variant="default"
          onClick={() => activity.fetchNextPage()}
          loading={activity.isFetchingNextPage}
          style={{ alignSelf: "flex-start" }}
        >
          Show older
        </Button>
      )}
    </Stack>
  );
}
