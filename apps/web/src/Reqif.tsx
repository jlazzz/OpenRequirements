import {
  type AppliedStructure,
  deriveReqifStructure,
  guessReqifMapping,
  guessReqifTargets,
  type ImportResult,
  mapReqif,
  type ReqifMapping,
  type ReqifTargetSet,
  reqifMappingFor,
  summarizeReqif,
} from "@app/importers";
import { parseReqif, type Reqif, unzip } from "@app/reqif";
import {
  Alert,
  Button,
  Checkbox,
  FileInput,
  Group,
  List,
  Menu,
  Modal,
  NativeSelect,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, canEdit, type SetItems, uploadImage } from "./api.ts";
import { useProject } from "./ProjectPage.tsx";
import { useLinks } from "./Relationships.tsx";

/** Asks for the Word options, then downloads. `fields` are the names the item tables can hold. */
function WordOptions({ path, fields, onClose }: { path: string; fields: string[]; onClose: () => void }) {
  const [chosen, setChosen] = useState(fields);
  const [uid, setUid] = useState("before");
  const [cover, setCover] = useState(true);
  const query = new URLSearchParams({ uid, cover: String(cover), fields: chosen.join(",") });
  return (
    <Modal opened onClose={onClose} title="Word export">
      <Stack>
        <Checkbox label="Cover page" checked={cover} onChange={(e) => setCover(e.currentTarget.checked)} />
        <NativeSelect
          label="ID"
          value={uid}
          onChange={(e) => setUid(e.currentTarget.value)}
          data={[
            { value: "before", label: "Before the name" },
            { value: "after", label: "After the name" },
          ]}
        />
        {fields.length > 0 && (
          <Checkbox.Group label="Fields in each item's table" value={chosen} onChange={setChosen}>
            <Stack gap={4} mt={4}>
              {fields.map((name) => (
                <Checkbox key={name} value={name} label={name} />
              ))}
            </Stack>
          </Checkbox.Group>
        )}
        <Button component="a" href={`/api/${path}/docx?${query}`} download onClick={onClose}>
          Download
        </Button>
      </Stack>
    </Modal>
  );
}

/** Downloads a set or a baseline as Word or ReqIF. `path` is "sets/<id>" or "baselines/<id>". */
export function ExportMenu({ path, fields = [] }: { path: string; fields?: string[] }) {
  const [word, setWord] = useState(false);
  return (
    <Menu>
      {word && <WordOptions path={path} fields={fields} onClose={() => setWord(false)} />}
      <Menu.Target>
        <Button variant="default">Export</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => setWord(true)}>Word document (.docx)…</Menu.Item>
        {path.startsWith("baselines/") && (
          <Menu.Item component="a" href={`/api/${path}/csv`} download>
            Spreadsheet with verification and suspect relationships (.csv)
          </Menu.Item>
        )}
        <Menu.Item component="a" href={`/api/${path}/reqif?format=reqifz`} download>
          ReqIF with images (.reqifz)
        </Menu.Item>
        <Menu.Item component="a" href={`/api/${path}/reqif`} download>
          ReqIF, text only (.reqif)
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
export const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_NODES = 5000;
// Stands in for an image while the mapping is previewed; nothing is uploaded until the import runs.
export const PLACEHOLDER = "/api/attachments/00000000-0000-4000-8000-000000000000";

type StructureAnswer = AppliedStructure & { added: string[]; notes: string[] };

/** A chosen file: its content, the files beside it in a .reqifz archive, and the folder the .reqif file sat in. */
type Loaded = { reqif: Reqif; files: Map<string, Uint8Array>; folder: string; notes: string[] };

async function readFile(file: File): Promise<Loaded> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A zip archive starts with "PK", whatever the file is called.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { reqif: parseReqif(new TextDecoder().decode(bytes)), files: new Map(), folder: "", notes: [] };
  }
  const files = await unzip(bytes);
  const inside = [...files.keys()].filter((name) => /\.(reqif|xml)$/i.test(name)).sort();
  const name = inside.find((n) => /\.reqif$/i.test(n)) ?? inside[0];
  if (!name) throw new Error("The archive holds no .reqif file.");
  const notes =
    inside.length > 1 ? [`The archive holds ${inside.length} ReqIF files. Only ${name} is read.`] : ([] as string[]);
  const reqif = parseReqif(new TextDecoder().decode(files.get(name)));
  return { reqif, files, folder: name.slice(0, name.lastIndexOf("/") + 1), notes };
}

