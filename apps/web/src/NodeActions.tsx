import { Alert, Button, Group, Menu, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { api, type ProjectDetail, type TreeNode } from "./api.ts";

const ROOT = "root";

/** Ids of everything below a node. */
function descendants(nodes: TreeNode[], id: string): string[] {
  return nodes.filter((n) => n.parentId === id).flatMap((n) => [n.id, ...descendants(nodes, n.id)]);
}

/** "Actions" menu for a folder or item: reorder, move, rename (folders) and delete. */
export function NodeActions({ data, node }: { data: ProjectDetail; node: TreeNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"move" | "rename" | "delete" | null>(null);
  const projectId = data.project.id;
  const set = data.sets.find((s) => s.id === node.setId);
  const label = node.kind === "item" ? `${node.uid} ${node.name}` : node.name;

  const siblings = data.nodes.filter((n) => n.setId === node.setId && n.parentId === node.parentId);
  const index = siblings.findIndex((n) => n.id === node.id);
  const inside = descendants(data.nodes, node.id);
  const folders = data.nodes.filter(
    (n) => n.setId === node.setId && n.kind === "folder" && n.id !== node.id && !inside.includes(n.id),
  );
  const pathOf = (folder: TreeNode): string => {
    const parent = data.nodes.find((n) => n.id === folder.parentId);
    return parent ? `${pathOf(parent)} / ${folder.name}` : folder.name;
  };
  const destinations = [
    { value: ROOT, label: `${set?.name ?? "Set"} (top level)` },
    ...folders.map((f) => ({ value: f.id, label: pathOf(f) })),
  ].filter((d) => d.value !== (node.parentId ?? ROOT));

  const run = useMutation({
    mutationFn: (request: () => Promise<unknown>) => request(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      setDialog(null);
    },
  });
  const move = (parentId: string | null, beforeId: string | null) =>
    run.mutate(() => api(`nodes/${node.id}/move`, { parentId, beforeId }));
  const remove = () =>
    run.mutate(async () => {
      await api(`nodes/${node.id}`, undefined, "DELETE");
      // Leave the page of the thing that no longer exists.
      await (node.parentId
        ? navigate({ to: "/projects/$projectId/folders/$nodeId", params: { projectId, nodeId: node.parentId } })
        : navigate({ to: "/projects/$projectId/sets/$setId", params: { projectId, setId: node.setId } }));
    });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (dialog === "rename") run.mutate(() => api(`nodes/${node.id}`, { name: String(form.get("name")) }, "PATCH"));
    if (dialog === "move") {
      const destination = String(form.get("destination"));
      move(destination === ROOT ? null : destination, null);
    }
  };
  const open = (next: typeof dialog) => {
    run.reset();
    setDialog(next);
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button variant="default" loading={run.isPending && dialog === null}>
            Actions
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item disabled={index <= 0} onClick={() => move(node.parentId, siblings[index - 1]?.id ?? null)}>
            Move up
          </Menu.Item>
          <Menu.Item
            disabled={index >= siblings.length - 1}
            onClick={() => move(node.parentId, siblings[index + 2]?.id ?? null)}
          >
            Move down
          </Menu.Item>
          <Menu.Item disabled={destinations.length === 0} onClick={() => open("move")}>
            Move to…
          </Menu.Item>
          {node.kind === "folder" && <Menu.Item onClick={() => open("rename")}>Rename</Menu.Item>}
          <Menu.Divider />
          <Menu.Item color="red" onClick={() => open("delete")}>
            Delete
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {run.isError && dialog === null && (
        <Alert color="red" role="alert" withCloseButton onClose={run.reset}>
          {run.error.message}
        </Alert>
      )}

      <Modal
        opened={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "move" ? `Move ${label}` : dialog === "rename" ? "Rename folder" : `Delete ${label}?`}
      >
        <form onSubmit={onSubmit}>
          <Stack gap="sm">
            {dialog === "move" && (
              <Select
                name="destination"
                label="Move to"
                description="It is placed last in the destination."
                data={destinations}
                defaultValue={destinations[0]?.value}
                allowDeselect={false}
                searchable
                required
              />
            )}
            {dialog === "rename" && (
              <TextInput name="name" label="Name" defaultValue={node.name} required maxLength={200} data-autofocus />
            )}
            {dialog === "delete" && (
              <Text size="sm">
                {inside.length > 0
                  ? `This also deletes the ${inside.length} ${inside.length === 1 ? "thing" : "things"} inside it. `
                  : ""}
                It disappears from the project, but its history is kept and its ID is never reused.
              </Text>
            )}
            {run.isError && (
              <Alert color="red" role="alert">
                {run.error.message}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              {dialog === "delete" ? (
                <Button color="red" onClick={remove} loading={run.isPending}>
                  Delete
                </Button>
              ) : (
                <Button type="submit" loading={run.isPending}>
                  {dialog === "move" ? "Move" : "Rename"}
                </Button>
              )}
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
