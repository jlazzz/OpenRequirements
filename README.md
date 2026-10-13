# Requirements (working name)

Open-source, self-hostable requirements management tool. Early development: see [STATUS.md](STATUS.md).

## Install

Needs Docker with Docker Compose.

```bash
git clone https://github.com/jlazzz/OpenRequirements.git
cd OpenRequirements
docker compose -f deploy/docker-compose.yml up -d --build
```

Open `http://<server-address>:3000`. The first visit creates the administrator account.

To change the port or the database password, create `deploy/.env`:

```
APP_PORT=8080
POSTGRES_PASSWORD=choose-a-password
```

Set the password before the first start; changing it later does not change an existing database.

**Plain HTTP only for now.** Passwords cross the network unencrypted. Use it on a trusted network only.

## Develop

Needs Node 24 or newer and Docker.

```bash
npm install
npm run db:up        # Postgres in Docker
npm run dev:server   # API on http://localhost:3000
npm run dev:web      # web app on http://localhost:5173
npm test
```

Conventions and rules are in [CLAUDE.md](CLAUDE.md). The plan is in [docs/PROJECT_OUTLINE.md](docs/PROJECT_OUTLINE.md) and [docs/DESIGN.md](docs/DESIGN.md).

## License

[AGPL-3.0](LICENSE)
