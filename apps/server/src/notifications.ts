import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AppContext } from "./app.ts";
import { notifications, projectMembers, projects, users } from "./db/schema.ts";
import { bool, int, obj, res, rows, str } from "./schemas.ts";

const uuid = { type: "string", format: "uuid" } as const;
const PAGE = 50;

/** The signed-in person's notifications, and how they want them by email. */
export function notificationRoutes({ app, db, requireUser, audit, mail }: AppContext) {
  app.get(
    "/api/notifications",
    {
      onRequest: requireUser,
      schema: { response: res(obj({ notifications: rows, unread: int, emailNotifications: str, mail: bool })) },
    },
    async (req) => {
      const user = req.user as { id: string; isAdmin: boolean };
      // Only from projects the person can still open, so losing access also hides what they were told about it.
      const visible = and(
        eq(notifications.userId, user.id),
        isNull(projects.archivedAt),
        user.isAdmin ? undefined : eq(projectMembers.userId, user.id),
      );
      const mine = and(eq(projectMembers.projectId, notifications.projectId), eq(projectMembers.userId, user.id));
      const list = await db
        .select({
          id: notifications.id,
          kind: notifications.kind,
          text: notifications.text,
          path: notifications.path,
          createdAt: notifications.createdAt,
          readAt: notifications.readAt,
        })
        .from(notifications)
        .innerJoin(projects, eq(projects.id, notifications.projectId))
        .leftJoin(projectMembers, mine)
        .where(visible)
        .orderBy(desc(notifications.createdAt))
        .limit(PAGE);
      const [unread] = await db
        .select({ n: count() })
        .from(notifications)
        .innerJoin(projects, eq(projects.id, notifications.projectId))
        .leftJoin(projectMembers, mine)
        .where(and(visible, isNull(notifications.readAt)));
      const [me] = await db
        .select({ emailNotifications: users.emailNotifications })
        .from(users)
        .where(eq(users.id, user.id));
      return {
        notifications: list,
        unread: unread?.n ?? 0,
        emailNotifications: me?.emailNotifications,
        mail: mail.enabled,
      };
    },
  );

  // Marks the given notifications read, or all of them when no ids are given.
  app.post(
    "/api/notifications/read",
    {
      onRequest: requireUser,
      schema: {
        response: res(obj({ marked: int })),
        body: {
          type: "object",
          additionalProperties: false,
          properties: { ids: { type: "array", minItems: 1, maxItems: 500, items: uuid } },
        },
      },
    },
    async (req) => {
      const userId = req.user?.id as string;
      const { ids } = req.body as { ids?: string[] };
      const marked = await db.transaction(async (tx) => {
        const rows = await tx
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(notifications.userId, userId),
              isNull(notifications.readAt),
              ids ? inArray(notifications.id, ids) : undefined,
            ),
          )
          .returning({ id: notifications.id });
        if (rows.length > 0) {
          await audit(tx, userId, "notification.read", "user", userId, { label: `${rows.length} read` });
        }
        return rows.length;
      });
      return { marked };
    },
  );

  app.patch(
    "/api/account",
    {
      onRequest: requireUser,
      schema: {
        response: res(obj({ emailNotifications: str })),
        body: {
          type: "object",
          required: ["emailNotifications"],
          additionalProperties: false,
          properties: { emailNotifications: { enum: ["each", "digest", "off"] } },
        },
      },
    },
    async (req) => {
      const userId = req.user?.id as string;
      const { emailNotifications } = req.body as { emailNotifications: "each" | "digest" | "off" };
      await db.transaction(async (tx) => {
        // Starting a digest now means it covers what arrives from now on, not the whole backlog.
        await tx.update(users).set({ emailNotifications, digestSentAt: new Date() }).where(eq(users.id, userId));
        await audit(tx, userId, "user.update", "user", userId, { label: `email: ${emailNotifications}` });
      });
      return { emailNotifications };
    },
  );
}
