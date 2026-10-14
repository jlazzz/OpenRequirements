import {
  ActionIcon,
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  NativeSelect,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api.ts";

type Token = { id: string; name: string; createdAt: string; expiresAt: string | null; lastUsedAt: string | null };
const day = (at: string) => new Date(at).toLocaleDateString();

/** The signed-in user's access tokens, for CI and scripts. A token is shown once, when it is made. */
export function Tokens() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  // Days until the token stops working; empty for never.
  const [days, setDays] = useState("90");
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => api<{ tokens: Token[] }>("tokens") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tokens"] });
  const create = useMutation({
    mutationFn: () => api<{ token: string }>("tokens", days ? { name, expiresInDays: Number(days) } : { name }),
    onSuccess: () => {
      setName("");
      return refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`tokens/${id}`, undefined, "DELETE"),
    onSuccess: refresh,
  });

  return (
    <Stack gap="xs">
      <Title order={3} size="h5">
        Access tokens
      </Title>
      <Text size="xs" c="dimmed">
        For CI and scripts, sent as “Authorization: Bearer …”. A token can do what you can do, except change your
        password or make tokens.
      </Text>
      {(tokens.isError || create.isError || revoke.isError) && (
        <Alert color="red" role="alert">
          {(tokens.error ?? create.error ?? revoke.error)?.message}
        </Alert>
      )}
      {create.data && (
        <Alert color="green" title="Copy this token now. It is not shown again.">
          <Group gap="xs" wrap="nowrap">
            <Code style={{ overflowWrap: "anywhere" }}>{create.data.token}</Code>
            <CopyButton value={create.data.token}>
              {({ copied, copy }) => (
                <Button size="compact-xs" variant="default" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
            </CopyButton>
          </Group>
        </Alert>
      )}
      {tokens.data?.tokens.map((token) => (
        <Group key={token.id} gap="xs" wrap="nowrap">
          <Text size="sm" flex={1}>
            {token.name}{" "}
            <Text span size="xs" c="dimmed">
              · made {day(token.createdAt)}
              {token.expiresAt &&
                (new Date(token.expiresAt) < new Date() ? " · expired" : ` · expires ${day(token.expiresAt)}`)}
              {` · ${token.lastUsedAt ? `last used ${day(token.lastUsedAt)}` : "never used"}`}
            </Text>
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Revoke token ${token.name}`}
            title="Revoke"
            onClick={() => revoke.mutate(token.id)}
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
          <TextInput
            label="New token"
            placeholder="What it is for, e.g. CI"
            size="xs"
            flex={1}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <NativeSelect
            label="Expires"
            size="xs"
            value={days}
            onChange={(e) => setDays(e.currentTarget.value)}
            data={[
              { value: "30", label: "In 30 days" },
              { value: "90", label: "In 90 days" },
              { value: "365", label: "In a year" },
              { value: "", label: "Never" },
            ]}
          />
          <Button type="submit" size="xs" variant="default" disabled={!name.trim()} loading={create.isPending}>
            Create token
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
