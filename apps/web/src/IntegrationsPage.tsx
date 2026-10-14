import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  NativeSelect,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { useProject } from "./ProjectPage.tsx";

type Webhook = { id: string; url: string; events: string[]; createdAt: string };
type Delivery = {
  id: string;
  event: string;
  createdAt: string;
  attempts: number;
  statusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  dueAt: string;
};
type Connection = { id: string; kind: "jira" | "github" | "gitlab"; baseUrl: string; hasToken: boolean };
const TOOL = { jira: "Jira", github: "GitHub", gitlab: "GitLab" };
const when = (at: string) => new Date(at).toLocaleString();

/** Project admins: webhooks that post every change elsewhere, and connections that read the state of references. */
export function IntegrationsPage() {
  const project = useProject().data;
  if (!project) return null;
  if (project.role !== "admin") {
    return <Alert color="gray">Only project admins manage webhooks and connections.</Alert>;
  }
  const projectId = project.project.id;
  return (
    <Stack gap="xl" maw={900}>
      <Title order={1} size="h2">
        Integrations
      </Title>
      <Webhooks projectId={projectId} />
      <Connections projectId={projectId} />
      <Text size="sm" c="dimmed">
        Scripts and CI use the same API as this app. It is described on the{" "}
        <RouterAnchor to="/api-docs" inherit>
          API
        </RouterAnchor>{" "}
        page, and a script signs in with an access token, made under your name at the top right.
      </Text>
    </Stack>
  );
}

