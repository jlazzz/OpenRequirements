import { and, eq, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { attributeDefinitions, itemTypes, linkTypes, projects, sets } from "./db/schema.ts";
import { templates } from "./domain/templates.ts";
import { projectNodes } from "./nodes.ts";

const projectParams = {
  type: "object",
  required: ["projectId"],
  properties: { projectId: { type: "string", format: "uuid" } },
} as const;

export function projectRoutes({ app, db, requireUser, requireAdmin, audit }: AppContext) {
  app.get("/api/templates", { onRequest: requireUser }, async () => ({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      sets: t.sets.map((s) => s.name),
    })),
  }));

  app.get("/api/projects", { onRequest: requireUser }, async () => {
    const rows = await db.select().from(projects).where(isNull(projects.archivedAt)).orderBy(projects.name);
    return { projects: rows };
  });

  app.post(
    "/api/projects",
    {
      onRequest: [requireUser, requireAdmin],
      schema: {
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
          const [row] = await tx.insert(itemTypes).values({ projectId: created.id, name: type.name }).returning();
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
          .values(template.linkTypes.map((name, position) => ({ projectId: created.id, name, position })));
        await audit(tx, req.user?.id ?? null, "project.create", "project", created.id);
        return created;
      });
      return reply.code(201).send({ project });
    },
  );

  app.get(
    "/api/projects/:projectId",
    { onRequest: requireUser, schema: { params: projectParams } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)));
      if (!project) return reply.code(404).send({ error: "Project not found" });
      const projectSets = await db
        .select({ id: sets.id, name: sets.name, uidPrefix: sets.uidPrefix, itemType: itemTypes.name })
        .from(sets)
        .innerJoin(itemTypes, eq(itemTypes.id, sets.itemTypeId))
        .where(eq(sets.projectId, projectId))
        .orderBy(sets.position);
      return { project, sets: projectSets, nodes: await projectNodes(db, projectId) };
    },
  );
}
