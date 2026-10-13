import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Flex,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type Attributes, api, canEdit, type Draft, type Field, formatValue, type Item, uploadImage } from "./api.ts";
import { Comments } from "./Comments.tsx";
import { NodeActions } from "./NodeActions.tsx";
import { useProject } from "./ProjectPage.tsx";
import { Relationships } from "./Relationships.tsx";
import { RichTextInput } from "./RichText.tsx";
import { RichView } from "./RichView.tsx";
import { Versions } from "./Versions.tsx";

type ItemData = { item: Item; fields: Field[]; draft: Draft | null };

/** Single item view: every field of one item, edited in place, auto-saved as a private draft and committed with "Save version". */
export function ItemPage() {
  const { nodeId } = useParams({ from: "/projects/$projectId/items/$nodeId" });
  const item = useQuery({ queryKey: ["items", nodeId], queryFn: () => api<ItemData>(`items/${nodeId}`) });
  const project = useProject().data;
  // Bumped to throw away the form's state, e.g. after discarding a draft.
  const [epoch, setEpoch] = useState(0);

  if (item.isPending) return null;
  if (item.isError) {
    return (
      <Alert color="red" role="alert">
        {item.error.message}
      </Alert>
    );
  }
  if (!canEdit(project?.role)) return <ItemReadOnly {...item.data} />;
  // The key resets the form whenever another item, or a newer version of this one, is shown.
  return (
    <ItemForm
      key={`${nodeId}:${item.data.item.revision}:${epoch}`}
      {...item.data}
      onReset={() => setEpoch((n) => n + 1)}
    />
  );
}

/** What viewers and reviewers see: the saved version, with nothing to edit. */
function ItemReadOnly({ item, fields }: ItemData) {
  const project = useProject().data;
  return (
    <Flex gap="xl" align="flex-start" wrap="wrap">
      <Stack gap="sm" style={{ flex: "1 1 480px", minWidth: 0, maxWidth: 820 }}>
        <Group gap="sm">
          <Badge variant="light" size="lg" radius="sm">
            {item.uid}
          </Badge>
          <Text c="dimmed" size="sm">
            Version {item.revision} · saved {new Date(item.revisedAt).toLocaleString()}
          </Text>
        </Group>
        <Title order={1} size="h3">
          {item.name}
        </Title>
        <RichView doc={item.description} />
        <SimpleGrid cols={{ base: 1, sm: 2 }} component="dl" m={0}>
          {fields.map((field) => (
            <div key={field.id}>
              <Text component="dt" size="sm" fw={600}>
                {field.name}
              </Text>
              <Text component="dd" m={0}>
                {formatValue(item.attributes[field.id]) || "—"}
              </Text>
            </div>
          ))}
        </SimpleGrid>
      </Stack>
      <Stack gap="lg" w={280} style={{ flexShrink: 0 }}>
        {project && <Relationships data={project} itemId={item.id} />}
        {project && <Comments data={project} itemId={item.id} />}
        <Versions itemId={item.id} fields={fields} />
      </Stack>
    </Flex>
  );
}

const AUTOSAVE_MS = 800;

