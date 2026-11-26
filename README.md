# Records admin

Version 0.3.0

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

Other root scripts:

```cmd
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check-version
```

## Environment

Copy `.env.example` to `.env` at the repo root. The API reads that file when it starts from `apps/api`, and falls back to the repo root. Relative paths are resolved from `apps/api`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3002` | API port |
| `DATABASE_URL` | `file:./data/records.db` | libsql/Turso-compatible SQLite URL for this app only |
| `UPLOAD_DIR` | `./data/uploads` | Directory for stored images |
| `WEB_ORIGIN` | `http://localhost:5174` | Browser origin allowed to call the API directly |
| `ADMIN_USERNAME` | `admin` | Single admin username |
| `ADMIN_PASSWORD` | `change-me` | Single admin password |
| `SESSION_SECRET` | random at startup if unset | HMAC key for the admin session cookie |

With the defaults, the database file is `apps/api/data/records.db` and images are `apps/api/data/uploads`. Both directories are created on startup and are gitignored.

The username and password are hashed in memory with scrypt when the API starts and compared in constant time. They are not written to the database. A successful login sets an httpOnly session cookie that expires after eight hours. Five failed attempts in fifteen minutes lock login until the window passes. Log out clears the cookie. Every artist and entry route requires that session.

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

## Version history

- 0.3.0 — Remove the LLM worker API, WORKER_TOKEN, and the entry-request review UI.
- 0.2.0 — Worker entry requests: bearer-token intake, then an admin verifies or rejects each one.
- 0.1.3 — Remove the redundant header Artists button. Artist tables no longer rebuild their row arrays on every render, which was freezing the page.
- 0.1.2 — Back to artist is the same outline button on the entry page, including when the entry is missing. The header Artists control is a button too.
- 0.1.1 — Back to artists is a button on the artist page, its error state, and create entry. It returns to the list in the app.
- 0.1.0 — Initial records admin: artist IDs, entries, and login.
