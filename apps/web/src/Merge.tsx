import { changedParts, docToText, type ItemContent, mergeItem, type RichNode } from "@app/shared";
import { Alert, Button, Group, Paper, SegmentedControl, SimpleGrid, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type Attributes, api, type Field, formatValue } from "./api.ts";

type Revision = { number: number; name: string; description: RichNode; attributes: Attributes; author: string };
type Editing = { revision: number; author: string; editors: { name: string; since: string }[] };

/**
 * Shown when someone else saved a version after this user's draft began. Changes to different parts combine by
 * themselves; for each part both people changed, the user keeps theirs or takes the other one.
 */
export function MergePanel({
  itemId,
  fields,
  base,
  mine,
  theirs,
  onApply,
  onDiscard,
  discarding,
}: {
  itemId: string;
  fields: Field[];
  /** The version the draft began from. */
  base: number;
  mine: ItemContent;
  theirs: ItemContent & { revision: number };
  onApply: (merged: ItemContent) => void;
  onDiscard: () => void;
  discarding: boolean;
}) {
  const history = useQuery({
    queryKey: ["items", itemId, "revisions"],
    queryFn: () => api<{ revisions: Revision[] }>(`items/${itemId}/revisions`),
  });
  const [takeTheirs, setTakeTheirs] = useState<string[]>([]);
  if (history.isPending) return null;
  const from = history.data?.revisions.find((r) => r.number === base);
  const author = history.data?.revisions.find((r) => r.number === theirs.revision)?.author ?? "Someone";
  if (!from) {
    return (
      <Alert color="red" role="alert">
        {history.error?.message ?? `Version ${base} could not be loaded.`}
      </Alert>
    );
  }

  const { merged, conflicts } = mergeItem(from, mine, theirs, takeTheirs);
  const label = (key: string) =>
    key === "name" ? "Name" : key === "description" ? "Description" : (fields.find((f) => f.id === key)?.name ?? key);
  const text = (content: ItemContent, key: string) =>
    key === "name"
      ? content.name
      : key === "description"
        ? docToText(content.description)
        : formatValue(content.attributes[key]) || "(empty)";
  const theyChanged = changedParts(from, theirs).map(label);

  return (
    <Alert color="yellow" title={`${author} saved version ${theirs.revision} after you started editing`}>
      <Stack gap="sm">
        <Text size="sm">
          Your edits began from version {base}. {author} changed: {theyChanged.join(", ") || "nothing you can see"}.
        </Text>
        {conflicts.length === 0 ? (
          <Text size="sm">None of their changes touch what you changed. Combine them to keep both.</Text>
        ) : (
          <Text size="sm">You both changed {conflicts.map(label).join(", ")}. Choose what to keep for each.</Text>
        )}
        {conflicts.map((key) => {
          const theirsChosen = takeTheirs.includes(key);
          return (
            <Stack key={key} gap={4}>
              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  {label(key)}
                </Text>
                <SegmentedControl
                  size="xs"
                  aria-label={`${label(key)}: whose version to keep`}
                  value={theirsChosen ? "theirs" : "mine"}
                  onChange={(value) =>
                    setTakeTheirs((list) => (value === "theirs" ? [...list, key] : list.filter((k) => k !== key)))
                  }
                  data={[
                    { value: "mine", label: "Keep mine" },
                    { value: "theirs", label: `Take ${author}'s` },
                  ]}
                />
              </Group>
              <SimpleGrid cols={2} spacing="xs">
                {[
                  { who: "Mine", content: mine, chosen: !theirsChosen },
                  { who: `${author}'s`, content: theirs, chosen: theirsChosen },
                ].map((side) => (
                  <Paper
                    key={side.who}
                    withBorder
                    p="xs"
                    style={{ borderColor: side.chosen ? "var(--mantine-primary-color-filled)" : undefined }}
                  >
                    <Text size="xs" c="dimmed">
                      {side.who}
                    </Text>
                    <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} lineClamp={8}>
                      {text(side.content, key)}
                    </Text>
                  </Paper>
                ))}
              </SimpleGrid>
            </Stack>
          );
        })}
        <Group gap="xs">
          <Button size="compact-sm" onClick={() => onApply(merged)}>
            Combine and keep editing
          </Button>
          <Button size="compact-sm" variant="default" onClick={onDiscard} loading={discarding}>
            Discard my edits
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Combining changes only your draft. Nothing is saved for others until you choose “Save version”.
        </Text>
      </Stack>
    </Alert>
  );
}

/** Polled while an item is open: says who else is editing it, and offers a version saved since the page loaded. */
export function EditingNotice({
  itemId,
  revision,
  dirty,
  onNewer,
}: {
  itemId: string;
  revision: number;
  dirty: boolean;
  onNewer: () => void;
}) {
  const editing = useQuery({
    queryKey: ["items", itemId, "editing"],
    queryFn: () => api<Editing>(`items/${itemId}/editing`),
    refetchInterval: 15_000,
  });
  const data = editing.data;
  if (!data) return null;
  return (
    <>
      {data.editors.length > 0 && (
        <Text size="sm" c="dimmed" role="status">
          Also editing:{" "}
          {data.editors
            .map((e) => `${e.name} (draft saved ${new Date(e.since).toLocaleTimeString([], { timeStyle: "short" })})`)
            .join(", ")}
          . Their edits are private until they save a version.
        </Text>
      )}
      {data.revision > revision && (
        <Alert color="yellow" role="status">
          <Group justify="space-between">
            <Text size="sm">
              {data.author} saved version {data.revision} while you had this item open.
            </Text>
            <Button size="compact-sm" variant="default" onClick={onNewer}>
              {dirty ? "Merge it into my edits" : `Show version ${data.revision}`}
            </Button>
          </Group>
        </Alert>
      )}
    </>
  );
}
