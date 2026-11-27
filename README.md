# Records admin

Version 0.4.0

Login-gated admin for artists and their entries. This is a separate system from the intake form: it has its own SQLite database and its own login. An administrator creates an artist, and the system assigns an ID such as `A0001`. That ID is what someone types into the Record ID field on the intake form. Entries store a first name, last name, address, and image for that artist.

The API is an [Effect](https://effect.website) HTTP service on Node. Uploaded files are parsed with Effect's multipart support, checked again on the server, and written under a configurable directory.

## Run locally

Requirements: Node.js 22 or newer, and pnpm 10.

From a Windows command prompt, in this folder:

```cmd
copy .env.example .env
pnpm install
pnpm dev
```

If `pnpm` is not on your PATH:

```cmd
corepack enable
corepack prepare pnpm@10.33.4 --activate
```

Then open:

- App: http://localhost:5174
- API: http://127.0.0.1:3002
- Username: `admin`
- Password: `change-me`

`pnpm dev` builds the shared contracts, then runs the Vite app and the API together. The dev server proxies `/api` to the API. These ports are different from the intake form (`5173` and `3001`) so both apps can run at the same time. Each app keeps its own database.

The API and the Vite dev/preview servers listen on `HOST` (default `127.0.0.1`). They are not reachable from other machines unless you set `HOST` to something else.

Other root scripts:

```cmd
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
pnpm check-version
```

Production on a VPS is `pnpm build` then `pnpm start`. That builds the web app and serves both the web UI and the API from one Node process on `HOST`:`PORT` (default `127.0.0.1:3002`).

## Environment

Copy `.env.example` to `.env` at the repo root. The API reads that file when it starts from `apps/api`, and falls back to the repo root. Relative paths are resolved from `apps/api`. Never commit `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Address the API (and Vite) bind. Loopback so only this machine, or Caddy on it, can connect |
| `PORT` | `3002` | API port |
| `DATABASE_URL` | `file:./data/records.db` | libsql/Turso-compatible SQLite URL for this app only |
| `UPLOAD_DIR` | `./data/uploads` | Directory for stored images |
| `WEB_ORIGIN` | `http://localhost:5174` | Fallback browser origin if `ALLOWED_ORIGINS` is unset |
| `ALLOWED_ORIGINS` | `WEB_ORIGIN` | Comma-separated browser origins allowed to call the API (CORS). Use your `https://` domain in production |
| `ADMIN_USERNAME` | `admin` | Single admin username. Production refuses this documented default and an empty value |
| `ADMIN_PASSWORD` | `change-me` | Single admin password. Production refuses this documented default, an empty value, and anything shorter than 12 characters |
| `SESSION_SECRET` | random at startup if unset | HMAC key for the admin session cookie |
| `NODE_ENV` | unset | Set to `production` on the VPS. That enables the credential check, `Secure` cookies, and trusted proxy headers |

With the defaults, the database file is `apps/api/data/records.db` and images are `apps/api/data/uploads`. Both directories are created on startup and are gitignored.

The username and password are hashed in memory with scrypt when the API starts and compared in constant time. They are not written to the database. A successful login sets an httpOnly `SameSite=Lax` session cookie that expires after eight hours. In production the cookie is also `Secure`. Five failed attempts in fifteen minutes lock login until the window passes. Log out clears the cookie. Every artist and entry route requires that session.

## HTTP API

- `POST /api/admin/login` — JSON `{ "username", "password" }`. Sets the session cookie.
- `POST /api/admin/logout` — clears the session cookie.
- `GET /api/admin/session` — `200` when the session is valid.
- `GET /api/artists` — admin only. ID and name, oldest first.
- `POST /api/artists` — admin only. JSON `{ "name" }`. The response includes the assigned ID (`A0001`, `A0002`, …).
- `GET /api/artists/:artistId` — admin only. The artist plus that artist's entries.
- `POST /api/artists/:artistId/entries` — admin only. Multipart fields `firstName`, `lastName`, `address`, and `image`.
- `GET /api/entries/:entryId` — admin only.
- `GET /api/entries/:entryId/image` — admin only.
- `GET /api/health` — `{ "ok": true }`.

Artist IDs come from a counter stored in this database. The counter only moves forward, the ID column is the primary key, and removing a row does not make that ID available again.

Images must be JPEG, PNG, or WebP, at most 5 MB. The server checks the file bytes, not only the browser-supplied type.

## Run on a VPS (Ubuntu)

This is the records-admin app only. DuckDNS, `ufw`, and the shared Caddyfile with `basic_auth` live in the intake-form README under **Run on a VPS (Ubuntu)**. Put this site block in that same Caddyfile, using your records hostname:

```caddy
records.example.duckdns.org {
	basic_auth {
		admin hashed-password-from-caddy-hash-password
	}
	reverse_proxy 127.0.0.1:3002
}
```

Do the rest of these steps on the VPS, one command at a time. From Windows Command Prompt, open an SSH session first:

```cmd
ssh youruser@your-server-ip
```

Install Node.js 22 LTS:

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y ca-certificates curl gnupg
```

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```

```bash
sudo apt-get install -y nodejs
```

Enable pnpm with corepack:

```bash
sudo corepack enable
```

```bash
corepack prepare pnpm@10.33.4 --activate
```

Clone this repository (use your fork URL if that is what you deploy):

```bash
git clone https://github.com/ishushrestha/records-admin.git
```

```bash
cd records-admin
```

Install dependencies:

```bash
pnpm install
```

Copy the example env file. Do not commit `.env`. Secrets in git can be cloned by anyone with the repo.

```bash
cp .env.example .env
```

Generate a password and a session secret:

```bash
openssl rand -base64 24
```

```bash
openssl rand -base64 24
```

Edit `.env`. Set `NODE_ENV=production`, `HOST=127.0.0.1`, `ADMIN_USERNAME` to a name that is not `admin`, `ADMIN_PASSWORD` to the first generated value, `SESSION_SECRET` to the second, and `ALLOWED_ORIGINS` to your https domain:

```bash
nano .env
```

```ini
HOST=127.0.0.1
PORT=3002
NODE_ENV=production
ALLOWED_ORIGINS=https://records.example.duckdns.org
ADMIN_USERNAME=your-admin-name
ADMIN_PASSWORD=
SESSION_SECRET=
```

Paste the openssl values. Save and exit (`Ctrl+O`, Enter, `Ctrl+X` in nano).

Build the web app and the API:

```bash
pnpm build
```

Create a systemd service so the process restarts after a reboot. Replace `youruser` with your Ubuntu login:

```bash
which pnpm
```

```bash
pwd
```

```bash
sudo nano /etc/systemd/system/records-admin.service
```

```ini
[Unit]
Description=records-admin
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/records-admin
Environment=NODE_ENV=production
EnvironmentFile=/home/youruser/records-admin/.env
ExecStart=/usr/bin/pnpm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

If `which pnpm` printed a different path, put that path in `ExecStart`. If `pwd` was not `/home/youruser/records-admin`, use the path it printed.

Reload systemd and start the service:

```bash
sudo systemctl daemon-reload
```

```bash
sudo systemctl enable --now records-admin
```

```bash
sudo systemctl status records-admin
```

The process should listen on `127.0.0.1:3002` only. Caddy in front of it terminates HTTPS. Open `https://records.example.duckdns.org`, pass Caddy `basic_auth`, then sign in with the username and password from `.env`.

## Version history

- 0.4.0 — Bind to HOST (default 127.0.0.1), refuse default production credentials, Secure cookies and CORS origins behind Caddy, and serve the web UI from `pnpm start`.
- 0.3.0 — Remove the LLM worker API, WORKER_TOKEN, and the entry-request review UI.
- 0.2.0 — Worker entry requests: bearer-token intake, then an admin verifies or rejects each one.
- 0.1.3 — Remove the redundant header Artists button. Artist tables no longer rebuild their row arrays on every render, which was freezing the page.
- 0.1.2 — Back to artist is the same outline button on the entry page, including when the entry is missing. The header Artists control is a button too.
- 0.1.1 — Back to artists is a button on the artist page, its error state, and create entry. It returns to the list in the app.
- 0.1.0 — Initial records admin: artist IDs, entries, and login.
