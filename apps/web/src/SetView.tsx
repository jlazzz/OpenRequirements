import { toCsv } from "@app/importers";
import { docToText } from "@app/shared";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  NativeSelect,
  NumberInput,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { type FormEvent, useRef, useState } from "react";
import {
  type Attributes,
  api,
  canEdit,
  download,
  type Field,
  formatValue,
  isSuspect,
  isTestSet,
  type ProjectDetail,
  type ProjectSet,
  type SetItems,
  type TreeNode,
} from "./api.ts";
import { ImportForm } from "./ImportForm.tsx";
import { RouterAnchor } from "./links.tsx";
import { NodeActions } from "./NodeActions.tsx";
import { childrenOf, itemsWithin, useProject } from "./ProjectPage.tsx";
import { useLinks } from "./Relationships.tsx";
import { RichView } from "./RichView.tsx";
import { StatusBadge } from "./Status.tsx";
import { TraceView } from "./TraceView.tsx";
import { OutcomeBadge, resultText, STATUSES, statusText, useVerification, VerificationBadge } from "./Verification.tsx";

export function SetPage() {
  const project = useProject();
  const { setId } = useParams({ from: "/projects/$projectId/sets/$setId" });
  const set = project.data?.sets.find((s) => s.id === setId);
  if (!project.data || !set) return <Alert color="red">Set not found.</Alert>;
  return <Container key={set.id} data={project.data} set={set} title={set.name} />;
}

export function FolderPage() {
  const project = useProject();
  const { nodeId } = useParams({ from: "/projects/$projectId/folders/$nodeId" });
  const folder = project.data?.nodes.find((n) => n.id === nodeId && n.kind === "folder");
  const set = project.data?.sets.find((s) => s.id === folder?.setId);
  if (!project.data || !folder || !set) return <Alert color="red">Folder not found.</Alert>;
  return <Container key={folder.id} data={project.data} set={set} folder={folder} title={folder.name} />;
}

type ContainerProps = { data: ProjectDetail; set: ProjectSet; folder?: TreeNode; title: string };

/** A set or one of its folders, shown as a List view or a Reading view. */
function Container({ data, set, folder, title }: ContainerProps) {
  const [adding, setAdding] = useState<"item" | "folder" | null>(null);
  const [importing, setImporting] = useState(false);
  const { view } = useSearch({ strict: false });
  const navigate = useNavigate();
  const projectId = data.project.id;
  const list = useQuery({
    queryKey: ["projects", projectId, "sets", set.id],
    queryFn: () => api<SetItems>(`sets/${set.id}/items`),
  });
  const count = itemsWithin(data.nodes, folder?.id ?? set.id).length;
  const editor = canEdit(data.role);

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={1} size="h2">
            {title}
          </Title>
          <Text c="dimmed" size="sm">
            {folder ? `Folder in ${set.name}` : `Set of ${set.itemType} items`} · {count}{" "}
            {count === 1 ? "item" : "items"}
          </Text>
        </div>
        <Group gap="xs" className="print-hide">
          {view === "reading" && (
            <Button variant="default" onClick={() => window.print()}>
              Print or save as PDF
            </Button>
          )}
          <SegmentedControl
            aria-label="View"
            value={view ?? "list"}
            onChange={(value) =>
              navigate({ to: ".", search: { view: value === "reading" || value === "trace" ? value : undefined } })
            }
            data={[
              { value: "list", label: "List" },
              { value: "reading", label: "Reading" },
              { value: "trace", label: "Trace" },
            ]}
          />
          {editor && folder && <NodeActions data={data} node={folder} />}
          {editor && (
            <Button variant="default" onClick={() => setAdding("folder")}>
              Add folder
            </Button>
          )}
          {editor && (
            <Button variant="default" onClick={() => setImporting(true)} disabled={!list.data}>
              Import
            </Button>
          )}
          {editor && <Button onClick={() => setAdding("item")}>Add item</Button>}
        </Group>
      </Group>

      {list.isError && (
        <Alert color="red" role="alert">
          {list.error.message}
        </Alert>
      )}
      {count === 0 && <Text c="dimmed">No items here yet.</Text>}
      {count > 0 && list.data && view === "reading" && (
        <ReadingView data={data} list={list.data} containerId={folder?.id ?? set.id} />
      )}
      {count > 0 && view === "trace" && (
        <TraceView data={data} set={set} containerId={folder?.id ?? set.id} title={title} />
      )}
      {count > 0 && list.data && view === undefined && (
        <ListTable data={data} set={set} list={list.data} containerId={folder?.id ?? set.id} title={title} />
      )}

      <Modal
        opened={adding !== null}
        onClose={() => setAdding(null)}
        title={adding === "folder" ? "Add folder" : `Add ${set.itemType}`}
      >
        {adding && (
          <AddNodeForm
            kind={adding}
            projectId={projectId}
            setId={set.id}
            parentId={folder?.id}
            onDone={() => setAdding(null)}
          />
        )}
      </Modal>
      <Modal opened={importing} onClose={() => setImporting(false)} size="xl" title={`Import into ${title}`}>
        {importing && list.data && (
          <ImportForm
            projectId={projectId}
            setId={set.id}
            parentId={folder?.id}
            fields={list.data.fields}
            onDone={() => setImporting(false)}
          />
        )}
      </Modal>
    </Stack>
  );
}

