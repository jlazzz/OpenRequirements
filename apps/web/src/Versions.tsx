import { diffWords, docToText, type RichNode } from "@app/shared";
import { Alert, Box, Button, Modal, NavLink, Select, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Attributes, api, type Field, formatValue } from "./api.ts";

type Revision = {
  number: number;
  name: string;
  description: RichNode;
  attributes: Attributes;
  changeReason: string | null;
  createdAt: string;
  author: string;
};

type Content = Pick<Revision, "number" | "name" | "description" | "attributes">;

/** Side panel listing an item's versions. Choosing one shows what changed in it. */
export function Versions({ itemId, fields, editable }: { itemId: string; fields: Field[]; editable?: boolean }) {
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ["items", itemId, "revisions"],
    queryFn: () => api<{ revisions: Revision[] }>(`items/${itemId}/revisions`),
  });
  const [shown, setShown] = useState<number | null>(null);
  // Null means "the version before the shown one".
  const [base, setBase] = useState<number | null>(null);
  const revisions = history.data?.revisions ?? [];
  const after = revisions.find((r) => r.number === shown);
  const before = revisions.find((r) => r.number === (base ?? (shown ?? 0) - 1));
  const latest = revisions[0]?.number;
  // Restoring never rewrites history: the old content is saved again as the newest version.
  const restore = useMutation({
    mutationFn: (old: Revision) =>
      api(`items/${itemId}/revisions`, {
        baseRevision: latest,
        name: old.name,
        description: old.description,
        attributes: old.attributes,
        changeReason: `Restored version ${old.number}`,
      }),
    onSuccess: async () => {
      await Promise.all(["items", "projects"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      setShown(null);
    },
  });

  return (
    <Box component="aside" aria-label="Versions" w={280} style={{ flexShrink: 0 }}>
      <Title order={2} size="h5" mb={4}>
        Versions
      </Title>
      {history.isError && (
        <Alert color="red" role="alert">
          {history.error.message}
        </Alert>
      )}
      {revisions.map((revision) => (
        <NavLink
          key={revision.number}
          component="button"
          type="button"
          label={`Version ${revision.number}`}
          description={
            <>
              {revision.author} · {new Date(revision.createdAt).toLocaleString()}
              {revision.changeReason && (
                <Text size="xs" c="dark" fs="italic">
                  {revision.changeReason}
                </Text>
              )}
            </>
          }
          onClick={() => {
            setBase(null);
            setShown(revision.number);
          }}
        />
      ))}

      <Modal opened={after !== undefined} onClose={() => setShown(null)} size="lg" title={`Version ${after?.number}`}>
        {after && (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Saved by {after.author} on {new Date(after.createdAt).toLocaleString()}
              {after.changeReason ? `. Reason: ${after.changeReason}` : ""}
            </Text>
            {revisions.length > 1 && (
              <Select
                label="Compare with"
                data={revisions
                  .filter((r) => r.number !== after.number)
                  .map((r) => ({ value: String(r.number), label: `Version ${r.number}` }))}
                value={before ? String(before.number) : null}
                onChange={(value) => setBase(value ? Number(value) : null)}
                placeholder="Nothing: this is the first version"
                allowDeselect={false}
              />
            )}
            <RevisionDiff fields={fields} before={before} after={after} />
            {restore.isError && (
              <Alert color="red" role="alert">
                {restore.error.message}
              </Alert>
            )}
            {editable && after.number !== latest && (
              <Button
                variant="default"
                style={{ alignSelf: "flex-start" }}
                loading={restore.isPending}
                onClick={() => restore.mutate(after)}
              >
                Restore this version
              </Button>
            )}
          </Stack>
        )}
      </Modal>
    </Box>
  );
}

const marks = {
  // The small gap keeps a removed word and its replacement from reading as one word.
  added: { component: "ins", bg: "green.1", td: "none", px: 2, mx: 1 },
  removed: { component: "del", bg: "red.1", td: "line-through", px: 2, mx: 1 },
} as const;

/** What differs between two versions, field by field. Without `before`, everything in `after` counts as new. */
export function RevisionDiff({ fields, before, after }: { fields: Field[]; before?: Content; after: Content }) {
  const rows = [
    { label: "Name", from: before?.name ?? "", to: after.name },
    { label: "Description", from: before ? docToText(before.description) : "", to: docToText(after.description) },
    ...fields.map((field) => ({
      label: field.name,
      from: formatValue(before?.attributes[field.id]),
      to: formatValue(after.attributes[field.id]),
    })),
  ].filter((row) => row.from !== row.to);

  // The word diff compares text only, so a change of bold, headings or lists alone is reported in words.
  const formattingOnly =
    before !== undefined &&
    docToText(before.description) === docToText(after.description) &&
    JSON.stringify(before.description) !== JSON.stringify(after.description);
  if (rows.length === 0 && !formattingOnly) return <Text c="dimmed">No differences.</Text>;
  return (
    <Stack gap="sm">
      {before && (
        <Text size="xs" c="dimmed">
          Changes from version {before.number} to version {after.number}. Removed text is struck through; added text is
          highlighted.
        </Text>
      )}
      {formattingOnly && <Text size="sm">Description: formatting changed, wording unchanged.</Text>}
      {rows.map((row) => (
        <div key={row.label}>
          <Text size="sm" fw={600}>
            {row.label}
          </Text>
          <Text style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {diffWords(row.from, row.to).map((part, index) =>
              part.change === "same" ? (
                part.text
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts are derived from the two texts and never reorder
                <Text key={index} span inherit {...marks[part.change]}>
                  {part.text}
                </Text>
              ),
            )}
          </Text>
        </div>
      ))}
    </Stack>
  );
}
