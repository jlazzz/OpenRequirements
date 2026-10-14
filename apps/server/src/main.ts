import { buildApp } from "./app.ts";
import { createDb, runMigrations } from "./db/client.ts";
import { smtpMailer, startMailLoop } from "./mail.ts";
import { refreshReferences } from "./references.ts";
import { deliverDue } from "./webhooks.ts";
import { startLoop } from "./worker.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url);
await runMigrations(db);

// Links in emails need the address people open the app at.
const publicUrl = (
  process.env.PUBLIC_URL || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "http://localhost:3000")
).replace(/\/$/, "");
const smtpUrl = process.env.SMTP_URL;
const mail = { enabled: Boolean(smtpUrl), publicUrl };
const outbound = {
  allowPrivate: process.env.ALLOW_PRIVATE_URLS === "true",
  integrationKey: process.env.INTEGRATION_KEY || undefined,
};
const env = process.env;
const oidc =
  env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET
    ? {
        issuer: env.OIDC_ISSUER,
        clientId: env.OIDC_CLIENT_ID,
        clientSecret: env.OIDC_CLIENT_SECRET,
        name: env.OIDC_NAME || "single sign-on",
      }
    : undefined;

const app = await buildApp(db, {
  mail,
  oidc,
  outbound,
  logger: true,
  attachmentsDir: process.env.ATTACHMENTS_DIR,
  maxAttachmentMb: Number(process.env.MAX_ATTACHMENT_MB) || undefined,
  // DOMAIN is set when Caddy in deploy/docker-compose.yml serves the app over HTTPS.
  https: Boolean(process.env.DOMAIN),
  webRoot: process.env.WEB_ROOT ?? new URL("../../web/dist", import.meta.url).pathname,
  helpRoot: process.env.HELP_ROOT ?? new URL("../../../docs/.vitepress/dist", import.meta.url).pathname,
});
if (smtpUrl) {
  const from = process.env.SMTP_FROM || `Requirements <noreply@${new URL(publicUrl).hostname}>`;
  startMailLoop(db, smtpMailer(smtpUrl, from), mail, (error) => app.log.error(error, "sending email failed"));
}
startLoop(
  () => deliverDue(db, outbound.allowPrivate),
  (error) => app.log.error(error, "webhook delivery failed"),
  10_000,
);
startLoop(
  () => refreshReferences(db, outbound),
  (error) => app.log.error(error, "reading references failed"),
  60_000,
);
await app.listen({ host: process.env.HOST ?? "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
