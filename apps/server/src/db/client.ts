import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema.ts";

export function createDb(url: string) {
  return drizzle({ connection: url, schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;

export function runMigrations(db: Db) {
  return migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
}
