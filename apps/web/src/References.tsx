import { ActionIcon, Alert, Anchor, Badge, Box, Button, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, canEdit, type ProjectDetail } from "./api.ts";

type Reference = {
  id: string;
  url: string;
  title: string;
  kind: "jira" | "github" | "gitlab" | "code" | "other";
  /** Set on references the code scanner keeps in step with a repository. */
  source: string | null;
  state: "open" | "closed" | null;
  checkedAt: string | null;
};
const KIND = { jira: "Jira", github: "GitHub", gitlab: "GitLab", code: "Code", other: "Link" };

/** Side panel with an item's links to issues, pull requests and code in other tools, with their state when it is known. */
export function References({ data, itemId }: { data: ProjectDetail; itemId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["items", itemId, "references"];
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const list = useQuery({
    queryKey,
    queryFn: () => api<{ references: Reference[] }>(`items/${itemId}/references`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const add = useMutation({
    mutationFn: () =>
      api(`items/${itemId}/references`, title.trim() ? { url: url.trim(), title } : { url: url.trim() }),
    onSuccess: () => {
      setUrl("");
      setTitle("");
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`references/${id}`, undefined, "DELETE"),
    onSuccess: refresh,
  });
  const read = useMutation({ mutationFn: () => api(`items/${itemId}/references/refresh`, {}), onSuccess: refresh });
  const rows = list.data?.references ?? [];
  const editor = canEdit(data.role);

  return (
    <Box component="aside" aria-label="References">
      <Group gap="xs" mb={4}>
        <Title order={2} size="h5" flex={1}>
          References ({rows.length})
        </Title>
        {rows.length > 0 && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            loading={read.isPending}
            onClick={() => read.mutate()}
          >
            Check state
          </Button>
        )}
      </Group>
      {(list.isError || add.isError || remove.isError || read.isError) && (
        <Alert color="red" role="alert">
          {(list.error ?? add.error ?? remove.error ?? read.error)?.message}
        </Alert>
      )}
      <Stack gap={6}>
        {rows.map((ref) => (
          <Group key={ref.id} gap={6} wrap="nowrap" align="flex-start">
            <Badge size="xs" variant="light" color="gray" mt={3}>
              {KIND[ref.kind] ?? "Link"}
            </Badge>
            <Text size="sm" flex={1} style={{ overflowWrap: "anywhere" }}>
              <Anchor href={ref.url} target="_blank" rel="noopener noreferrer" inherit>
                {ref.title || ref.url}
              </Anchor>
              {ref.state && (
                <Badge size="xs" ml={6} color={ref.state === "open" ? "green" : "violet"} variant="light">
                  {ref.state === "open" ? "Open" : "Closed"}
                </Badge>
              )}
            </Text>
            {/* A code reference is removed by taking the tag out of the code. */}
            {editor && !ref.source && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={`Remove reference ${ref.title || ref.url}`}
                onClick={() => remove.mutate(ref.id)}
              >
                ×
              </ActionIcon>
            )}
          </Group>
        ))}
        {editor && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate();
            }}
          >
            <Stack gap={6}>
              <TextInput
                aria-label="Reference address"
                placeholder="https://… issue, pull request or document"
                size="xs"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
              />
              {url && (
                <TextInput
                  aria-label="Reference title"
                  placeholder="Title (optional; read from Jira, GitHub or GitLab when connected)"
                  size="xs"
                  maxLength={500}
                  value={title}
                  onChange={(e) => setTitle(e.currentTarget.value)}
                />
              )}
              <Group>
                <Button
                  type="submit"
                  size="compact-sm"
                  variant="default"
                  disabled={!/^https?:\/\/\S+$/.test(url.trim())}
                  loading={add.isPending}
                >
                  Add reference
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Box>
  );
}
