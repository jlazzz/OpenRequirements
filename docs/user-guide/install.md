# Install, back up and upgrade

For one server on a private network, reached by a small team. You need Docker with Compose.

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

**Limit:** the app speaks plain HTTP. Passwords and session cookies cross the network unencrypted. Run it only on a network you trust, or put an HTTPS reverse proxy in front of it.

## Add people

1. As the administrator, open **Users** and create an invitation for the person's email address.
2. Send them the link yourself. It works once and expires after 7 days. No email server is needed.
3. Open the project, then **Members**, and give them a role: Viewer, Reviewer, Editor or Admin.

Someone who leaves: **Users**, then **Deactivate**. Their work and name stay in the history.

## Back up

There are two kinds of backup. Use both.

- **One project, as a file.** Open the project's home page and click **Download backup**. The file holds every item, version, relationship, comment, baseline and image. An instance administrator restores it from the **Projects** page; it always arrives as a new project.
- **The whole server.** Back up the two Docker volumes, `deploy_db-data` (database) and `deploy_attachments` (images), with your normal server backup. For the database, a dump is safer than copying files:

  ```bash
  docker compose -f deploy/docker-compose.yml exec db pg_dump -U app app > backup.sql
  ```

## Upgrade

1. Take a whole-server backup.
2. Get the new version of the repository.
3. Run the install command again. The database is upgraded when the app starts.

Upgrades only move forward. To go back to an older version, restore the backup from step 1.
