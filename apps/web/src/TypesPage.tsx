import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  NativeSelect,
  Stack,
  Table,
  TagsInput,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api } from "./api.ts";
import { useProject } from "./ProjectPage.tsx";

type Field = { id: string; name: string; type: string; options: string[] | null };
type ItemType = { id: string; name: string; role: "test" | null; fields: Field[] };
type ProjectTypes = {
  itemTypes: ItemType[];
  sets: { id: string; name: string; uidPrefix: string; itemTypeId: string }[];
  linkTypes: { id: string; name: string; role: "verifies" | null }[];
};
type Change = { path: string; body?: object; method?: "PATCH" | "DELETE" };

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "enum", label: "Pick one" },
  { value: "multi_enum", label: "Pick several" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes or no" },
  { value: "steps", label: "Test steps" },
];
const hasOptions = (type: string) => type === "enum" || type === "multi_enum";

/** A name that saves when it loses focus or on Enter, if it changed. */
function NameInput(props: { label: string; value: string; readOnly: boolean; onSave: (name: string) => void }) {
  const [value, setValue] = useState(props.value);
  const save = () => {
    if (value.trim() && value.trim() !== props.value) props.onSave(value.trim());
    else setValue(props.value);
  };
  return (
    <TextInput
      size="xs"
      aria-label={props.label}
      value={value}
      readOnly={props.readOnly}
      variant={props.readOnly ? "unstyled" : "default"}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && save()}
    />
  );
}

/** A form row that adds something by name, with optional extra inputs, and clears itself after. */
function AddForm(props: { label: string; children?: React.ReactNode; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    props.onAdd(name.trim());
    setName("");
  };
  return (
    <form onSubmit={submit}>
      <Group align="flex-end" gap="xs">
        <TextInput size="xs" label={props.label} value={name} onChange={(e) => setName(e.currentTarget.value)} />
        {props.children}
        <Button size="xs" type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </Group>
    </form>
  );
}

