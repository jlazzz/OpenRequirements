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

## Turn on single sign-on

People can sign in through an OpenID Connect identity provider (Okta, Microsoft Entra ID, Google, Keycloak, Authentik…). Local accounts keep working.

1. At the provider, register a web application with the redirect URI `https://DOMAIN/api/oidc/callback` (or `PUBLIC_URL/api/oidc/callback`), and the scopes `openid email profile`.
2. Add to `deploy/.env`, then run the install command again:

```
OIDC_ISSUER=https://login.example.com/realms/acme
OIDC_CLIENT_ID=requirements
OIDC_CLIENT_SECRET=…
OIDC_NAME=Acme login
```

The provider must say the email address is verified. The first sign-in makes an account with that address, or uses the account that already has it. It gets no project until a project admin adds it.

## Webhooks and connections

Project admins set these up in each project ([user guide](integrations.md)). Two settings are the server administrator's:

```
# Encrypts the tokens of Jira, GitHub and GitLab connections. Any long random string. Keep it: if it changes, tokens must be entered again.
INTEGRATION_KEY=…
# Lets webhooks and connections call addresses on private networks, e.g. a Jira inside the company network.
ALLOW_PRIVATE_URLS=true
```

Without `ALLOW_PRIVATE_URLS`, the server refuses to call `localhost`, `10.x`, `172.16–31.x`, `192.168.x` and similar addresses, so a project admin cannot reach inside your network through it.

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

Releases are numbered (`1.2.3`, [changelog](https://github.com/jlazzz/OpenRequirements/blob/development/CHANGELOG.md)). The running version is in the account dialog (click your name) and at `/api/version`.

1. Read the changelog entries between your version and the new one. A step you must take is written there.
2. Take a whole-server backup (see [Back up](#back-up)). Do not skip this: migrations only move forward, and the database is upgraded when the app starts.
3. Move to the new version, by one of:
   - **A published image** (recommended). Pin the version in `deploy/.env`, then pull and restart:

     ```
     APP_IMAGE=ghcr.io/<owner>/<repo>
     APP_VERSION=1.2.3
     ```

     ```bash
     docker compose -f deploy/docker-compose.yml pull app
     docker compose -f deploy/docker-compose.yml up -d
     ```

   - **From the repository.** Get the new version of the repository and run `up -d --build` again. Leave `APP_IMAGE` and `APP_VERSION` unset.
4. Open the app and check the version in the account dialog.

Upgrades only move forward. To go back to an older version, restore the backup from step 2: an older image started on a newer database may fail or misread it.

### Check an image's signature

Release images are signed with [cosign](https://docs.sigstore.dev/) (keyless) and carry an SBOM. See [docs/RELEASING.md](https://github.com/jlazzz/OpenRequirements/blob/development/docs/RELEASING.md) for the command.
