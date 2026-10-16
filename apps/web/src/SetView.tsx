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
  MultiSelect,
  NativeSelect,
  NumberInput,
  SegmentedControl,
  Select,
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
import { type FormEvent, type ReactNode, useRef, useState } from "react";
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
import { useNodeDrag } from "./dragdrop.ts";
import { EmptyState } from "./help.tsx";
import { ImportForm } from "./ImportForm.tsx";
import { RouterAnchor } from "./links.tsx";
import { NodeActions } from "./NodeActions.tsx";
import { childrenOf, itemsWithin, useProject } from "./ProjectPage.tsx";
import { useLinks } from "./Relationships.tsx";
import { ExportMenu } from "./Reqif.tsx";
import { RichView } from "./RichView.tsx";
import { KindIcon, StatusBadge } from "./Status.tsx";
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

/** The direct sub-folders of a set or folder, above its items, each with its item count. */
function SubFolders({ data, containerId }: { data: ProjectDetail; containerId: string }) {
  const folders = childrenOf(data.nodes, containerId).filter((n) => n.kind === "folder");
  if (folders.length === 0) return null;
  return (
    <Table withTableBorder aria-label="Folders">
      <Table.Tbody>
        {folders.map((folder) => {
          const items = itemsWithin(data.nodes, folder.id).length;
          return (
            <Table.Tr key={folder.id}>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  <KindIcon kind="folder" />
                  <RouterAnchor
                    to="/projects/$projectId/folders/$nodeId"
                    params={{ projectId: data.project.id, nodeId: folder.id }}
                  >
                    {folder.name}
                  </RouterAnchor>
                </Group>
              </Table.Td>
              <Table.Td c="dimmed" ta="right" w={120}>
                {items} {items === 1 ? "item" : "items"}
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
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
  const subfolders = childrenOf(data.nodes, folder?.id ?? set.id).filter((n) => n.kind === "folder").length;

  return (
    <Stack gap="sm">
      {/* Printed Reading view has its own cover page instead. */}
      <Group justify="space-between" align="flex-start" className={view === "reading" ? "print-hide" : undefined}>
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
          {!folder && <ExportMenu path={`sets/${set.id}`} fields={list.data?.fields.map((f) => f.name)} />}
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
      {view === undefined && <SubFolders data={data} containerId={folder?.id ?? set.id} />}
      {count === 0 && subfolders === 0 && (
        <EmptyState page="getting-started" label="About sets and items">
          No items here yet. Add an item or folder above, or import a file.
        </EmptyState>
      )}
      {count > 0 && list.data && view === "reading" && (
        <ReadingView data={data} list={list.data} containerId={folder?.id ?? set.id} title={title} />
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
            folders={data.nodes.filter((n) => n.setId === set.id && n.kind === "folder")}
            uids={new Set(list.data.items.map((i) => i.uid))}
            texts={new Map(list.data.items.map((i) => [i.uid, docToText(i.description)]))}
            onDone={() => setImporting(false)}
          />
        )}
      </Modal>
    </Stack>
  );
}

/**
 * Reads like a document: folder names as headings, then each item's name and description in order.
 * Everything is numbered as an outline (1, 1.2, 1.2.1), so child items read as numbered under their parent.
 */
function ReadingView({
  data,
  list,
  containerId,
  title,
}: {
  data: ProjectDetail;
  list: SetItems;
  containerId: string;
  title: string;
}) {
  const projectId = data.project.id;
  // The running header of printed pages. A CSS string: backslashes and quotes escaped.
  const header = `${data.project.name} · ${title}`.replace(/[\\"]/g, "\\$&").replace(/\s+/g, " ");
  const details = new Map(list.items.map((item) => [item.id, item]));
  const level = (id: string, depth: number, prefix: string): ReactNode[] =>
    childrenOf(data.nodes, id).map((node, index) => {
      const number = `${prefix}${index + 1}`;
      return node.kind === "folder" ? (
        <section key={node.id}>
          <Title order={Math.min(depth + 2, 6) as 2 | 3 | 4 | 5 | 6} size={depth === 0 ? "h3" : "h4"} mt="md" mb="xs">
            {number} {node.name}
          </Title>
          {level(node.id, depth + 1, `${number}.`)}
        </section>
      ) : (
        <article key={node.id} style={{ marginBottom: 16 }}>
          <Group gap="xs" wrap="nowrap" align="baseline" className="print-keep-next">
            <Text fw={600}>
              {number}{" "}
              <RouterAnchor to="/projects/$projectId/items/$nodeId" params={{ projectId, nodeId: node.id }} inherit>
                {node.uid}
              </RouterAnchor>{" "}
              {node.name}
            </Text>
            <StatusBadge status={node.status} />
          </Group>
          <RichView doc={details.get(node.id)?.description ?? { type: "doc" }} />
          {/* Child items, set in under their parent. */}
          {data.nodes.some((n) => n.parentId === node.id) && (
            <div style={{ paddingLeft: 24, marginTop: 16 }}>{level(node.id, depth + 1, `${number}.`)}</div>
          )}
        </article>
      );
    });
  return (
    <div
      style={{
        maxWidth: 820,
        background: "var(--mantine-color-body)",
        padding: "8px 24px",
        border: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <style>{`@media print { @page { @top-center { content: "${header}"; } } }`}</style>
      <div className="print-only print-cover">
        <Title order={1}>{title}</Title>
        <Text size="lg">{data.project.name}</Text>
        <Text c="dimmed">Printed {new Date().toLocaleDateString()}</Text>
      </div>
      {level(containerId, 0, "")}
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
  // Bulk actions: the ticked rows, and which dialog is open for them.
  const [selected, setSelected] = useState<string[]>([]);
  // The kind stays set while the dialog fades out, so its title does not change as it closes.
  const [bulk, setBulk] = useState<"edit" | "move" | "delete">("edit");
  const [bulkOpen, setBulkOpen] = useState(false);
  // What the open dialog acts on: the selection as it was when the dialog opened.
  const [bulkItems, setBulkItems] = useState<{ id: string; uid: string }[]>([]);
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState<unknown>(null);

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

  // Only rows that are shown can be acted on: a filter narrows a selection, it never hides part of it.
  const chosen = rows.filter((r) => selected.includes(r.item.id));
  const shownIds = rows.map((r) => r.item.id);
  const toggle = (ids: string[], on: boolean) =>
    setSelected((previous) => (on ? [...new Set([...previous, ...ids])] : previous.filter((id) => !ids.includes(id))));
  const bulkFields = list.fields.filter((f) => f.type !== "steps");
  const field = bulkFields.find((f) => f.id === bulkField) ?? bulkFields[0];
  const folders = data.nodes.filter((n) => n.setId === set.id && n.kind === "folder");
  const pathOf = (folder: TreeNode): string => {
    const parent = folders.find((n) => n.id === folder.parentId);
    return parent ? `${pathOf(parent)} / ${folder.name}` : folder.name;
  };
  const act = useMutation({
    mutationFn: (body: object) =>
      api<{ changed: number }>(`sets/${set.id}/bulk`, { ...body, itemIds: bulkItems.map((item) => item.id) }),
    onSuccess: () => {
      setBulkOpen(false);
      setSelected([]);
      setBulkValue(null);
      return queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
  const openBulk = (next: typeof bulk) => {
    act.reset();
    setBulk(next);
    setBulkItems(chosen.map((r) => ({ id: r.item.id, uid: r.item.uid })));
    setBulkOpen(true);
  };
  const onBulk = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (bulk === "delete") act.mutate({ action: "delete" });
    if (bulk === "move") act.mutate({ action: "move", parentId: String(form.get("destination")) || null });
    if (bulk === "edit" && field) {
      act.mutate({
        action: "edit",
        attributes: { [field.id]: bulkValue },
        changeReason: String(form.get("changeReason")) || undefined,
      });
    }
  };
  // Dragging reorders and moves in the order of the set, so it is offered only while the list is in that order.
  // A ticked row dragged with others ticked moves them all, last in the destination.
  const inOrder = !sort && rows.length === all.length;
  const dnd = useNodeDrag(projectId, data.nodes, (draggedId, placement) =>
    selected.includes(draggedId) && selected.length > 1
      ? api(`sets/${set.id}/bulk`, { action: "move", itemIds: selected, parentId: placement.parentId }).then(() =>
          setSelected([]),
        )
      : api(`nodes/${draggedId}/move`, placement),
  );
  const treeNode = (id: string) => data.nodes.find((n) => n.id === id) as TreeNode;
  const itemCount = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;
  const things = itemCount(bulkItems.length);

  // The folders between the shown container and an item, as an import reads them back: "Power / Supply".
  const folderPath = (id: string) => {
    const names: string[] = [];
    for (let at = data.nodes.find((n) => n.id === id)?.parentId; at && at !== containerId; ) {
      const folder = data.nodes.find((n) => n.id === at);
      // A parent item is not a folder: the Folder column names folders only.
      if (folder?.kind !== "item") names.unshift(folder?.name ?? "");
      at = folder?.parentId;
    }
    return names.join(" / ");
  };
  // Exports what the table shows now: the filtered, sorted rows and the chosen columns, plus each description as text.
  const exportCsv = () => {
    const csv = toCsv([
      ["ID", "Folder", "Name", "Description", ...shown.map((c) => c.label)],
      ...rows.map((r) => [
        r.item.uid,
        folderPath(r.item.id),
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
      {chosen.length > 0 && (
        <Group gap="xs" role="toolbar" aria-label="Actions on the selected items">
          <Text size="sm" fw={600}>
            {itemCount(chosen.length)} selected
          </Text>
          <Button size="compact-sm" variant="default" disabled={!field} onClick={() => openBulk("edit")}>
            Set a field…
          </Button>
          <Button size="compact-sm" variant="default" onClick={() => openBulk("move")}>
            Move to…
          </Button>
          <Button size="compact-sm" variant="default" color="red" onClick={() => openBulk("delete")}>
            Delete
          </Button>
          <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setSelected([])}>
            Clear selection
          </Button>
          {chosen.length > 500 && (
            <Text size="sm" c="red">
              At most 500 items can be changed at once.
            </Text>
          )}
        </Group>
      )}

      {dnd.error && (
        <Alert color="red" role="alert" withCloseButton onClose={dnd.reset}>
          {dnd.error.message}
        </Alert>
      )}
      {rows.length === 0 ? (
        <Text c="dimmed">No items match.</Text>
      ) : (
        <Table.ScrollContainer minWidth={280 + 150 * shown.length}>
          <Table
            withTableBorder
            withColumnBorders
            highlightOnHover
            bg="var(--mantine-color-body)"
            aria-label={`Items in ${title}`}
          >
            <Table.Thead>
              <Table.Tr>
                {canEdit(data.role) && (
                  <Table.Th w={36}>
                    <Checkbox
                      aria-label="Select all items shown"
                      checked={shownIds.every((id) => selected.includes(id))}
                      indeterminate={chosen.length > 0 && chosen.length < rows.length}
                      onChange={(e) => toggle(shownIds, e.currentTarget.checked)}
                    />
                  </Table.Th>
                )}
                {canEdit(data.role) && inOrder && <Table.Th w={28} aria-label="Drag to reorder" />}
                {header("id", "ID", 130)}
                {header("name", "Name")}
                {shown.map((column) => header(column.id, column.label))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr
                  key={row.item.id}
                  {...(canEdit(data.role) && inOrder ? dnd.dropProps(treeNode(row.item.id), set.id) : {})}
                >
                  {canEdit(data.role) && inOrder && (
                    <Table.Td
                      title="Drag to move or reorder. Drop on the middle of a row to make a child item."
                      style={{ cursor: "grab", userSelect: "none" }}
                      {...dnd.dragProps(treeNode(row.item.id), (el) => el.closest("tr"))}
                    >
                      <span aria-hidden>⠿</span>
                    </Table.Td>
                  )}
                  {canEdit(data.role) && (
                    <Table.Td>
                      <Checkbox
                        aria-label={`Select ${row.item.uid}`}
                        checked={selected.includes(row.item.id)}
                        onChange={(e) => toggle([row.item.id], e.currentTarget.checked)}
                      />
                    </Table.Td>
                  )}
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
                      {editing && column.field && column.field.type !== "steps" ? (
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

      <Modal
        opened={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={bulk === "edit" ? `Set a field on ${things}` : bulk === "move" ? `Move ${things}` : `Delete ${things}?`}
      >
        <form onSubmit={onBulk}>
          <Stack gap="sm">
            {bulk === "edit" && field && (
              <>
                <NativeSelect
                  label="Field"
                  data={bulkFields.map((f) => ({ value: f.id, label: f.name }))}
                  value={field.id}
                  onChange={(e) => {
                    setBulkField(e.currentTarget.value);
                    setBulkValue(null);
                  }}
                />
                <div>
                  <Text size="sm" fw={500} mb={2}>
                    New value
                  </Text>
                  <CellInput
                    field={field}
                    label={`New value of ${field.name}`}
                    value={bulkValue}
                    onChange={setBulkValue}
                  />
                  <Text size="xs" c="dimmed" mt={2}>
                    Left empty, the field is cleared.
                  </Text>
                </div>
                <TextInput name="changeReason" label="Reason for the change" maxLength={500} />
                <Text size="sm">
                  Each item that does not have this value yet gets a new version. Nothing else about it changes.
                </Text>
              </>
            )}
            {bulk === "move" && (
              <Select
                name="destination"
                label="Move to"
                description="The items are placed last in the destination, in the order they have now."
                data={[
                  { value: "", label: `${set.name} (top level)` },
                  ...folders.map((f) => ({ value: f.id, label: pathOf(f) })),
                ]}
                defaultValue=""
                allowDeselect={false}
                searchable
              />
            )}
            {bulk === "delete" && (
              <Text size="sm">
                {bulkItems
                  .slice(0, 10)
                  .map((item) => item.uid)
                  .join(", ")}
                {bulkItems.length > 10 && ` and ${bulkItems.length - 10} more`}. They disappear from the project, but
                their history is kept, their IDs are never reused, and they can be restored from Deleted items.
              </Text>
            )}
            {act.isError && (
              <Alert color="red" role="alert">
                {act.error.message}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setBulkOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                color={bulk === "delete" ? "red" : undefined}
                loading={act.isPending}
                disabled={bulkItems.length > 500}
              >
                {bulk === "edit" ? `Change ${things}` : bulk === "move" ? `Move ${things}` : `Delete ${things}`}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
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
    case "multi_enum":
      return (
        <MultiSelect
          size="xs"
          aria-label={label}
          data={field.options ?? []}
          value={(value as string[]) ?? []}
          onChange={(next) => onChange(next.length > 0 ? next : null)}
          clearable
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
