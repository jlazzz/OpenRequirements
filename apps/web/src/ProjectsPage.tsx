import {
  Alert,
  Button,
  Container,
  FileButton,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { api, type Project, type RunSummary, type Template } from "./api.ts";
import { RouterAnchor } from "./links.tsx";
import { useSession } from "./Root.tsx";
import { RunStateBadge } from "./TestPages.tsx";

export function ProjectsPage() {
  const isAdmin = useSession().data?.user?.isAdmin ?? false;
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<{ projects: Project[] }>("projects") });
  // The signed-in user's open test runs, in every project.
  const runs = useQuery({
    queryKey: ["test-runs", "mine"],
    queryFn: () => api<{ runs: (RunSummary & { project: string })[] }>("test-runs/mine"),
  });
  const [creating, { open, close }] = useDisclosure(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // A restore always makes a new project; it never changes an existing one.
  const restore = useMutation({
    mutationFn: async (file: File) => {
      const backup = await file.text().then(JSON.parse, () => null);
      if (!backup || typeof backup !== "object") throw new Error("This is not a backup file.");
      return api<{ project: Project }>("projects/restore", backup);
    },
    onSuccess: async ({ project }) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });

  return (
    <Container size="md" py="lg">
      <Group justify="space-between" mb="md">
        <Title order={1} size="h2">
          Projects
        </Title>
        {isAdmin && (
          <Group gap="xs">
            <FileButton onChange={(file) => file && restore.mutate(file)} accept="application/json,.json">
              {(props) => (
                <Button variant="default" loading={restore.isPending} {...props}>
                  Restore from backup
                </Button>
              )}
            </FileButton>
            <Button onClick={open}>New project</Button>
          </Group>
        )}
      </Group>

      {restore.isError && (
        <Alert color="red" role="alert" title="The backup was not restored" mb="sm">
          {restore.error.message}
        </Alert>
      )}

      {projects.isError && (
        <Alert color="red" role="alert">
          {projects.error.message}
        </Alert>
      )}
      {projects.data?.projects.length === 0 && (
        <Text c="dimmed">No projects yet.{isAdmin ? " Create the first one with “New project”." : ""}</Text>
      )}
      {projects.data && projects.data.projects.length > 0 && (
        <Table highlightOnHover withTableBorder bg="white">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Created</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {projects.data.projects.map((project) => (
              <Table.Tr key={project.id}>
                <Table.Td>
                  <RouterAnchor to="/projects/$projectId" params={{ projectId: project.id }}>
                    {project.name}
                  </RouterAnchor>
                </Table.Td>
                <Table.Td>{new Date(project.createdAt).toLocaleDateString()}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {runs.data && runs.data.runs.length > 0 && (
        <>
          <Title order={2} size="h4" mt="xl" mb="xs">
            My test runs
          </Title>
          <Table highlightOnHover withTableBorder bg="white" aria-label="My test runs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Test case</Table.Th>
                <Table.Th>Project</Table.Th>
                <Table.Th>Cycle</Table.Th>
                <Table.Th>State</Table.Th>
                <Table.Th>Steps</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {runs.data.runs.map((run) => (
                <Table.Tr key={run.id}>
                  <Table.Td>
                    <RouterAnchor
                      to="/projects/$projectId/runs/$testRunId"
                      params={{ projectId: run.projectId, testRunId: run.id }}
                    >
                      {run.uid}
                    </RouterAnchor>{" "}
                    {run.name}
                  </Table.Td>
                  <Table.Td>{run.project}</Table.Td>
                  <Table.Td>
                    <RouterAnchor
                      to="/projects/$projectId/cycles/$testCycleId"
                      params={{ projectId: run.projectId, testCycleId: run.cycleId }}
                    >
                      {run.cycle}
                    </RouterAnchor>
                  </Table.Td>
                  <Table.Td>
                    <RunStateBadge state={run.state} />
                  </Table.Td>
                  <Table.Td>
                    {run.done} of {run.total}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}

      <Modal opened={creating} onClose={close} title="New project">
        <NewProjectForm onCancel={close} />
      </Modal>
    </Container>
  );
}

function NewProjectForm({ onCancel }: { onCancel: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api<{ templates: Template[] }>("templates") });
  const create = useMutation({
    mutationFn: (fields: object) => api<{ project: Project }>("projects", fields),
    onSuccess: async ({ project }) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  };
  const options = templates.data?.templates ?? [];
  const only = options[0];

  return (
    <form onSubmit={onSubmit}>
      <Stack gap="sm">
        <TextInput name="name" label="Project name" required maxLength={100} data-autofocus />
        {only && (
          <Select
            name="templateId"
            label="Template"
            description={`Creates these sets: ${only.sets.join(", ")}.`}
            data={options.map((t) => ({ value: t.id, label: t.name }))}
            defaultValue={only.id}
            allowDeselect={false}
            required
          />
        )}
        {(create.isError || templates.isError) && (
          <Alert color="red" role="alert">
            {(create.error ?? templates.error)?.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!only}>
            Create project
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
