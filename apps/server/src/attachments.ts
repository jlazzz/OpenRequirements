import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { attachments, projects } from "./db/schema.ts";
import { fileType, safeFileName } from "./domain/filetype.ts";

const IMAGES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const uuidParam = (name: string) =>
  ({ type: "object", required: [name], properties: { [name]: { type: "string", format: "uuid" } } }) as const;

/**
 * File upload and download: images for rich text, and evidence files for test results (images, PDF, text and logs, CSV, zip).
 * Files live in `dir`, named by attachment id, so a stored name is never user input.
 */
export function attachmentRoutes({ app, db, requireUser, audit, access }: AppContext, dir: string, maxBytes: number) {
  // Uploads arrive as the raw file. What the file really is gets decided from its bytes, below.
  app.addContentTypeParser(
    [...IMAGES, "application/pdf", "application/zip", "text/plain", "text/csv", "application/octet-stream"],
    { parseAs: "buffer", bodyLimit: maxBytes },
    (_req, body, done) => done(null, body),
  );

  // A Reviewer may upload, because a tester with that role attaches evidence to the runs assigned to them (ADR 0013).
  app.post(
    "/api/projects/:projectId/attachments",
    {
      onRequest: requireUser,
      bodyLimit: maxBytes,
      schema: {
        params: uuidParam("projectId"),
        // The file's own name, kept so a download gets it back.
        querystring: { type: "object", properties: { name: { type: "string", maxLength: 500 } } },
      },
    },
    async (req, reply) => {
      const { projectId } = req.params as { projectId: string };
      if (!(await access(req, reply, { projectId }, "reviewer"))) return reply;
      const userId = req.user?.id as string;
      const body = req.body;
      const name = safeFileName((req.query as { name?: string }).name ?? "") || null;
      const contentType = Buffer.isBuffer(body) ? fileType(body, name ?? "") : null;
      // An upload that says it is an image goes into rich text, so it must really be one.
      const asImage = IMAGES.includes(String(req.headers["content-type"]).split(";")[0] ?? "");
      if (!Buffer.isBuffer(body) || !contentType || (asImage && !IMAGES.includes(contentType))) {
        return reply.code(400).send({
          error: asImage
            ? "Only PNG, JPEG, GIF and WebP images can be uploaded"
            : "Only images, PDF, text, log, CSV and zip files can be uploaded",
        });
      }
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)));
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(attachments)
          .values({ projectId, contentType, name, size: body.length, createdBy: userId })
          .returning({ id: attachments.id });
        if (!row) throw new Error("attachment insert returned no row");
        await audit(tx, userId, "attachment.create", "attachment", row.id);
        // Written inside the transaction: if the file cannot be saved, the row is rolled back.
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, row.id), body);
        return row.id;
      });
      return reply.code(201).send({ id, src: `/api/attachments/${id}`, name, contentType });
    },
  );

  app.get(
    "/api/attachments/:attachmentId",
    { onRequest: requireUser, schema: { params: uuidParam("attachmentId") } },
    async (req, reply) => {
      const { attachmentId } = req.params as { attachmentId: string };
      if (!(await access(req, reply, { attachmentId }, "viewer"))) return reply;
      const [row] = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
      if (!row) return reply.code(404).send({ error: "Not found" });
      // Only an image is ever shown by the browser. Everything else is handed over as a file to save.
      if (!IMAGES.includes(row.contentType)) {
        reply.header("content-disposition", `attachment; filename="${row.name ?? `evidence-${row.id.slice(0, 8)}`}"`);
      }
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