/** Reads like a document: folder names as headings, then each item's name and description in order. */
function ReadingView({ data, list, containerId }: { data: ProjectDetail; list: SetItems; containerId: string }) {
  const projectId = data.project.id;
  const details = new Map(list.items.map((item) => [item.id, item]));
  const level = (id: string, depth: number) =>
    childrenOf(data.nodes, id).map((node) =>
      node.kind === "folder" ? (
        <section key={node.id}>
          <Title order={Math.min(depth + 2, 6) as 2 | 3 | 4 | 5 | 6} size={depth === 0 ? "h3" : "h4"} mt="md" mb="xs">
            {node.name}
          </Title>
          {level(node.id, depth + 1)}
        </section>
      ) : (
        <article key={node.id} style={{ marginBottom: 16 }}>
          <Group gap="xs" wrap="nowrap" align="baseline">
            <Text fw={600}>
              <RouterAnchor to="/projects/$projectId/items/$nodeId" params={{ projectId, nodeId: node.id }} inherit>
                {node.uid}
              </RouterAnchor>{" "}
              {node.name}
            </Text>
            <StatusBadge status={node.status} />
          </Group>
          <RichView doc={details.get(node.id)?.description ?? { type: "doc" }} />
        </article>
      ),
    );
  return (
    <div
      style={{
        maxWidth: 820,
        background: "white",
        padding: "8px 24px",
        border: "1px solid var(--mantine-color-gray-3)",
      }}
    >
      {level(containerId, 0)}
    </div>
  );
}

type Edit = { baseRevision: number; name: string; attributes: Attributes };
type SortKey = { column: string; descending: boolean } | null;
const AUTOSAVE_MS = 600;

