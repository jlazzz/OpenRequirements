import pg from "pg";
import { createDb, runMigrations } from "../src/db/client.ts";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:5432/app_test";

/** Creates the test database if it is missing and migrates it. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/^\w+_test$/.test(name))
    throw new Error(`refusing to run tests against database "${name}": name must end in _test`);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.href });
  try {
    await admin.connect();
  } catch (cause) {
    throw new Error("Postgres is not reachable. Start it with: npm run db:up", { cause });
  }
  const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (exists.rowCount === 0) await admin.query(`create database ${name}`);
  await admin.end();

  const db = createDb(TEST_DATABASE_URL);
  await runMigrations(db);
  await db.$client.end();
}