/** The archive path of an embedded file that can be stored as an image, or null. */
function locate({ files, folder }: Loaded, data: string): string | null {
  let path = data.replace(/\\/g, "/").replace(/^\.\//, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    // Not percent-encoded: use it as written.
  }
  const found = [folder + path, path].find((candidate) => files.has(candidate));
  const type = IMAGE_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
  return found && type && (files.get(found)?.length ?? 0) <= MAX_IMAGE ? found : null;
}

/** ReqIF import: choose a file, say where each specification, attribute and relation type goes, review, then create. */
export function ReqifImportPage() {
  const project = useProject().data;
  const projectId = project?.project.id ?? "";
  const isAdmin = project?.role === "admin";
  const queryClient = useQueryClient();
  // The same queries List view uses.
  const lists = useQueries({
    queries: (project?.sets ?? []).map((set) => ({
      queryKey: ["projects", projectId, "sets", set.id],
      queryFn: () => api<SetItems>(`sets/${set.id}/items`),
    })),
  });
  const linkTypes = useLinks(projectId).data?.linkTypes.filter((t) => !t.archivedAt);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<ReqifMapping>({ specifications: {}, relations: {} });
  const [problem, setProblem] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  // "Create what the file needs" (sets, fields, relationship types) is on until the user turns it off.
  const [create, setCreate] = useState(true);

  const ready = lists.every((list) => list.data) && linkTypes !== undefined;
  const fetched = lists.map((list) => list.dataUpdatedAt).join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `lists` is a new array on every render; `fetched` says when its data changed
  const targets: ReqifTargetSet[] = useMemo(
    () =>
      (project?.sets ?? []).map((set, index) => ({
        id: set.id,
        name: set.name,
        // The steps of a test case cannot be filled from one ReqIF attribute.
        fields: (lists[index]?.data?.fields ?? []).filter((f) => f.type !== "steps"),
      })),
    [project?.sets, fetched],
  );
  const summary = useMemo(() => (loaded ? summarizeReqif(loaded.reqif) : null), [loaded]);
  const derived = useMemo(
    () =>
      summary
        ? deriveReqifStructure(summary, {
            setNames: (project?.sets ?? []).map((s) => s.name),
            prefixes: (project?.sets ?? []).map((s) => s.uidPrefix),
          })
        : null,
    [summary, project?.sets],
  );
  const asked = create && isAdmin && derived !== null && summary !== null && summary.specifications.length > 0;
  // What the server would add: it reads the project as it is now, so existing names are used, never replaced.
  const structure = useQuery({
    queryKey: ["structure-preview", projectId, derived?.proposal],
    queryFn: () => api<StructureAnswer>(`projects/${projectId}/structure`, { ...derived?.proposal, dryRun: true }),
    enabled: asked,
    gcTime: 0,
  });
  const created = useMemo(
    () =>
      asked && summary && derived && structure.data ? reqifMappingFor(summary, derived.fieldOf, structure.data) : null,
    [asked, summary, derived, structure.data],
  );
  const effective = created ?? { mapping, targets };
  const preview = useMemo(
    () =>
      loaded
        ? mapReqif(loaded.reqif, effective.mapping, effective.targets, (data) =>
            locate(loaded, data) ? PLACEHOLDER : null,
          )
        : null,
    [loaded, effective.mapping, effective.targets],
  );

  const load = async (file: File | null) => {
    setProblem(null);
    setLoaded(null);
    run.reset();
    if (!file) return;
    try {
      const next = await readFile(file);
      setMapping(guessReqifMapping(summarizeReqif(next.reqif), targets, linkTypes ?? []));
      setLoaded(next);
    } catch (error) {
      setProblem(`Could not read the file: ${(error as Error).message}`);
    }
  };
  const run = useMutation({
    mutationFn: async () => {
      if (!loaded || !summary) throw new Error("No file");
      let use = { mapping, targets };
      if (asked && derived) {
        // Structure first: adds only. If the import below fails, what was added stays and is found again next time.
        const applied = await api<StructureAnswer>(`projects/${projectId}/structure`, derived.proposal);
        use = reqifMappingFor(summary, derived.fieldOf, applied);
      }
      // First pass finds the images that the chosen mapping uses, so nothing else is uploaded.
      const used = new Set<string>();
      mapReqif(loaded.reqif, use.mapping, use.targets, (data) => {
        const path = locate(loaded, data);
        if (path) used.add(path);
        return path && PLACEHOLDER;
      });
      const stored = new Map<string, string>();
      for (const path of used) {
        const type = IMAGE_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] as string;
        const image = new File([loaded.files.get(path) as BlobPart], path, { type });
        // A file that is not the image its name says is refused by the server; it is then left out and reported.
        await uploadImage(projectId, image).then(
          (src) => stored.set(path, src),
          () => undefined,
        );
      }
      const final = mapReqif(
        loaded.reqif,
        use.mapping,
        use.targets,
        (data) => stored.get(locate(loaded, data) ?? "") ?? null,
      );
      const result = await api<ImportResult>(`projects/${projectId}/import`, final.body);
      return { ...result.created, changed: result.changed, unchanged: result.unchanged, warnings: final.warnings };
    },
    onSuccess: () => {
      setLoaded(null);
      setRound((n) => n + 1);
      return queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });

  if (!project) return null;
  if (!canEdit(project.role)) return <Alert color="red">Importing needs the editor role.</Alert>;
  const tooMany = preview !== null && preview.items + preview.folders > MAX_NODES;
  const nothing = preview !== null && preview.items + preview.folders === 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const fieldsOf = (setId: string) => targets.find((t) => t.id === setId)?.fields ?? [];

  return (
    <Stack gap="md" maw={900}>
      <div>
        <Title order={1} size="h2">
          Import ReqIF
        </Title>
        <Text c="dimmed" size="sm">
          Reads a .reqif or .reqifz file from DOORS, Polarion or another tool. Nothing is created until you press
          Import. Items this project imported or exported before are found again: a changed one gets a new version.
        </Text>
      </div>
      <FileInput
        label="ReqIF file"
        placeholder={ready ? "Choose a file" : "Loading the project…"}
        accept=".reqif,.reqifz,.xml,.zip"
        disabled={!ready}
        // Remounted after an import, so the same file can be chosen again.
        key={round}
        onChange={load}
      />
      {problem && (
        <Alert color="red" role="alert">
          {problem}
        </Alert>
      )}
      {run.isSuccess && (
        <Alert color="green" title="Imported" role="status">
          Created {plural(run.data.items, "item")}, {plural(run.data.folders, "folder")} and{" "}
          {plural(run.data.links, "relationship")}. Changed {plural(run.data.changed, "item")}; {run.data.unchanged}{" "}
          already as in the file.
          {run.data.warnings.map((warning) => (
            <Text key={warning} size="sm">
              {warning}
            </Text>
          ))}
        </Alert>
      )}

      {loaded && summary?.specifications.length === 0 && (
        <Alert color="orange">The file holds no specifications.</Alert>
      )}
      {loaded?.notes.map((note) => (
        <Alert key={note} color="orange">
          {note}
        </Alert>
      ))}
      {loaded && summary && summary.specifications.length > 0 && (
        <Paper withBorder p="sm">
          <Checkbox
            label="Create the sets, fields and relationship types this file needs"
            description={
              isAdmin
                ? "Adds what is missing and uses what has the same name. Nothing here is renamed or removed."
                : "Needs the admin role. Without it, choose below where each specification goes."
            }
            checked={create && isAdmin}
            disabled={!isAdmin}
            onChange={(e) => setCreate(e.currentTarget.checked)}
          />
          {asked && structure.isError && (
            <Alert color="red" role="alert" mt="sm">
              {structure.error.message}
            </Alert>
          )}
          {asked && structure.data && (
            <Stack gap="xs" mt="sm" role="status" aria-label="What will be added">
              {structure.data.added.length === 0 ? (
                <Text size="sm">Everything the file needs is here already.</Text>
              ) : (
                <>
                  <Text size="sm" fw={600}>
                    Will add {plural(structure.data.added.length, "thing")}:
                  </Text>
                  <List size="sm" spacing={2}>
                    {structure.data.added.slice(0, 40).map((line) => (
                      <List.Item key={line}>{line}</List.Item>
                    ))}
                  </List>
                  {structure.data.added.length > 40 && (
                    <Text size="sm">…and {structure.data.added.length - 40} more.</Text>
                  )}
                </>
              )}
              {structure.data.notes.map((note) => (
                <Text key={note} size="sm" c="orange">
                  {note}
                </Text>
              ))}
              {structure.data.sets.map((set) => (
                <Text key={set.name} size="sm" c="dimmed">
                  {set.name}: {plural(set.fields.length, "field")} from the file's attributes
                </Text>
              ))}
            </Stack>
          )}
        </Paper>
      )}
      {!asked &&
        summary?.specifications.map((spec) => {
          const choice = mapping.specifications[spec.id] ?? { setId: "", targets: {} };
          const change = (next: typeof choice) =>
            setMapping((m) => ({ ...m, specifications: { ...m.specifications, [spec.id]: next } }));
          return (
            <Paper key={spec.id} withBorder p="sm">
              <Group justify="space-between" align="flex-end" mb="xs">
                <div>
                  <Text fw={600}>{spec.name}</Text>
                  <Text c="dimmed" size="sm">
                    Specification with {plural(spec.objects, "object")}
                  </Text>
                </div>
                <NativeSelect
                  label="Import into"
                  data={[
                    { value: "", label: "Skip this specification" },
                    ...targets.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  value={choice.setId}
                  onChange={(e) => {
                    const setId = e.currentTarget.value;
                    change({ setId, targets: guessReqifTargets(spec.attributes, fieldsOf(setId)) });
                  }}
                />
              </Group>
              {choice.setId && (
                <Table.ScrollContainer minWidth={400}>
                  <Table withTableBorder aria-label={`Attributes of ${spec.name}`}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Attribute in the file</Table.Th>
                        <Table.Th>First value</Table.Th>
                        <Table.Th>Import as</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {spec.attributes.map((attribute) => (
                        <Table.Tr key={attribute.id}>
                          <Table.Td>
                            {attribute.name}{" "}
                            <Text span c="dimmed" size="xs">
                              {attribute.kind}
                            </Text>
                          </Table.Td>
                          <Table.Td c="dimmed" maw={260} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {attribute.sample}
                          </Table.Td>
                          <Table.Td>
                            <NativeSelect
                              size="xs"
                              aria-label={`Import ${attribute.name} as`}
                              data={[
                                { value: "", label: "Skip" },
                                { value: "name", label: "Name" },
                                { value: "description", label: "Description" },
                                ...fieldsOf(choice.setId).map((f) => ({ value: f.id, label: f.name })),
                              ]}
                              value={choice.targets[attribute.id] ?? ""}
                              onChange={(e) =>
                                change({
                                  ...choice,
                                  targets: { ...choice.targets, [attribute.id]: e.currentTarget.value },
                                })
                              }
                            />
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Paper>
          );
        })}

      {!asked && summary && summary.relationTypes.length > 0 && (
        <Paper withBorder p="sm">
          <Text fw={600} mb="xs">
            Relationships
          </Text>
          <Table withTableBorder aria-label="Relation types">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Relation type in the file</Table.Th>
                <Table.Th>Count</Table.Th>
                <Table.Th>Import as</Table.Th>
                <Table.Th>The source item is</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summary.relationTypes.map((type) => {
                const choice = mapping.relations[type.id] ?? { typeId: "", reverse: false };
                const change = (next: typeof choice) =>
                  setMapping((m) => ({ ...m, relations: { ...m.relations, [type.id]: next } }));
                return (
                  <Table.Tr key={type.id}>
                    <Table.Td>{type.name}</Table.Td>
                    <Table.Td>{type.count}</Table.Td>
                    <Table.Td>
                      <NativeSelect
                        size="xs"
                        aria-label={`Import ${type.name} as`}
                        data={[
                          { value: "", label: "Skip" },
                          ...(linkTypes ?? []).map((t) => ({ value: t.id, label: t.name })),
                        ]}
                        value={choice.typeId}
                        onChange={(e) => change({ ...choice, typeId: e.currentTarget.value })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <NativeSelect
                        size="xs"
                        aria-label={`Direction of ${type.name}`}
                        data={[
                          { value: "", label: "Downstream (it derives from the target)" },
                          { value: "reverse", label: "Upstream (the target derives from it)" },
                        ]}
                        value={choice.reverse ? "reverse" : ""}
                        onChange={(e) => change({ ...choice, reverse: e.currentTarget.value === "reverse" })}
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {preview && (
        <Alert color={tooMany ? "red" : preview.warnings.length > 0 ? "orange" : "blue"} title="Review" role="status">
          {nothing ? (
            <Text size="sm">Choose a set for at least one specification.</Text>
          ) : (
            <Text size="sm">
              The file maps to {plural(preview.items, "item")}, {plural(preview.folders, "folder")} and{" "}
              {plural(preview.body.links.length, "relationship")}. Those already here are updated, not added again.
            </Text>
          )}
          {tooMany && (
            <Text size="sm">One import can hold at most {MAX_NODES} folders and items. Skip a specification.</Text>
          )}
          {preview.warnings.map((warning) => (
            <Text key={warning} size="sm">
              {warning}
            </Text>
          ))}
        </Alert>
      )}
      {run.isError && (
        <Alert color="red" role="alert">
          {run.error.message}
        </Alert>
      )}
      {loaded && (
        <Group justify="flex-end">
          <Button disabled={nothing || tooMany} loading={run.isPending} onClick={() => run.mutate()}>
            Import
          </Button>
        </Group>
      )}
    </Stack>
  );
}
