import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useParams } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { type Attributes, api, type Field, type Item } from "./api.ts";
import { NodeActions } from "./NodeActions.tsx";
import { useProject } from "./ProjectPage.tsx";

type ItemData = { item: Item; fields: Field[] };

/** Single item view: every field of one item, editable, saved as a new version. */
export function ItemPage() {
  const { nodeId } = useParams({ from: "/projects/$projectId/items/$nodeId" });
  const item = useQuery({ queryKey: ["items", nodeId], queryFn: () => api<ItemData>(`items/${nodeId}`) });

  if (item.isPending) return null;
  if (item.isError) {
    return (
      <Alert color="red" role="alert">
        {item.error.message}
      </Alert>
    );
  }
  // The key resets the form whenever another item, or a newer version of this one, is shown.
  return <ItemForm key={`${nodeId}:${item.data.item.revision}`} {...item.data} />;
}

function ItemForm({ item, fields }: ItemData) {
  const { projectId } = useParams({ from: "/projects/$projectId/items/$nodeId" });
  const queryClient = useQueryClient();
  const project = useProject().data;
  const node = project?.nodes.find((n) => n.id === item.id);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [attributes, setAttributes] = useState<Attributes>(item.attributes);
  const [changeReason, setChangeReason] = useState("");

  const dirty =
    name !== item.name ||
    description !== item.description ||
    fields.some((f) => !sameValue(attributes[f.id], item.attributes[f.id]));

  const save = useMutation({
    mutationFn: () =>
      api(`items/${item.id}/revisions`, { baseRevision: item.revision, name, description, attributes, changeReason }),
    // Refreshes this item, the explorer and any open List view.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["items", item.id] }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
      ]),
  });
  // shortcut: unsaved edits are only protected by this prompt, replaced by auto-saved drafts in milestone M2
  useBlocker({
    shouldBlockFn: () => dirty && !save.isSuccess && !window.confirm("Discard your unsaved changes to this item?"),
    enableBeforeUnload: () => dirty,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate();
  };
  const setValue = (id: string, value: unknown) => setAttributes((previous) => ({ ...previous, [id]: value }));

  return (
    <form onSubmit={onSubmit}>
      <Stack gap="sm" maw={820}>
        <Group gap="sm">
          <Badge variant="light" size="lg" radius="sm">
            {item.uid}
          </Badge>
          <Text c="dimmed" size="sm">
            Version {item.revision} · saved {new Date(item.revisedAt).toLocaleString()}
          </Text>
          <Group ml="auto">{project && node && <NodeActions data={project} node={node} />}</Group>
        </Group>
        <TextInput
          label="Name"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <Textarea
          label="Description"
          autosize
          minRows={4}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
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

        {save.isError && (
          <Alert color="red" role="alert">
            {save.error.message}
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
          <Button type="submit" disabled={!dirty} loading={save.isPending}>
            Save version
          </Button>
        </Group>
      </Stack>
    </form>
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
