/** One API route as Fastify registered it. */
export type ApiRoute = { method: string; url: string; public: boolean; schema?: Record<string, unknown> };

type Schema = { properties?: Record<string, unknown>; required?: string[] };

/**
 * The OpenAPI 3.1 document of the API, built from the JSON schemas the routes already validate with. Fastify's
 * `:name` path parameters become `{name}`. Routes are sorted, so the committed docs/openapi.json only changes with the API.
 */
export function openApiDocument(routes: ApiRoute[], version: string, schemas: Record<string, unknown> = {}) {
  const paths: Record<string, Record<string, unknown>> = {};
  const sorted = routes
    .filter((r) => r.method !== "HEAD")
    .sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));
  for (const route of sorted) {
    const path = route.url.replace(/:(\w+)/g, "{$1}");
    const schema = route.schema ?? {};
    const parameters = (["params", "querystring"] as const).flatMap((part) => {
      const { properties = {}, required = [] } = (schema[part] ?? {}) as Schema;
      return Object.entries(properties).map(([name, value]) => ({
        name,
        in: part === "params" ? "path" : "query",
        required: part === "params" || required.includes(name),
        schema: value,
      }));
    });
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = {
      tags: [route.url.split("/")[2]],
      ...(parameters.length ? { parameters } : {}),
      ...(schema.body
        ? { requestBody: { required: true, content: { "application/json": { schema: schema.body } } } }
        : {}),
      responses: {
        ...Object.fromEntries(
          Object.entries((schema.response ?? {}) as Record<string, unknown>).map(([code, body]) => [
            code,
            { description: "JSON.", content: { "application/json": { schema: body } } },
          ]),
        ),
        default: {
          description: 'An error answers { "error": "…" } with a 4xx status.',
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
      ...(route.public ? { security: [] } : {}),
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Open Requirements API",
      version,
      description:
        "Every screen of the web app uses this API. Scripts sign in with a personal access token, sent as `Authorization: Bearer …`.",
    },
    components: {
      schemas,
      securitySchemes: {
        token: { type: "http", scheme: "bearer" },
        session: { type: "apiKey", in: "cookie", name: "session" },
      },
    },
    security: [{ token: [] }, { session: [] }],
    paths,
  };
}
