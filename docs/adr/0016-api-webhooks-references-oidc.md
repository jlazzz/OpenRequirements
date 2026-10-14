# 0016: OpenAPI, webhooks, external references and OpenID Connect

Date: 2026-10-14
Status: Accepted

## Context

Bundle H of the [roadmap](../ROADMAP.md) (J4, integrations). Every route already had a JSON schema, scripts already signed in with personal access tokens, and every write already called `audit(...)`. Missing: a description of the API, a way to tell other systems about changes, links from items to issues and code elsewhere, and sign-in through a company's identity provider. The roadmap proposed `@fastify/swagger` and `openid-client`, and left two decisions to the owner: those dependencies, and how a person without a password signs a review.

## Decisions

### No new dependency

Both were written on what the project already has, as the Word and ReqIF code was ([ADR 0015](0015-word-export-import-and-reimport.md)).

- **OpenAPI**: `domain/openapi.ts` turns the routes Fastify registered (collected by the existing `onRoute` hook) into an OpenAPI 3.1 document: paths, path and query parameters, and request bodies, from the schemas the routes already validate with. About 60 lines; `@fastify/swagger` would also bring a UI bundle.
- **OpenID Connect**: `oidc.ts` is the authorization code flow with PKCE on `fetch`, about 200 lines. The ID token comes straight from the provider's token endpoint over HTTPS, so its claims are checked (issuer, audience, expiry, nonce, and `auth_time` when signing) but not its signature, which OpenID Connect Core 3.1.3.7 allows for this case. `openid-client` would add signature checking we do not need and a dependency to keep up to date.

### OpenAPI

- Served at `GET /api/openapi.json` (public). The web app shows it at `/api-docs`, linked as "API" in the top bar, instead of a separate Swagger UI.
- The committed `docs/openapi.json` is checked by a test; `npm run openapi` writes it. It describes a server without OIDC.
- Response bodies are not described: adding response schemas to Fastify routes also strips undeclared fields from answers, which is a risk to take route by route later.
- Access tokens gain an optional expiry (`expiresInDays`, 1 to 3650; the screen defaults to 90 days) and `lastUsedAt`, written at most once a minute per token.

### Webhooks

- Tables `webhooks` (project, URL, secret, event filter, soft-deleted) and `webhook_deliveries`. Project admins manage them on the project's Integrations page.
- `audit(...)` queues a delivery for every live webhook of the project whose filter matches the first word of the action (`item`, `link`, `review`…; empty means all). Every write already goes through `audit`, in the writer's transaction, so a webhook sees exactly the committed changes, and nothing else needs to remember to call it. The payload is the audit event: id, action, time, project, entity type and id, label, actor id.
- The worker posts the JSON every 10 seconds, signed with `X-Webhook-Signature-256: sha256=<HMAC-SHA256 of the body>` as GitHub does, and retries after 1, 2, 4… minutes, eight times. Like the email outbox, a delivery row's attempt columns change until it is delivered; it is not history. "Send test" queues a `ping` to one webhook.
- The secret is stored readable, since signing needs it, and shown once, when the webhook is made.

### Calls to other servers refuse private networks

Webhooks and connections are URLs a project admin types, which the server then calls: a way into the server's own network (cloud metadata at 169.254.169.254, the database, an internal admin page). `worker.ts` resolves the host and refuses loopback, private, link-local, CGNAT and multicast addresses (`domain/network.ts`), never follows redirects, and gives up after 10 seconds. `ALLOW_PRIVATE_URLS=true` lifts the address check for installs whose Jira or receiver is inside the company network. The roadmap named this `WEBHOOK_ALLOW_PRIVATE`; it covers connections too, so it is named for both. Known gap: the address is checked and then looked up again by `fetch`, so DNS that changes in between gets through.

### External references

- Table `external_references` (item, URL, title, kind, source, state, soft-deleted). Kind is judged from the URL (`domain/references.ts`): Jira, GitHub, GitLab, code, other. A failed run's defect link is also added as a reference on its test case.
- Editors add and remove references on the item page. Adding and removing are audited on the item.

### Live status through connections

- Table `integrations`: per project, a tool (Jira, GitHub, GitLab), a base URL and an optional token, encrypted with AES-256-GCM under a key derived from `INTEGRATION_KEY` (`domain/secret.ts`). Without the key, connections work without a token only. A token is sent only to its own connection's server: a reference is read through a connection only when its URL starts with the connection's base URL.
- The worker reads, every minute, up to 100 references not read in the last 15 minutes, and "Check state" on an item reads its references at once. It stores the title, open or closed, and the tool's kind. This is a copy of what another tool says and is not audited.
- Jira Cloud tokens are given as `email:api-token` (basic auth); anything without a colon is sent as a bearer token (Jira Data Center). GitHub Enterprise and self-hosted GitLab work by their base URL.

### Code traceability

`packages/cli` scans the files `git ls-files` lists for `@req SYS-042` tags and sends them with `PUT /api/projects/:projectId/code-references`, given the repository URL as `source`. One reference per tagged UID and file, pointing at the file on the branch so it stays the same between commits; the title names the lines and the commit. The server makes that repository's references match: adds, updates titles, removes what is no longer tagged, with one audit event per run. References added by hand are never touched. Unknown UIDs are reported back.

### OpenID Connect sign-in

- Configured by `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and `OIDC_NAME`. The redirect URI is `PUBLIC_URL/api/oidc/callback`. The issuer must use HTTPS, except on localhost.
- The sign-in page shows "Sign in with …". The first sign-in makes the account, with no password, matched by a verified email (`email_verified` must be true) to an existing account otherwise. A deactivated account is refused. Local accounts keep working. Anyone the provider lets in gets an account but no project: access still comes from project membership.
- The state, nonce and PKCE verifier travel in a 10-minute, `SameSite=Lax` cookie, since the provider sends the browser back from its own site. The session cookie stays `Strict`; a browser stores it from the callback's response.
- SAML and LDAP wait for a design partner to ask.

### Signing with single sign-on: sign in again at the provider

Owner decision 3 of the roadmap, taken as recommended. An approver without a password follows "confirm who you are" in the sign dialog: `/api/oidc/reauth` sends them to the provider with `prompt=login` and `max_age=0`, and the callback accepts only an ID token whose `auth_time` is after that moment and whose email is the signed-in person's. It then marks the session (`sessions.reauth_at`). For five minutes, one signature can be made without a password; using it clears the mark. Failed attempts are audited as before. A separate signing PIN would be another secret to manage.

### Backup

Format version 7 adds `externalReferences` (without their read state, which is read again). Webhooks and connections hold secrets and are not in backups.

## Consequences

- Two new background loops in the server process, beside the email loop: webhook delivery and reference reading. `startLoop` in `worker.ts` is shared by all three.
- New path parameters `webhookId`, `referenceId` and `integrationId` are known to the permission hook.
- Not built: response schemas in the OpenAPI document; SAML and LDAP; group or domain rules for who may sign in through the provider; a "re-deliver" button; links from items to individual commits (code references point at files).
