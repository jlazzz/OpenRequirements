import { buildApp } from "./app.ts";
import { createDb, runMigrations } from "./db/client.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url);
await runMigrations(db);

const app = await buildApp(db, {
  logger: true,
  webRoot: process.env.WEB_ROOT ?? new URL("../../web/dist", import.meta.url).pathname,
});
await app.listen({ host: process.env.HOST ?? "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
