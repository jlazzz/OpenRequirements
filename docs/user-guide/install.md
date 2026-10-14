# Install, back up and upgrade

For one server, reached by a small team. You need Docker with Compose.

## Install

1. Copy the repository to the server.
2. Create `deploy/.env` with a database password of your own:

   ```
   POSTGRES_PASSWORD=choose-a-long-random-value
   ```

3. Start it from the repository root:

   ```bash
   docker compose -f deploy/docker-compose.yml up -d --build
   ```

4. Open `http://<server>:3000`. The first person to open it creates the administrator account.

To use another port, add `APP_PORT=8080` to `deploy/.env`.

Without the next section the app speaks plain HTTP: passwords and session cookies cross the network unencrypted. That is fine on your own machine, not at a company.

## Turn on HTTPS

You need a domain name that points at the server, and ports 80 and 443 open to the internet so Let's Encrypt can issue the certificate. Caddy, included in the Compose file, gets and renews it by itself.

1. Add three lines to `deploy/.env`:

   ```
   COMPOSE_PROFILES=https
   DOMAIN=requirements.example.com
   APP_PORT=127.0.0.1:3000
   ```

   `APP_PORT` keeps the plain-HTTP port reachable only from the server itself.

2. Run the install command again.
3. Open `https://requirements.example.com`.

With `DOMAIN` set, the app marks its session cookie `Secure` and tells browsers to use HTTPS only (HSTS, for one year). Turning HTTPS off again later means browsers that visited keep insisting on HTTPS until that year runs out.

## Turn on email

Email carries notifications, "Forgot password" links and invitations. Without it the app works the same, and an administrator copies links by hand.

Add to `deploy/.env`, with your mail provider's details, then run the install command again:

```
SMTP_URL=smtps://user:password@smtp.example.com:465
SMTP_FROM=Requirements <requirements@example.com>
```

Links in emails start with `https://DOMAIN`. Without HTTPS, set `PUBLIC_URL=http://<server>:3000` instead.

A failed email is tried again after 1, 2, 4… minutes, eight times in all. What was sent and what failed is in the `outbox` table.

## Add people

1. As the administrator, open **Users** and create an invitation for the person's email address.
2. With email turned on, the invitation is emailed. Without it, send them the link yourself. It works once and expires after 7 days.
3. Open the project, then **Members**, and give them a role: Viewer, Reviewer, Editor or Admin.

Someone who leaves: **Users**, then **Deactivate**. Their work and name stay in the history.

Someone who forgot their password: with email turned on, they click **Forgot password?** on the sign-in page. Otherwise, open **Users**, click **Reset link** next to their name and send them the link. It works once, for 3 days.

## Back up

There are two kinds of backup. Use both.

- **One project, as a file.** Open the project's home page and click **Download backup**. The file holds every item, version, relationship and its confirmations, comment, baseline and image. An instance administrator restores it from the **Projects** page; it always arrives as a new project.
- **The whole server.** Back up the two Docker volumes, `deploy_db-data` (database) and `deploy_attachments` (images), with your normal server backup. For the database, a dump is safer than copying files:

  ```bash
  docker compose -f deploy/docker-compose.yml exec db pg_dump -U app app > backup.sql
  ```

## Upgrade

1. Take a whole-server backup.
2. Get the new version of the repository.
3. Run the install command again. The database is upgraded when the app starts.

Upgrades only move forward. To go back to an older version, restore the backup from step 1.
