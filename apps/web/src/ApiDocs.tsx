import { Accordion, Alert, Anchor, Badge, Code, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "./api.ts";

type Operation = {
  tags: string[];
  parameters?: { name: string; in: string; required: boolean; schema: object }[];
  requestBody?: { content: { "application/json": { schema: object } } };
  security?: unknown[];
};
type Document = { info: { description: string }; paths: Record<string, Record<string, Operation>> };
const COLOR: Record<string, string> = { get: "blue", post: "green", put: "orange", patch: "yellow", delete: "red" };

/** The API reference, read from /api/openapi.json: every route with its parameters and request body. */
export function ApiDocsPage() {
  const doc = useQuery({ queryKey: ["openapi"], queryFn: () => api<Document>("openapi.json"), staleTime: Infinity });
  const [filter, setFilter] = useState("");
  if (doc.isError) return <Alert color="red">{doc.error.message}</Alert>;
  if (!doc.data) return null;
  const operations = Object.entries(doc.data.paths)
    .flatMap(([path, methods]) => Object.entries(methods).map(([method, op]) => ({ path, method, op })))
    .filter(({ path }) => path.includes(filter.trim()));

  return (
    <Stack gap="md" p="lg" maw={1000}>
      <Title order={1} size="h2">
        API
      </Title>
      <Text size="sm">
        {doc.data.info.description} The machine-readable description is at{" "}
        <Anchor href="/api/openapi.json" inherit>
          /api/openapi.json
        </Anchor>{" "}
        (OpenAPI 3.1), for code generators and tools such as Postman. Requests and answers are JSON; an error answers{" "}
        <Code>{'{ "error": "…" }'}</Code>.
      </Text>
      <TextInput
        placeholder="Filter by path, e.g. items"
        aria-label="Filter by path"
        value={filter}
        onChange={(e) => setFilter(e.currentTarget.value)}
        maw={320}
      />
      <Accordion variant="contained" chevronPosition="left">
        {operations.map(({ path, method, op }) => (
          <Accordion.Item key={`${method} ${path}`} value={`${method} ${path}`}>
            <Accordion.Control>
              <Group gap="sm" wrap="nowrap">
                <Badge w={80} color={COLOR[method] ?? "gray"} variant="light">
                  {method}
                </Badge>
                <Code bg="transparent">{path}</Code>
                {op.security?.length === 0 && (
                  <Text size="xs" c="dimmed">
                    no sign-in
                  </Text>
                )}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              {op.parameters?.length ? (
                <Stack gap={2} mb="sm">
                  {op.parameters.map((p) => (
                    <Text key={`${p.in} ${p.name}`} size="sm">
                      <Code>{p.name}</Code> in {p.in}
                      {p.required ? ", required" : ""}: <Code>{JSON.stringify(p.schema)}</Code>
                    </Text>
                  ))}
                </Stack>
              ) : null}
              {op.requestBody ? (
                <Code block>{JSON.stringify(op.requestBody.content["application/json"].schema, null, 2)}</Code>
              ) : (
                !op.parameters?.length && (
                  <Text size="sm" c="dimmed">
                    No parameters.
                  </Text>
                )
              )}
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}
