/**
 * Response schemas for the OpenAPI document. They only describe: buildApp swaps Fastify's serializer for plain
 * JSON.stringify, so a field a schema leaves out is still sent. Shared shapes are components, used as `ref("Name")`.
 */
type S = Record<string, unknown>;

export const str: S = { type: "string" };
export const bool: S = { type: "boolean" };
export const int: S = { type: "integer" };
export const num: S = { type: "number" };
export const id: S = { type: "string", format: "uuid" };
export const date: S = { type: "string", format: "date-time" };
export const any: S = {};
export const ref = (name: string): S => ({ $ref: `#/components/schemas/${name}` });
export const arr = (items: S): S => ({ type: "array", items });
/** Also null. */
export const nul = (s: S): S => ({ anyOf: [s, { type: "null" }] });
/** An object whose listed properties are always present; more may come. */
export const obj = (properties: Record<string, S>, required: string[] = Object.keys(properties)): S => ({
  type: "object",
  properties,
  required,
  additionalProperties: true,
});
export const ok = obj({ ok: bool });
/** The `response` part of a route schema: the 200 body. */
export const res = (body: S, code = 200) => ({ [code]: body });

export const components: Record<string, S> = {
  Error: obj({ error: str }),
  User: obj({ id, email: str, name: str, isAdmin: bool }),
  Project: obj({ id, name: str, createdAt: date, archivedAt: nul(date) }, ["id", "name"]),
  Node: obj({
    id,
    setId: id,
    parentId: nul(id),
    kind: { type: "string", enum: ["folder", "item"] },
    name: str,
    uid: nul(str),
    status: nul(str),
  }),
  Field: obj({ id, name: str, type: str, options: any }),
  /** A live relationship, with the version of each end it was confirmed against and the current one. */
  Link: obj({
    id,
    typeId: id,
    upstreamId: id,
    downstreamId: id,
    confirmed: obj({ upstream: nul(int), downstream: nul(int) }),
    current: obj({ upstream: nul(int), downstream: nul(int) }),
    changed: arr(str),
  }),
  Item: obj({
    id,
    setId: id,
    uid: str,
    name: str,
    description: any,
    attributes: { type: "object", additionalProperties: true },
    revision: int,
    revisedAt: date,
  }),
};

/** An object this document does not spell out. */
export const thing: S = { type: "object", additionalProperties: true };
export const rows: S = arr(thing);