function ItemForm({ item, fields, draft, onReset }: ItemData & { onReset: () => void }) {
  const { projectId } = useParams({ from: "/projects/$projectId/items/$nodeId" });
  const queryClient = useQueryClient();
  const project = useProject().data;
  const node = project?.nodes.find((n) => n.id === item.id);
  const start = draft ?? item;
  const [name, setName] = useState(start.name);
  const [description, setDescription] = useState(start.description);
  const [attributes, setAttributes] = useState<Attributes>(start.attributes);
  const [changeReason, setChangeReason] = useState("");
  // The version these edits started from. Older than the current one when someone saved in the meantime.
  const [base, setBase] = useState(draft?.baseRevision ?? item.revision);
  const [draftStatus, setDraftStatus] = useState<"none" | "saving" | "saved" | "error">(draft ? "saved" : "none");

  const stale = base < item.revision;
  const dirty =
    name !== item.name ||
    !sameValue(description, item.description) ||
    fields.some((f) => !sameValue(attributes[f.id], item.attributes[f.id]));

  // Auto-save. `saved` is what the server holds as this user's draft; null when there is none.
  const body = JSON.stringify({ baseRevision: base, name, description, attributes });
  const saved = useRef(
    draft
      ? JSON.stringify({
          baseRevision: draft.baseRevision,
          name: draft.name,
          description: draft.description,
          attributes: draft.attributes,
        })
      : null,
  );
  const flush = useRef<(() => void) | null>(null);
  const inFlight = useRef<Promise<unknown>>(Promise.resolve());
  const stopped = useRef(false);
  useEffect(() => {
    if (body === saved.current || (saved.current === null && !dirty)) return;
    const send = () => {
      flush.current = null;
      if (stopped.current) return;
      setDraftStatus("saving");
      inFlight.current = api(`items/${item.id}/draft`, JSON.parse(body), "PUT").then(
        () => {
          saved.current = body;
          setDraftStatus("saved");
        },
        () => setDraftStatus("error"),
      );
    };
    flush.current = send;
    const timer = setTimeout(send, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [body, dirty, item.id]);
  // Leaving the page within the auto-save delay must not lose the last edits.
  useEffect(() => () => flush.current?.(), []);

  /** Stops auto-save and waits for a save already on its way, so it cannot land after what follows. */
  const settle = async () => {
    stopped.current = true;
    flush.current = null;
    await inFlight.current;
  };
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["items", item.id] }),
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
    ]);
  const save = useMutation({
    mutationFn: async () => {
      await settle();
      return api(`items/${item.id}/revisions`, { baseRevision: base, name, description, attributes, changeReason });
    },
    // Refreshes this item, the explorer and any open List view. The new version number remounts this form.
    onSuccess: refresh,
    onError: () => {
      stopped.current = false;
    },
  });
  const discard = useMutation({
    mutationFn: async () => {
      await settle();
      return api(`items/${item.id}/draft`, undefined, "DELETE");
    },
    onSuccess: async () => {
      await refresh();
      onReset();
    },
    onError: () => {
      stopped.current = false;
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate();
  };
  const setValue = (id: string, value: unknown) => setAttributes((previous) => ({ ...previous, [id]: value }));
  const hasDraft = draftStatus !== "none";

  return (
    <Flex gap="xl" align="flex-start" wrap="wrap">
      <form onSubmit={onSubmit} style={{ flex: "1 1 480px", minWidth: 0, maxWidth: 820 }}>
        <Stack gap="sm">
          <Group gap="sm">
            <Badge variant="light" size="lg" radius="sm">
              {item.uid}
            </Badge>
            <Text c="dimmed" size="sm">
              Version {item.revision} · saved {new Date(item.revisedAt).toLocaleString()}
            </Text>
            {hasDraft && (
              <Badge color={draftStatus === "error" ? "red" : "yellow"} variant="light" radius="sm" aria-live="polite">
                {draftStatus === "saving"
                  ? "Saving draft…"
                  : draftStatus === "error"
                    ? "Draft not saved"
                    : "Draft saved"}
              </Badge>
            )}
            <Group ml="auto">{project && node && <NodeActions data={project} node={node} />}</Group>
          </Group>

          {stale && (
            <Alert color="yellow" title={`Version ${item.revision} was saved after you started this draft`}>
              <Stack gap="xs" align="flex-start">
                <Text size="sm">
                  Your draft began from version {base}. Open the newer version under Versions to see what changed.
                  Keeping your draft means saving it will replace those changes.
                </Text>
                <Group gap="xs">
                  <Button size="compact-sm" variant="default" onClick={() => setBase(item.revision)}>
                    Keep my draft
                  </Button>
                  <Button
                    size="compact-sm"
                    variant="default"
                    onClick={() => discard.mutate()}
                    loading={discard.isPending}
                  >
                    Discard my draft
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}

          <TextInput
            label="Name"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <RichTextInput
            label="Description"
            initial={start.description}
            onChange={setDescription}
            uploadImage={(file) => uploadImage(projectId, file)}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={attributes[field.id]}
                onChange={(value) => setValue(field.id, value)}
              />
            ))}
          </SimpleGrid>

          {(save.isError || discard.isError) && (
            <Alert color="red" role="alert">
              {(save.error ?? discard.error)?.message}
            </Alert>
          )}
          <Group align="flex-end">
            <TextInput
              label="Reason for change"
              description="Optional. Stored with the new version."
              maxLength={500}
              flex={1}
              value={changeReason}
              onChange={(e) => setChangeReason(e.currentTarget.value)}
              disabled={!dirty}
            />
            {hasDraft && !stale && (
              <Button variant="default" onClick={() => discard.mutate()} loading={discard.isPending}>
                Discard draft
              </Button>
            )}
            <Button type="submit" disabled={!dirty || stale} loading={save.isPending}>
              Save version
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Your edits are saved automatically as a private draft. Others see them only after “Save version”.
          </Text>
        </Stack>
      </form>
      <Stack gap="lg" w={280} style={{ flexShrink: 0 }}>
        {project && <Relationships data={project} itemId={item.id} />}
        {project && <Comments data={project} itemId={item.id} />}
        <Versions itemId={item.id} fields={fields} />
      </Stack>
    </Flex>
  );
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const options = field.options ?? [];
  switch (field.type) {
    case "enum":
      return (
        <Select label={field.name} data={options} value={(value as string) ?? null} onChange={onChange} clearable />
      );
    case "multi_enum":
      return (
        <MultiSelect
          label={field.name}
          data={options}
          value={(value as string[]) ?? []}
          onChange={onChange}
          clearable
        />
      );
    case "number":
      return (
        <NumberInput
          label={field.name}
          value={(value as number) ?? ""}
          onChange={(next) => onChange(typeof next === "number" ? next : null)}
        />
      );
    case "boolean":
      return (
        <Checkbox
          label={field.name}
          mt="lg"
          checked={value === true}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
      );
    case "date":
      return (
        <TextInput
          type="date"
          label={field.name}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.currentTarget.value || null)}
        />
      );
    default:
      return (
        <Textarea
          label={field.name}
          autosize
          minRows={1}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.currentTarget.value || null)}
        />
      );
  }
}
