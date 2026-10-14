# 0014: HTTPS, edit conflicts, notifications, email and account recovery

Date: 2026-10-14
Status: Accepted

## Context

Bundle F of the [roadmap](../ROADMAP.md) (J3, team safety). The app spoke plain HTTP, a save refused with "someone saved first" left the person to reload and redo their work, mentions reached nobody, and a forgotten password needed database access. The owner asked for the bundle to be built; the open choices below took the roadmap's recommendations.

## Decisions

### HTTPS by Caddy, switched on in `deploy/.env`

A `caddy` service in `deploy/docker-compose.yml`, under the Compose profile `https`, runs `caddy reverse-proxy --from $DOMAIN --to app:3000`: certificates from Let's Encrypt, renewed by Caddy, no config file. `COMPOSE_PROFILES=https` and `DOMAIN` turn it on. Local use is unchanged.

When `DOMAIN` is set, the app trusts the proxy's `X-Forwarded-*` headers (so rate limits see the real client), marks the session cookie `Secure` and sends HSTS for a year. HSTS leaves out `includeSubDomains`, because `DOMAIN` might be a company's bare domain.

### Security headers by hand, not `@fastify/helmet`

Six headers on every response, from one `onSend` hook in `app.ts`: a Content-Security-Policy (`script-src 'self'`, inline styles allowed for Mantine, images from `data:` and `blob:` for pasted images), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy` and HSTS. A route that sets its own, the attachment download, keeps it. Helmet would add a dependency for about ten lines. The inline script in `index.html` that applies dark mode before the first paint moved to `public/color-scheme.js` so the policy can forbid inline scripts.

### Edit conflicts: a merge screen, picked per field

Settles the open point in DESIGN.md section 3. The rule stays: a save names the version it started from, and is refused (409) when another was saved since. What changes is what happens next:

- The page saves the person's edits to their draft, reloads, and shows the merge panel.
- `mergeItem` in `packages/shared/src/merge.ts` is a three-way merge of the draft's base version, the draft and the newest version. A part (name, description, or one field) changed on one side only takes that side. A part both changed differently is a conflict; the person picks "keep mine" or "take theirs" for each.
- The description is one part. Merging inside rich text would need a structural merge of editor JSON for little gain: two people rewording the same requirement at once is rare, and the other version stays in the history.
- Combining only changes the draft. The person still saves the version, from the new base.

The item page also polls `GET /api/items/:itemId/editing` every 15 seconds: the newest version number and its author, and who else has a draft of the item. This settles DESIGN.md section 11's second point: others see *that* someone is editing, never *what*, as drafts stay private. The poll offers a version saved meanwhile without reloading the form under the person's hands.

### Notifications are written with the action, in one table

`notifications` (person, project, kind, text, path in the web app, actor, `readAt`). `notify()` in `mail.ts` writes them in the transaction of the action, next to its audit event, so a rolled-back action notifies nobody. Nobody is notified of their own action. Kinds:

- **mention:** each person resolved from `@Name` in a comment
- **review:** each reviewer and approver of a new review
- **run:** the assignee of runs that were not already theirs
- **suspect:** for each relationship a save or bulk edit turns suspect (it was not suspect before), the person who saved the far end last. `watchSuspect` in `links.ts` compares the live links before and after the save. A status-only version makes nothing suspect, so it notifies nobody either.

The text is written once, when the notification is made, like an audit label. The list shows only notifications from projects the person can still open. Marking read changes `readAt`, the one column that ever changes, and is audited.

Notifications are not in project backups: they are about people's inboxes, not the project's record.

### Email through an outbox, sent by a loop in the server process

`outbox` holds each email. `queueMail` writes a row in the caller's transaction, so an email goes out only for a committed change. `startMailLoop`, started by `main.ts` when `SMTP_URL` is set, wakes every 30 seconds, queues daily digests and sends what is due with `nodemailer`. A failure keeps its error on the row and is retried after 1, 2, 4… minutes, eight times. Rows are taken `FOR UPDATE SKIP LOCKED`, so a second app process would not send the same email twice. This is the project's first background worker; webhooks (bundle H) will use the same pattern.

Without `SMTP_URL` nothing is queued and nothing is sent. Links in emails start with `PUBLIC_URL`, else `https://DOMAIN`.

Each person chooses in their account: an email per notification (default), a daily digest of what is unread, or none. Sending is delivery bookkeeping, not a change anyone made: the outbox and `users.digest_sent_at` are not audited. Choosing the setting is.

`nodemailer` is the dependency the roadmap named. SMTP with TLS, authentication and the provider quirks is far more than a few lines, and nodemailer has no dependencies of its own.

### Account recovery by one-time link

`password_resets` holds the SHA-256 of each link's token, its expiry and when it was used, like invitations.

- **Forgot password** (public, rate limited): emails a link valid for one hour. It answers the same whether or not the address has an account. Without email it answers 404, and the sign-in page does not offer it.
- **An administrator** makes a link from **Users**, valid for 3 days. It is emailed when email is set up, and shown to copy either way, as invitation links are.
- **Using a link** sets the password, marks the link used, ends every session of the account and signs the person in.

Invitations are now emailed too, when email is set up. The link is still shown to the administrator.

## Consequences

- Without `SMTP_URL`, everything works as before, plus in-app notifications.
- An administrator can take over an account by making a reset link for it. They could already do more as instance administrator; the link is audited with who made it.
- Not built: notifying approvers when everyone has signed and when a review closes (roadmap J1 slice 2), notifications for comments without a mention, and an outbox screen for administrators.