/** The project's item types with their fields, its sets and relationship types. Project admins change them. */
export function TypesPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const isAdmin = project?.role === "admin";
  const queryClient = useQueryClient();
  const types = useQuery({
    queryKey: ["projects", projectId, "types"],
    queryFn: () => api<ProjectTypes>(`projects/${projectId}/types`),
    enabled: Boolean(project),
  });
  // Sets, fields and relationship types show up all over the project, so everything about it is read again.
  const change = useMutation({
    mutationFn: ({ path, body, method }: Change) => api(path, body, method),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });
  const [newField, setNewField] = useState<Record<string, { type: string; options: string[] }>>({});
  const [newType, setNewType] = useState({ test: false });
  const [newSet, setNewSet] = useState({ uidPrefix: "", itemTypeId: "" });
  const [newLink, setNewLink] = useState({ verifies: false });
  if (!project || !types.data) return null;
  const { itemTypes, sets, linkTypes } = types.data;
  const remove = (path: string, what: string) => {
    if (window.confirm(`Remove ${what}? Old versions keep what they recorded.`))
      change.mutate({ path, method: "DELETE" });
  };

  return (
    <Stack gap="lg" maw={980}>
      <Title order={1} size="h2">
        Item types and relationships
      </Title>
      {!isAdmin && <Text c="dimmed">Only a project admin changes these.</Text>}
      {(types.isError || change.isError) && (
        <Alert color="red" role="alert">
          {(types.error ?? change.error)?.message}
        </Alert>
      )}

      <Title order={2} size="h3">
        Item types
      </Title>
      {itemTypes.map((type) => {
        const adding = newField[type.id] ?? { type: "text", options: [] };
        return (
          <Card key={type.id} withBorder padding="sm">
            <Group justify="space-between" mb="xs">
              <Group gap="sm">
                <NameInput
                  key={type.name}
                  label={`Name of item type ${type.name}`}
                  value={type.name}
                  readOnly={!isAdmin}
                  onSave={(name) => change.mutate({ path: `item-types/${type.id}`, body: { name }, method: "PATCH" })}
                />
                <Checkbox
                  label="Holds test cases"
                  checked={type.role === "test"}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    change.mutate({
                      path: `item-types/${type.id}`,
                      body: { role: e.currentTarget.checked ? "test" : null },
                      method: "PATCH",
                    })
                  }
                />
              </Group>
              {isAdmin && (
                <Button size="compact-sm" variant="default" onClick={() => remove(`item-types/${type.id}`, type.name)}>
                  Remove type
                </Button>
              )}
            </Group>
            <Table aria-label={`Fields of ${type.name}`}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Field</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Allowed values</Table.Th>
                  {isAdmin && <Table.Th />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {type.fields.map((field) => (
                  <Table.Tr key={field.id}>
                    <Table.Td>
                      <NameInput
                        key={field.name}
                        label={`Name of field ${field.name}`}
                        value={field.name}
                        readOnly={!isAdmin}
                        onSave={(name) =>
                          change.mutate({ path: `fields/${field.id}`, body: { name }, method: "PATCH" })
                        }
                      />
                    </Table.Td>
                    <Table.Td>{FIELD_TYPES.find((t) => t.value === field.type)?.label ?? field.type}</Table.Td>
                    <Table.Td>
                      {field.options && (
                        <TagsInput
                          size="xs"
                          aria-label={`Allowed values of ${field.name}`}
                          value={field.options}
                          readOnly={!isAdmin}
                          onChange={(options) =>
                            options.length > 0 &&
                            change.mutate({ path: `fields/${field.id}`, body: { options }, method: "PATCH" })
                          }
                        />
                      )}
                    </Table.Td>
                    {isAdmin && (
                      <Table.Td ta="right">
                        <Button
                          size="compact-sm"
                          variant="default"
                          aria-label={`Remove field ${field.name}`}
                          onClick={() => remove(`fields/${field.id}`, `the field ${field.name}`)}
                        >
                          Remove
                        </Button>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {isAdmin && (
              <AddForm
                label="New field"
                onAdd={(name) => {
                  change.mutate({
                    path: `item-types/${type.id}/fields`,
                    body: { name, type: adding.type, ...(hasOptions(adding.type) ? { options: adding.options } : {}) },
                  });
                  setNewField((all) => ({ ...all, [type.id]: { type: "text", options: [] } }));
                }}
              >
                <NativeSelect
                  size="xs"
                  label="Type"
                  data={FIELD_TYPES}
                  value={adding.type}
                  onChange={(e) =>
                    setNewField((all) => ({ ...all, [type.id]: { ...adding, type: e.currentTarget.value } }))
                  }
                />
                {hasOptions(adding.type) && (
                  <TagsInput
                    size="xs"
                    label="Allowed values"
                    placeholder="Type a value, then Enter"
                    value={adding.options}
                    onChange={(options) => setNewField((all) => ({ ...all, [type.id]: { ...adding, options } }))}
                  />
                )}
              </AddForm>
            )}
          </Card>
        );
      })}
      {isAdmin && (
        <AddForm
          label="New item type"
          onAdd={(name) =>
            change.mutate({
              path: `projects/${projectId}/item-types`,
              body: { name, role: newType.test ? "test" : null },
            })
          }
        >
          <Checkbox
            label="Holds test cases"
            checked={newType.test}
            onChange={(e) => setNewType({ test: e.currentTarget.checked })}
            mb={6}
          />
        </AddForm>
      )}

      <Title order={2} size="h3">
        Sets
      </Title>
      <Text size="sm" c="dimmed">
        A set keeps its UID prefix. Only an empty set can be removed, and its prefix is never used again.
      </Text>
      <Table withTableBorder aria-label="Sets">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Set</Table.Th>
            <Table.Th>UID prefix</Table.Th>
            <Table.Th>Item type</Table.Th>
            {isAdmin && <Table.Th />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sets.map((set) => (
            <Table.Tr key={set.id}>
              <Table.Td>
                <NameInput
                  key={set.name}
                  label={`Name of set ${set.name}`}
                  value={set.name}
                  readOnly={!isAdmin}
                  onSave={(name) => change.mutate({ path: `sets/${set.id}`, body: { name }, method: "PATCH" })}
                />
              </Table.Td>
              <Table.Td>{set.uidPrefix}</Table.Td>
              <Table.Td>{itemTypes.find((t) => t.id === set.itemTypeId)?.name}</Table.Td>
              {isAdmin && (
                <Table.Td ta="right">
                  <Button
                    size="compact-sm"
                    variant="default"
                    aria-label={`Remove set ${set.name}`}
                    onClick={() => remove(`sets/${set.id}`, `the set ${set.name}`)}
                  >
                    Remove
                  </Button>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {isAdmin && (
        <AddForm
          label="New set"
          onAdd={(name) => {
            change.mutate({
              path: `projects/${projectId}/sets`,
              body: { name, uidPrefix: newSet.uidPrefix, itemTypeId: newSet.itemTypeId || itemTypes[0]?.id },
            });
            setNewSet({ ...newSet, uidPrefix: "" });
          }}
        >
          <TextInput
            size="xs"
            label="UID prefix"
            placeholder="e.g. HAZ"
            value={newSet.uidPrefix}
            onChange={(e) => setNewSet({ ...newSet, uidPrefix: e.currentTarget.value.toUpperCase() })}
            w={100}
          />
          <NativeSelect
            size="xs"
            label="Item type"
            data={itemTypes.map((t) => ({ value: t.id, label: t.name }))}
            value={newSet.itemTypeId || itemTypes[0]?.id}
            onChange={(e) => setNewSet({ ...newSet, itemTypeId: e.currentTarget.value })}
          />
        </AddForm>
      )}

      <Title order={2} size="h3">
        Relationship types
      </Title>
      <Text size="sm" c="dimmed">
        A removed type is offered for no new relationship; existing ones keep it.
      </Text>
      <Table withTableBorder aria-label="Relationship types">
        <Table.Tbody>
          {linkTypes.map((type) => (
            <Table.Tr key={type.id}>
              <Table.Td>
                <NameInput
                  key={type.name}
                  label={`Name of relationship type ${type.name}`}
                  value={type.name}
                  readOnly={!isAdmin}
                  onSave={(name) => change.mutate({ path: `link-types/${type.id}`, body: { name }, method: "PATCH" })}
                />
              </Table.Td>
              <Table.Td>
                <Checkbox
                  label="Counts for verification (test case downstream)"
                  checked={type.role === "verifies"}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    change.mutate({
                      path: `link-types/${type.id}`,
                      body: { role: e.currentTarget.checked ? "verifies" : null },
                      method: "PATCH",
                    })
                  }
                />
              </Table.Td>
              {isAdmin && (
                <Table.Td ta="right">
                  <Button
                    size="compact-sm"
                    variant="default"
                    aria-label={`Remove relationship type ${type.name}`}
                    onClick={() => remove(`link-types/${type.id}`, `the relationship type ${type.name}`)}
                  >
                    Remove
                  </Button>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {isAdmin && (
        <AddForm
          label="New relationship type"
          onAdd={(name) =>
            change.mutate({
              path: `projects/${projectId}/link-types`,
              body: { name, role: newLink.verifies ? "verifies" : null },
            })
          }
        >
          <Checkbox
            label="Counts for verification"
            checked={newLink.verifies}
            onChange={(e) => setNewLink({ verifies: e.currentTarget.checked })}
            mb={6}
          />
        </AddForm>
      )}
    </Stack>
  );
}
