import { boolean, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  // Stored lower-case so the unique constraint is case-insensitive.
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text().notNull(),
  isAdmin: boolean().notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  // SHA-256 of the cookie token, so a database leak does not leak usable sessions.
  tokenHash: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const projects = pgTable("projects", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: createdAt(),
  archivedAt: timestamp({ withTimezone: true }),
});

/** A kind of item with its own fields. Created from the project template; stored per project so it can become editable later. */
export const itemTypes = pgTable("item_types", {
  id: uuid().primaryKey().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => projects.id),
  name: text().notNull(),
});

export const attributeDefinitions = pgTable("attribute_definitions", {
  id: uuid().primaryKey().defaultRandom(),
  itemTypeId: uuid()
    .notNull()
    .references(() => itemTypes.id),
  name: text().notNull(),
  // One of FieldType in domain/templates.ts.
  type: text().notNull(),
  // Allowed values, for enum and multi_enum only.
  options: jsonb().$type<string[]>(),
  position: integer().notNull(),
});

/** A container holding items of exactly one item type. */
export const sets = pgTable(
  "sets",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id),
    itemTypeId: uuid()
      .notNull()
      .references(() => itemTypes.id),
    name: text().notNull(),
    uidPrefix: text().notNull(),
    // Last UID number handed out. Only ever increases, so UIDs are never reused.
    uidCounter: integer().notNull().default(0),
    position: integer().notNull(),
  },
  (t) => [unique().on(t.projectId, t.uidPrefix)],
);

/** Append-only log of every write. Never update or delete rows. */
export const auditEvents = pgTable("audit_events", {
  id: uuid().primaryKey().defaultRandom(),
  at: createdAt(),
  actorUserId: uuid().references(() => users.id),
  action: text().notNull(),
  entityType: text().notNull(),
  entityId: text().notNull(),
  data: jsonb(),
});
