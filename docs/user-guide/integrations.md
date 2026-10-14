# Integrations

Connect the tool to the rest of your work: scripts that use the API, webhooks that tell other systems about changes, links from items to issues and code, and sign-in through your company's identity provider.

## The API

Everything the screens do goes through the same API. Choose **API** in the top bar for the list of routes, with their parameters and request bodies. The machine-readable description is at `/api/openapi.json` (OpenAPI 3.1): import it into Postman or a code generator.

A script signs in with an access token:

1. Choose your name at the top right.
2. Under **Access tokens**, name the token, choose when it expires, and choose **Create token**.
3. Copy the token. It is shown once.
4. Send it as `Authorization: Bearer orq_…`.

The token list shows when each token was last used. Revoke a token you no longer need with ×.

## Webhooks

Project admins: open **Integrations** in the project's side bar.

1. Enter the address that should receive changes.
2. Optionally, under **Only these changes**, list the kinds you want, e.g. `item, link, review`. Empty means every change.
3. Choose **Add webhook** and copy the secret. It is shown once.

Every change in the project is then posted as JSON within seconds:

```json
{
  "id": "…",
  "event": "item.revise",
  "at": "2026-10-14T10:47:31.369Z",
  "projectId": "…",
  "entityType": "item",
  "entityId": "…",
  "label": "SYS-001 Alarm volume",
  "actorUserId": "…"
}
```

To check that a post came from this tool, compute the HMAC-SHA256 of the raw body with the secret and compare it with the `X-Webhook-Signature-256` header (`sha256=<hex>`). `X-Webhook-Event` names the change.

**Send test** posts a `ping`. **Deliveries** shows the last 50 posts and whether they arrived. A failed post is tried again after 1, 2, 4… minutes, eight times.

The server refuses addresses on private networks, such as `10.x.x.x` or `localhost`. If your receiver is inside the company network, the server's administrator sets `ALLOW_PRIVATE_URLS=true` (see the [install guide](install.md)).

## References

The **References** panel on an item lists links to things outside the tool: a Jira issue, a GitHub pull request, a document. Editors paste the address and choose **Add reference**. A failed test run's defect link appears here too, on the test case.

### Open or closed

When the project is connected to the tool, a reference shows its title and an **Open** or **Closed** badge. Project admins add connections under **Integrations → Connections**:

| Tool | Address | Token |
|---|---|---|
| Jira Cloud | `https://acme.atlassian.net` | `you@acme.com:<API token>` |
| Jira Data Center | `https://jira.acme.com` | a personal access token |
| GitHub | `https://github.com` (or your GitHub Enterprise address) | a token that can read issues |
| GitLab | `https://gitlab.com` (or your own) | a token with `read_api` |

A token is optional for public projects. The server can store tokens only when its administrator has set `INTEGRATION_KEY`.

The state is read every 15 minutes. **Check state** on an item reads it at once.

### References from code

Tag code with the UID of the requirement it implements:

```c
// @req SYS-042
void sound_alarm(void) { … }
```

Run the scanner in CI after each push to the main branch, with an access token of an editor of the project:

```bash
REQ_TOKEN=orq_… node packages/cli/src/main.ts --server https://req.example.com --project <project id> --repository https://github.com/acme/pump
```

The project id is in the project's address. Each tagged item gets a **Code** reference to the file, titled with the lines and the commit. Remove a tag and its reference goes at the next run. Tags whose UID matches no item are listed in the output.

## Sign in with your identity provider

When the administrator has set up OpenID Connect, the sign-in page shows **Sign in with …**. The first time, an account is made for your email address, or your existing account is used. You get no project by signing in: a project admin still adds you.

An account made this way has no password. To sign a review, choose **confirm who you are** in the sign dialog. Your identity provider asks for your password, then sends you back. Sign within five minutes.