/** List view: one row per item (including sub-folders), one column per field. Sort, filter, choose columns, edit in place. */
function ListTable({
  data,
  set,
  list,
  containerId,
  title,
}: Omit<ContainerProps, "folder"> & { list: SetItems; containerId: string }) {
  const projectId = data.project.id;
  const queryClient = useQueryClient();
  const links = useLinks(projectId).data?.links ?? [];
  // Test cases show their latest result; every other item shows its verification status.
  const verification = useVerification(projectId).data;
  const testSet = isTestSet(set);
  const [coverage, setCoverage] = useState<"all" | "no-upstream" | "no-downstream">("all");
  const [verified, setVerified] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>(null);
  const [hidden, setHidden] = useLocalStorage<string[]>({ key: `list-hidden-columns:${set.id}`, defaultValue: [] });
  const [editing, setEditing] = useState(false);
  // This user's unsaved-as-version edits, keyed by item id. Starts from the drafts the server already holds.
  const [edits, setEdits] = useState<Record<string, Edit>>(() =>
    Object.fromEntries(
      list.drafts.map((d) => [d.itemId, { baseRevision: d.baseRevision, name: d.name, attributes: d.attributes }]),
    ),
  );
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const details = new Map(list.items.map((item) => [item.id, item]));
  const count = (id: string, end: "upstreamId" | "downstreamId") => links.filter((l) => l[end] === id).length;
  const suspect = (id: string, end: "upstreamId" | "downstreamId") => links.some((l) => l[end] === id && isSuspect(l));
  const all = itemsWithin(data.nodes, containerId).flatMap((node) => {
    const item = details.get(node.id);
    if (!item) return [];
    const edit = edits[node.id];
    // An item's upstream relationships are the links where it is the downstream end, and the reverse.
    return [
      {
        item,
        edit,
        name: edit?.name ?? item.name,
        attributes: edit?.attributes ?? item.attributes,
        upstream: count(node.id, "downstreamId"),
        downstream: count(node.id, "upstreamId"),
        suspect: { upstream: suspect(node.id, "downstreamId"), downstream: suspect(node.id, "upstreamId") },
        requirement: testSet ? undefined : verification?.requirements[node.id],
        result: testSet ? verification?.tests[node.id] : undefined,
      },
    ];
  });

  const columns = [
    { id: "verification", label: testSet ? "Last result" : "Verification", field: undefined },
    ...list.fields.map((field) => ({ id: field.id, label: field.name, field })),
    { id: "upstream", label: "Upstream", field: undefined },
    { id: "downstream", label: "Downstream", field: undefined },
  ];
  const shown = columns.filter((c) => !hidden.includes(c.id));
  type Row = (typeof all)[number];
  const cell = (row: Row, column: string): string | number =>
    column === "id"
      ? row.item.uid
      : column === "name"
        ? row.name
        : column === "upstream"
          ? row.upstream
          : column === "downstream"
            ? row.downstream
            : column === "verification"
              ? testSet
                ? resultText(row.result)
                : statusText(row.requirement)
              : formatValue(row.attributes[column]);

  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  let rows = all
    .filter((r) => coverage === "all" || (coverage === "no-upstream" ? r.upstream === 0 : r.downstream === 0))
    .filter(
      (r) => !verified || (verified === "out_of_date" ? r.requirement?.outOfDate : r.requirement?.status === verified),
    )
    .filter((r) => {
      const text = ["id", "name", ...list.fields.map((f) => f.id)]
        .map((c) => cell(r, c))
        .join(" ")
        .toLowerCase();
      return words.every((word) => text.includes(word));
    });
  if (sort) {
    const direction = sort.descending ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const [x, y] = [cell(a, sort.column), cell(b, sort.column)];
      return (
        direction *
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true }))
      );
    });
  }

  // Editing a cell saves a private draft, exactly like editing on the item's own page.
  const change = (row: Row, patch: Partial<Pick<Edit, "name" | "attributes">>) => {
    const next: Edit = {
      baseRevision: row.edit?.baseRevision ?? row.item.revision,
      name: row.name,
      attributes: row.attributes,
      ...patch,
    };
    setEdits((previous) => ({ ...previous, [row.item.id]: next }));
    clearTimeout(timers.current[row.item.id]);
    timers.current[row.item.id] = setTimeout(() => {
      const description = list.drafts.find((d) => d.itemId === row.item.id)?.description ?? row.item.description;
      api(`items/${row.item.id}/draft`, { ...next, description }, "PUT").catch((error: Error) =>
        setProblem(`${row.item.uid}: ${error.message}`),
      );
    }, AUTOSAVE_MS);
  };
  const drafted = all.filter((r) => r.edit);
  const finish = useMutation({
    mutationFn: async (action: "save" | "discard") => {
      setProblem(null);
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
      const failures: string[] = [];
      for (const row of drafted) {
        const description = list.drafts.find((d) => d.itemId === row.item.id)?.description ?? row.item.description;
        const request =
          action === "save"
            ? api(`items/${row.item.id}/revisions`, { ...row.edit, description })
            : api(`items/${row.item.id}/draft`, undefined, "DELETE");
        await request.then(
          () => setEdits(({ [row.item.id]: _done, ...rest }) => rest),
          (error: Error) => failures.push(`${row.item.uid}: ${error.message}`),
        );
      }
      if (failures.length > 0) throw new Error(failures.join(" · "));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
  });

  // Exports what the table shows now: the filtered, sorted rows and the chosen columns, plus each description as text.
  const exportCsv = () => {
    const csv = toCsv([
      ["ID", "Name", "Description", ...shown.map((c) => c.label)],
      ...rows.map((r) => [
        r.item.uid,
        r.name,
        docToText(r.item.description),
        ...shown.map((c) => {
          const value = r.attributes[c.id];
          return c.field && typeof value === "number" ? value : cell(r, c.id);
        }),
      ]),
    ]);
    download(`${title}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  };

  const header = (id: string, label: string, width?: number) => {
    const active = sort?.column === id;
    return (
      <Table.Th key={id} w={width} aria-sort={active ? (sort.descending ? "descending" : "ascending") : undefined}>
        <UnstyledButton
          fw={700}
          fz="sm"
          onClick={() =>
            setSort(
              active ? (sort.descending ? null : { column: id, descending: true }) : { column: id, descending: false },
            )
          }
        >
          {label} {active ? (sort.descending ? "▼" : "▲") : ""}
        </UnstyledButton>
      </Table.Th>
    );
  };

  return (
    <Stack gap="xs">
      <Group gap="sm">
        <SegmentedControl
          aria-label="Coverage filter"
          size="xs"
          value={coverage}
          onChange={(value) => setCoverage(value as typeof coverage)}
          data={[
            { value: "all", label: `All (${all.length})` },
            { value: "no-upstream", label: `No upstream (${all.filter((r) => r.upstream === 0).length})` },
            { value: "no-downstream", label: `No downstream (${all.filter((r) => r.downstream === 0).length})` },
          ]}
        />
        {!testSet && (
          <NativeSelect
            aria-label="Verification filter"
            size="xs"
            value={verified}
            onChange={(e) => setVerified(e.currentTarget.value)}
            data={[
              { value: "", label: "Any verification" },
              ...STATUSES,
              { value: "out_of_date", label: "Out of date" },
            ]}
          />
        )}
        <TextInput
          aria-label="Filter rows"
          placeholder="Filter rows"
          size="xs"
          w={200}
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
        />
        <Menu closeOnItemClick={false}>
          <Menu.Target>
            <Button size="compact-sm" variant="default">
              Columns
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {columns.map((column) => (
              <Menu.Item key={column.id} component="div">
                <Checkbox
                  label={column.label}
                  checked={!hidden.includes(column.id)}
                  onChange={(e) =>
                    setHidden(
                      e.currentTarget.checked ? hidden.filter((id) => id !== column.id) : [...hidden, column.id],
                    )
                  }
                />
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <Button size="compact-sm" variant="default" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
        {canEdit(data.role) && (
          <Switch label="Edit in place" checked={editing} onChange={(e) => setEditing(e.currentTarget.checked)} />
        )}
        {drafted.length > 0 && (
          <Group gap="xs" ml="auto">
            <Text size="sm">
              {drafted.length} {drafted.length === 1 ? "draft" : "drafts"}
            </Text>
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => finish.mutate("discard")}
              disabled={finish.isPending}
            >
              Discard
            </Button>
            <Button size="compact-sm" onClick={() => finish.mutate("save")} loading={finish.isPending}>
              Save as versions
            </Button>
          </Group>
        )}
      </Group>
      {(problem || finish.isError) && (
        <Alert color="red" role="alert">
          {problem ?? finish.error?.message}
        </Alert>
      )}

      {rows.length === 0 ? (
        <Text c="dimmed">No items match.</Text>
      ) : (
        <Table.ScrollContainer minWidth={280 + 150 * shown.length}>
          <Table withTableBorder withColumnBorders highlightOnHover bg="white" aria-label={`Items in ${title}`}>
            <Table.Thead>
              <Table.Tr>
                {header("id", "ID", 130)}
                {header("name", "Name")}
                {shown.map((column) => header(column.id, column.label))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.item.id}>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>
                    <RouterAnchor
                      to="/projects/$projectId/items/$nodeId"
                      params={{ projectId, nodeId: row.item.id }}
                      size="sm"
                    >
                      {row.item.uid}
                    </RouterAnchor>
                    {row.edit && (
                      <Badge color="yellow" variant="light" size="xs" radius="sm" ml={6}>
                        Draft
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {editing ? (
                      <TextInput
                        size="xs"
                        aria-label={`Name of ${row.item.uid}`}
                        maxLength={200}
                        value={row.name}
                        onChange={(e) => change(row, { name: e.currentTarget.value })}
                      />
                    ) : (
                      row.name
                    )}
                  </Table.Td>
                  {shown.map((column) => (
                    <Table.Td key={column.id} c={column.field || cell(row, column.id) !== 0 ? undefined : "dimmed"}>
                      {editing && column.field && column.field.type !== "multi_enum" ? (
                        <CellInput
                          field={column.field}
                          label={`${column.label} of ${row.item.uid}`}
                          value={row.attributes[column.id]}
                          onChange={(value) => change(row, { attributes: { ...row.attributes, [column.id]: value } })}
                        />
                      ) : column.field?.name === "Status" ? (
                        <StatusBadge status={row.attributes[column.id]} />
                      ) : column.id === "verification" ? (
                        <>
                          <VerificationBadge entry={row.requirement} />
                          <OutcomeBadge result={row.result} />
                        </>
                      ) : (
                        cell(row, column.id)
                      )}
                      {!column.field && row.suspect[column.id as "upstream" | "downstream"] && (
                        <Text
                          span
                          c="orange.8"
                          ml={4}
                          role="img"
                          aria-label={`${row.item.uid} has a suspect ${column.id} relationship`}
                          title="Suspect: an item changed since a relationship was confirmed"
                        >
                          ⚠
                        </Text>
                      )}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

function CellInput({
  field,
  label,
  value,
  onChange,
}: {
  field: Field;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "enum":
      return (
        <NativeSelect
          size="xs"
          aria-label={label}
          data={["", ...(field.options ?? [])]}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.currentTarget.value || null)}
        />
      );
    case "number":
      return (
        <NumberInput
          size="xs"
          aria-label={label}
          value={(value as number) ?? ""}
          onChange={(next) => onChange(typeof next === "number" ? next : null)}
        />
      );
    case "boolean":
      return (
        <Checkbox aria-label={label} checked={value === true} onChange={(e) => onChange(e.currentTarget.checked)} />
      );
    default:
      return (
        <TextInput
          size="xs"
          type={field.type === "date" ? "date" : "text"}
          aria-label={label}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.currentTarget.value || null)}
        />
      );
  }
}

function AddNodeForm(props: {
  kind: "item" | "folder";
  projectId: string;
  setId: string;
  parentId?: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: (name: string) =>
      api<{ node: TreeNode }>(`sets/${props.setId}/nodes`, { kind: props.kind, name, parentId: props.parentId }),
    onSuccess: async ({ node }) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", props.projectId] });
      props.onDone();
      if (node.kind === "item") {
        await navigate({
          to: "/projects/$projectId/items/$nodeId",
          params: { projectId: props.projectId, nodeId: node.id },
        });
      }
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate(String(new FormData(event.currentTarget).get("name")));
  };

  return (
    <form onSubmit={onSubmit}>
      <Stack gap="sm">
        <TextInput name="name" label="Name" required maxLength={200} data-autofocus />
        {create.isError && (
          <Alert color="red" role="alert">
            {create.error.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Add
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