function Webhooks({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["projects", projectId, "webhooks"];
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const list = useQuery({ queryKey, queryFn: () => api<{ webhooks: Webhook[] }>(`projects/${projectId}/webhooks`) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: () => {
      const kinds = events.split(/[\s,]+/).filter(Boolean);
      return api<{ id: string; secret: string }>(`projects/${projectId}/webhooks`, {
        url: url.trim(),
        ...(kinds.length ? { events: kinds } : {}),
      });
    },
    onSuccess: () => {
      setUrl("");
      setEvents("");
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`webhooks/${id}`, undefined, "DELETE"),
    onSuccess: refresh,
  });
  const ping = useMutation({
    mutationFn: (id: string) => api(`webhooks/${id}/ping`, {}),
    onSuccess: (_, id) => {
      setShown(id);
      return queryClient.invalidateQueries({ queryKey: ["webhooks", id] });
    },
  });
  const error = list.error ?? create.error ?? remove.error ?? ping.error;

  return (
    <Stack gap="sm">
      <Title order={2} size="h4">
        Webhooks
      </Title>
      <Text size="sm" c="dimmed">
        Every change in this project is posted as JSON to each address below, within seconds. The header
        X-Webhook-Signature-256 is the HMAC-SHA256 of the body with the webhook's secret, so the receiver can check it.
        A failed delivery is tried again up to eight times, waiting longer each time.
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {error.message}
        </Alert>
      )}
      {create.data && (
        <Alert color="green" title="Copy the secret now. It is not shown again.">
          <Group gap="xs" wrap="nowrap">
            <Code style={{ overflowWrap: "anywhere" }}>{create.data.secret}</Code>
            <CopyButton value={create.data.secret}>
              {({ copied, copy }) => (
                <Button size="compact-xs" variant="default" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Alert>
      )}
      {list.data?.webhooks.map((hook) => (
        <Stack key={hook.id} gap={4}>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" flex={1} style={{ overflowWrap: "anywhere" }}>
              {hook.url}{" "}
              <Text span size="xs" c="dimmed">
                · {hook.events.length ? hook.events.join(", ") : "all changes"}
              </Text>
            </Text>
            <Button size="compact-xs" variant="default" loading={ping.isPending} onClick={() => ping.mutate(hook.id)}>
              Send test
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setShown(shown === hook.id ? null : hook.id)}
            >
              {shown === hook.id ? "Hide deliveries" : "Deliveries"}
            </Button>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={`Delete webhook ${hook.url}`}
              onClick={() => remove.mutate(hook.id)}
            >
              ×
            </ActionIcon>
          </Group>
          {shown === hook.id && <Deliveries webhookId={hook.id} />}
        </Stack>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Group gap="xs" align="flex-end">
          <TextInput
            label="Address"
            placeholder="https://ci.example.com/hooks/requirements"
            size="xs"
            type="url"
            flex={2}
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
          <TextInput
            label="Only these changes"
            description="e.g. item, link, review. Empty: all."
            size="xs"
            flex={1}
            value={events}
            onChange={(e) => setEvents(e.currentTarget.value)}
          />
          <Button type="submit" size="xs" disabled={!url.trim()} loading={create.isPending}>
            Add webhook
          </Button>
        </Group>
      </form>
    </Stack>
  );
}

function Deliveries({ webhookId }: { webhookId: string }) {
  const list = useQuery({
    queryKey: ["webhooks", webhookId],
    queryFn: () => api<{ deliveries: Delivery[] }>(`webhooks/${webhookId}/deliveries`),
    // Deliveries are sent in the background: watch them arrive.
    refetchInterval: 5000,
  });
  const rows = list.data?.deliveries ?? [];
  if (rows.length === 0)
    return (
      <Text size="xs" c="dimmed">
        Nothing sent yet.
      </Text>
    );
  return (
    <Table fz="xs" withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Change</Table.Th>
          <Table.Th>Made</Table.Th>
          <Table.Th>Result</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((d) => (
          <Table.Tr key={d.id}>
            <Table.Td>{d.event}</Table.Td>
            <Table.Td>{when(d.createdAt)}</Table.Td>
            <Table.Td>
              {d.deliveredAt ? (
                <Badge size="xs" color="green" variant="light">
                  Delivered{d.statusCode ? ` (${d.statusCode})` : ""}
                </Badge>
              ) : d.attempts === 0 ? (
                <Badge size="xs" color="gray" variant="light">
                  Waiting
                </Badge>
              ) : (
                <Text size="xs" c="red">
                  {d.lastError} · {d.attempts} {d.attempts === 1 ? "try" : "tries"}
                  {d.attempts < 8 && `, next at ${when(d.dueAt)}`}
                </Text>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function Connections({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["projects", projectId, "integrations"];
  const [kind, setKind] = useState<Connection["kind"]>("jira");
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const list = useQuery({
    queryKey,
    queryFn: () => api<{ tokens: boolean; integrations: Connection[] }>(`projects/${projectId}/integrations`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const create = useMutation({
    mutationFn: () =>
      api(`projects/${projectId}/integrations`, { kind, baseUrl: baseUrl.trim(), ...(token ? { token } : {}) }),
    onSuccess: () => {
      setBaseUrl("");
      setToken("");
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`integrations/${id}`, undefined, "DELETE"),
    onSuccess: refresh,
  });
  const error = list.error ?? create.error ?? remove.error;

  return (
    <Stack gap="sm">
      <Title order={2} size="h4">
        Connections
      </Title>
      <Text size="sm" c="dimmed">
        References on items to issues and pull requests in these tools show their title and whether they are open or
        closed. The state is read every 15 minutes, or at once with “Check state” on an item.
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {error.message}
        </Alert>
      )}
      {list.data?.integrations.map((c) => (
        <Group key={c.id} gap="xs" wrap="nowrap">
          <Badge variant="light" color="gray">
            {TOOL[c.kind]}
          </Badge>
          <Text size="sm" flex={1}>
            {c.baseUrl}{" "}
            <Text span size="xs" c="dimmed">
              · {c.hasToken ? "with a token" : "public access"}
            </Text>
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Delete connection ${c.baseUrl}`}
            onClick={() => remove.mutate(c.id)}
          >
            ×
          </ActionIcon>
        </Group>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Group gap="xs" align="flex-end">
          <NativeSelect
            label="Tool"
            size="xs"
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value as Connection["kind"])}
            data={Object.entries(TOOL).map(([value, label]) => ({ value, label }))}
          />
          <TextInput
            label="Address"
            placeholder={
              kind === "github"
                ? "https://github.com"
                : kind === "jira"
                  ? "https://acme.atlassian.net"
                  : "https://gitlab.com"
            }
            size="xs"
            type="url"
            flex={1}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.currentTarget.value)}
          />
          <PasswordInput
            label="Token"
            description={
              list.data?.tokens === false
                ? "The server needs INTEGRATION_KEY to store tokens."
                : kind === "jira"
                  ? "Jira Cloud: email:api-token"
                  : "Read-only is enough"
            }
            size="xs"
            flex={1}
            disabled={list.data?.tokens === false}
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            autoComplete="off"
          />
          <Button type="submit" size="xs" disabled={!baseUrl.trim()} loading={create.isPending}>
            Connect
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
