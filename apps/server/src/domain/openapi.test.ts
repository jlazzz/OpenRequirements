import { expect, test } from "vitest";
import { openApiDocument } from "./openapi.ts";

test("routes become OpenAPI paths with their parameters and body", () => {
  const doc = openApiDocument(
    [
      { method: "HEAD", url: "/api/items/:itemId", public: false },
      {
        method: "POST",
        url: "/api/items/:itemId/comments",
        public: false,
        schema: {
          params: { type: "object", properties: { itemId: { type: "string", format: "uuid" } } },
          querystring: {
            type: "object",
            required: ["a"],
            properties: { a: { type: "string" }, b: { type: "number" } },
          },
          body: { type: "object", properties: { body: { type: "string" } } },
        },
      },
      { method: "GET", url: "/api/session", public: true },
    ],
    "1",
  );
  expect(Object.keys(doc.paths)).toEqual(["/api/items/{itemId}/comments", "/api/session"]);
  expect(doc.paths["/api/items/{itemId}/comments"]?.post).toMatchObject({
    tags: ["items"],
    parameters: [
      { name: "itemId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
      { name: "a", in: "query", required: true },
      { name: "b", in: "query", required: false },
    ],
    requestBody: { content: { "application/json": { schema: { type: "object" } } } },
  });
  expect(doc.paths["/api/session"]?.get).toMatchObject({ security: [] });
});
