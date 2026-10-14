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

## Sign-in limits

Three optional rules for regulated teams. Set them in the app's environment (`deploy/.env`); each is off when unset or `0`, which is how the app behaved before.

| Variable | Effect |
|---|---|
| `LOGIN_LOCKOUT_ATTEMPTS` | Lock an account after this many failed sign-ins in a row |
| `LOGIN_LOCKOUT_MINUTES` | How long the lock lasts. Default 15 |
| `PASSWORD_MAX_AGE_DAYS` | Passwords expire after this many days. The person sets a new one with **Forgot password?**, or an administrator sends a reset link. Single sign-on accounts are not affected |
| `SESSION_IDLE_MINUTES` | Sign people out after this many minutes without activity |

A locked account gets the same "Wrong email or password" answer, even for the right password. A password reset unlocks it. With lockout on, failed sign-ins appear in the audit log.

### Check the audit log

Every audited change is chained to the one before it with a SHA-256 hash. As an administrator, open **Users**, then **Verify audit log**. It reports "Intact", or the first event that was changed or is missing. Events written before this feature existed, and events restored from a project backup, are counted but not covered. A person with full database access could still rewrite the whole chain; anchoring it outside the database is planned.

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

## Measured performance

`npm run perf` loads a project through the API and times it against the budgets: a document of 2,000 items opens in under 2 seconds, and search answers in under 500 ms. It makes a new project on the instance it is pointed at, so use a scratch one. The figures are the API's response time (the browser then draws the rows), the slowest of five calls, with the client on the same machine as the server.

Measured 2026-10-14 on a MacBook Air (Apple M4, 10 cores, 16 GB, macOS 15.6), Node 26, PostgreSQL 17 in Docker on the same machine, 2,000 requirements, 500 tests, 200 needs and 4,000 relationships:

| Measure | Budget | Slowest of 5 |
|---|---|---|
| Open a document (project tree and 2,000 items) | 2,000 ms | 50 ms |
| Search, four kinds of query | 500 ms | 6 ms |
| Trace view of the set, two levels down | none set (5,000 ms in the script) | 47 ms |
| Create a baseline of the project | none set (10,000 ms in the script) | 351 ms |

With `PERF_ITEMS=3500` (4,700 items in the project): document 86 ms, search 11 ms, trace 67 ms, baseline 537 ms. Searching scans every item of the project without an index, so it grows with project size; the code names the index to add when it nears the budget. Numbers from a small server or a database on another machine will differ: run the script there.

A GitHub workflow, `perf.yml`, runs the same script on demand and nightly on a GitHub-hosted runner.
