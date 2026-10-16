import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { roleIn } from "./access.ts";
import type { AppContext } from "./app.ts";
import { attributeDefinitions, itemTypes, linkTypes, projectMembers, projects, sets } from "./db/schema.ts";
import { templates } from "./domain/templates.ts";
import { projectNodes } from "./nodes.ts";
import { arr, bool, id, obj, ref, res, str } from "./schemas.ts";

const projectParams = {
  type: "object",
  required: ["projectId"],
  properties: { projectId: { type: "string", format: "uuid" } },
} as const;

export function projectRoutes({ app, db, requireUser, requireAdmin, audit }: AppContext) {
  app.get(
    "/api/templates",
    {
      onRequest: requireUser,
      schema: {
        response: res(obj({ templates: arr(obj({ id: str, name: str, description: str, sets: arr(str) })) })),
      },
    },
    async () => ({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        sets: t.sets.map((s) => s.name),
      })),
    }),
  );

  // Instance administrators see every project; everyone else sees the projects they are a member of.
  app.get(
    "/api/projects",
    { onRequest: requireUser, schema: { response: res(obj({ projects: arr(ref("Project")) })) } },
    async (req) => {
      const user = req.user as { id: string; isAdmin: boolean };
      const mine = db
        .select({ id: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, user.id));
      const rows = await db
        .select()
        .from(projects)
        .where(and(isNull(projects.archivedAt), user.isAdmin ? undefined : inArray(projects.id, mine)))
        .orderBy(projects.name);
      return { projects: rows };
    },
  );

  app.post(
    "/api/projects",
    {
      onRequest: [requireUser, requireAdmin],
      schema: {
        response: res(obj({ project: ref("Project") }), 201),
        body: {
          type: "object",
          required: ["name", "templateId"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" },
            templateId: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as { name: string; templateId: string };
      const template = templates.find((t) => t.id === body.templateId);
      if (!template) return reply.code(400).send({ error: "Unknown template" });

      const project = await db.transaction(async (tx) => {
        const [created] = await tx.insert(projects).values({ name: body.name.trim() }).returning();
        if (!created) throw new Error("project insert returned no row");

        const typeIds = new Map<string, string>();
        for (const type of template.itemTypes) {
          const [row] = await tx
            .insert(itemTypes)
            .values({ projectId: created.id, name: type.name, role: type.role ?? null })
            .returning();
          if (!row) throw new Error("item type insert returned no row");
          typeIds.set(type.name, row.id);
          await tx
            .insert(attributeDefinitions)
            .values(type.fields.map((field, position) => ({ itemTypeId: row.id, position, ...field })));
        }
        await tx.insert(sets).values(
          template.sets.map((set, position) => ({
            projectId: created.id,
            // templates.test.ts guarantees every set names an existing type.
            itemTypeId: typeIds.get(set.itemType) as string,
            name: set.name,
            uidPrefix: set.uidPrefix,
            position,
          })),
        );
        await tx
          .insert(linkTypes)
          .values(template.linkTypes.map((type, position) => ({ projectId: created.id, ...type, position })));
        // The creator manages the new project.
        await tx
          .insert(projectMembers)
          .values({ projectId: created.id, userId: req.user?.id as string, role: "admin" });
        await audit(tx, req.user?.id ?? null, "project.create", "project", created.id);
        return created;
      });
      return reply.code(201).send({ project });
    },
  );

  app.get(
    "/api/projects/:projectId",
    {
      onRequest: requireUser,
      schema: {
        params: projectParams,
        response: res(
          obj({
            project: ref("Project"),
            role: { type: "string", enum: ["viewer", "reviewer", "editor", "admin"] },
            sets: arr(obj({ id, name: str, uidPrefix: str, itemType: str, isTest: bool })),
            nodes: arr(ref("Node")),
          }),
        ),
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)));
      const role = project && req.user ? await roleIn(db, req.user, projectId) : null;
      // Not a member reads the same as not existing.
      if (!project || !role) return reply.code(404).send({ error: "Project not found" });
      const projectSets = await db
        .select({
          id: sets.id,
          name: sets.name,
          uidPrefix: sets.uidPrefix,
          itemType: itemTypes.name,
          // Whether the set holds test cases.
          isTest: sql<boolean>`${itemTypes.role} is not distinct from 'test'`,
        })
        .from(sets)
        .innerJoin(itemTypes, eq(itemTypes.id, sets.itemTypeId))
        .where(and(eq(sets.projectId, projectId), isNull(sets.archivedAt)))
        .orderBy(sets.position);
      // `role` tells the web app what to offer; the server checks every action again.
      return { project, role, sets: projectSets, nodes: await projectNodes(db, projectId) };
    },
  );
}
