import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { attachments, projects } from "./db/schema.ts";
import { imageType } from "./domain/image.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const uuidParam = (name: string) =>
  ({ type: "object", required: [name], properties: { [name]: { type: "string", format: "uuid" } } }) as const;

/** Image upload and download. Files live in `dir`, named by attachment id, so a stored name is never user input. */
export function attachmentRoutes({ app, db, requireUser, audit }: AppContext, dir: string) {
  // Uploads arrive as the raw file. What the file really is gets decided from its bytes, below.
  app.addContentTypeParser(
    ["image/png", "image/jpeg", "image/gif", "image/webp"],
    { parseAs: "buffer", bodyLimit: MAX_BYTES },
    (_req, body, done) => done(null, body),
  );

  app.post(
    "/api/projects/:projectId/attachments",
    { onRequest: requireUser, schema: { params: uuidParam("projectId") } },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      const userId = req.user?.id as string;
      const body = req.body;
      const contentType = Buffer.isBuffer(body) ? imageType(body) : null;
      if (!Buffer.isBuffer(body) || !contentType) {
        return reply.code(400).send({ error: "Only PNG, JPEG, GIF and WebP images can be uploaded" });
      }
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)));
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(attachments)
          .values({ projectId, contentType, size: body.length, createdBy: userId })
          .returning({ id: attachments.id });
        if (!row) throw new Error("attachment insert returned no row");
        await audit(tx, userId, "attachment.create", "attachment", row.id);
        // Written inside the transaction: if the file cannot be saved, the row is rolled back.
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, row.id), body);
        return row.id;
      });
      return reply.code(201).send({ id, src: `/api/attachments/${id}` });
    },
  );

  app.get(
    "/api/attachments/:attachmentId",
    { onRequest: requireUser, schema: { params: uuidParam("attachmentId") } },
    async (req, reply) => {
      const { attachmentId } = req.params as { attachmentId: string };
      const [row] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
      if (!row) return reply.code(404).send({ error: "Not found" });
      return (
        reply
          .type(row.contentType)
          // nosniff and the sandbox stop a browser from ever treating an upload as a page or script.
          .header("x-content-type-options", "nosniff")
          .header("content-security-policy", "default-src 'none'; sandbox")
          .header("cache-control", "private, max-age=31536000, immutable")
          .send(createReadStream(join(dir, row.id)))
      );
    },
  );
}
