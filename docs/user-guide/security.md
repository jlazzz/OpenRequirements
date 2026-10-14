# Security overview

For the person at your company who reads the security questionnaire. Everything here describes what the code does today; the last section lists what it does not do. To report a vulnerability, see [SECURITY.md](https://github.com/jlazzz/OpenRequirements/blob/development/SECURITY.md).

## Where data lives

- **PostgreSQL**: all project data, accounts, sessions, audit log, outbox. You run it; nothing leaves your servers.
- **Disk volume** (`ATTACHMENTS_DIR`): uploaded images and evidence files.
- **No telemetry.** The server calls other servers only for what an administrator sets up: SMTP, the OpenID Connect provider, webhooks, and Jira, GitHub or GitLab connections.

## Sign-in and sessions

- **Passwords** are hashed with scrypt (N = 2^15, 16-byte random salt). Minimum length 12 when set or changed. No complexity or history rules.
- **Session cookie**: random 256-bit value; only its SHA-256 is stored. `HttpOnly`, `SameSite=Strict`, `Secure` when `DOMAIN` is set. Valid 30 days. Changing a password ends the person's other sessions; so does a password reset.
- **No CSRF token**: protection relies on `SameSite=Strict` and on bearer tokens not being sent by browsers on their own.
- **Rate limit**: sign-in, setup, password change, password reset, invitation acceptance and review signing allow 10 requests per minute per client address. Behind Caddy the address comes from the proxy.
- **Optional, off unless set** ([ADR 0020](../adr/0020-part-11-hardening-audit-chain.md)): account lockout after failed sign-ins, password expiry, inactivity timeout. Environment variables are in that ADR.
- **Single sign-on**: OpenID Connect, authorization code flow with PKCE, state and nonce, ID token checked by the server ([ADR 0016](../adr/0016-api-webhooks-references-oidc.md)). The provider must say the email is verified.
- **Personal access tokens** (`Authorization: Bearer`): 256-bit, stored as SHA-256, optional expiry, "last used" shown. A token cannot change a password, create tokens or sign a review.

## Permissions

Four project roles (Viewer, Reviewer, Editor, Admin) plus instance administrator. Every `/api/` route requires sign-in or is marked public; the server refuses to start otherwise. A project route answers 404 to non-members. Each endpoint's check has a test.

## Network and browser protections

- **Headers on every response**: Content-Security-Policy (`default-src 'self'`, scripts from self only, no framing, no plugins), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, and HSTS for one year when `DOMAIN` is set. `style-src` allows inline styles.
- **Uploads**: type judged by content, not name; served with `nosniff` and `default-src 'none'; sandbox`; only images are shown inline, the rest download. Size limit `MAX_ATTACHMENT_MB` (default 25).
- **Outbound calls** (webhooks, connections): http and https only; addresses that resolve to private networks are refused unless `ALLOW_PRIVATE_URLS=true`; redirects are not followed; ten-second timeout.
- **Database access**: parameterized queries only.
- **Container**: the app runs as the unprivileged `node` user.

## Secrets stored

| Secret | Stored as |
|---|---|
| Password | scrypt hash |
| Session, API token, reset link, invitation | SHA-256 of the random value |
| Connection token (Jira, GitHub, GitLab) | AES-256-GCM with a key derived from `INTEGRATION_KEY`; without the key, tokens cannot be stored |
| Webhook secret | **Plain text** in the database: it is needed to sign each delivery |
| SMTP and OIDC secrets | Environment variables of the server |

Backups leave out webhooks and connections, and restored accounts have no password until invited.

## Audit log

Every write is an audit event in the same transaction. Events are chained with SHA-256 (previous hash plus the row), and `GET /api/audit/verify` (instance administrators; a button on the Users page) detects a changed, removed or reordered row. See [ADR 0020](../adr/0020-part-11-hardening-audit-chain.md).

## Dependencies and releases

- CI runs `npm audit --omit=dev` and fails on a high or critical finding in a runtime dependency. Dependabot proposes updates weekly.
- The server has few runtime dependencies: Fastify, its cookie, rate-limit and static plugins, drizzle-orm, pg and nodemailer. ReqIF, Word, OIDC and the `.zip` code are written in the repository.
- Release images are signed with cosign and carry an SBOM ([ADR 0021](../adr/0021-numbered-releases-signed-images.md)).

## Backups

Project backup (JSON, instance administrator) and database dumps are yours to protect: neither is encrypted by the tool. Back up the database and the attachments volume together; see the [install guide](install.md).

## What is not protected

- **No encryption at rest** by the tool for the database, the attachments volume or backups. Use disk or volume encryption.
- **The audit chain is not anchored outside the database.** Someone who can write to the database and rehashes every row from a point, or deletes the newest rows, is not detected. Rows from before the chain, or restored from a backup, are outside it.
- **No SAML, LDAP or SCIM.** Any provider account with a verified email can sign in through OpenID Connect and gets an account without projects.
- **No two-factor authentication** for local accounts, other than what your identity provider enforces.
- **No password complexity or history rules**, no breach-list check.
- **Lockout is per account**, so someone can lock a known account for the lock period.
- **Rate limits are per address, in memory**: they reset on restart and are not shared between several server processes.
- **Outbound address check** can be bypassed by DNS that changes between the check and the call.
- **Webhook secrets** are readable by anyone with database access.
- **No third-party penetration test** has been done, and the project holds no SOC 2 or ISO 27001 certificate.
- **HTTPS** is a Caddy service you turn on; the plain-HTTP port is open until you restrict it ([install guide](install.md)).
