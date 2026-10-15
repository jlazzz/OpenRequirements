// Starts the API for the end-to-end tests on a freshly created database, so every run begins empty.
import pg from "pg";

const url = new URL(process.env.E2E_DATABASE_URL ?? "postgres://app:app@localhost:5432/app_e2e_test");
const name = url.pathname.slice(1);
if (!/^\w+_test$/.test(name)) throw new Error(`refusing to reset database "${name}": name must end in _test`);
url.pathname = "/postgres";
const admin = new pg.Client({ connectionString: url.href });
await admin.connect();
await admin.query(`drop database if exists ${name} with (force)`);
await admin.query(`create database ${name}`);
await admin.end();

process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://app:app@localhost:5432/app_e2e_test";
process.env.PORT = process.env.E2E_API_PORT ?? "3100";
process.env.HOST = "127.0.0.1";
process.env.ATTACHMENTS_DIR ??= `${process.env.TMPDIR ?? "/tmp"}/e2e-attachments`;
await import("../apps/server/src/main.ts");
