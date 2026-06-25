<div align="center">

# mvp-blog

**Blog API** — Hono + peta-hono + peta-auth + ArkType + Drizzle ORM

[![CI Status](https://github.com/zfadhli/mvp-blog/actions/workflows/ci.yml/badge.svg)](https://github.com/zfadhli/mvp-blog/actions/workflows/ci.yml)
[![Node version](https://img.shields.io/badge/Node.js-22.15%2B-3c873a?style=flat-square)](.node-version)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

[Quick start](#quick-start) • [API](#api) • [Scripts](#scripts) • [Project structure](#project-structure) • [Auth flow](#auth-flow) • [Environment variables](#environment-variables)

</div>

A REST API for a blog with posts and comments, built as an MVP. Uses encrypted cookie sessions for authentication, ArkType for runtime validation (auto-generated OpenAPI docs), Drizzle ORM on libsql/SQLite, and the [Nub](https://nubjs.com) toolkit for TypeScript development.

> [!NOTE]
> This project is built with function-based Composition API design — no classes, no decorators, no DI containers. Every route handler is a plain async function.

## Features

- **Encrypted cookie auth** — Stateless sessions via peta-auth (AES-256-CBC + HMAC-SHA256). No server-side session store.
- **Type-safe routes** — Request body, query, and path params validated at runtime by ArkType. Schemas double as OpenAPI types.
- **Auto-generated OpenAPI spec** — Browse the live API reference at `/docs` (powered by Scalar).
- **SQLite persistence** — Drizzle ORM on libsql. Migrations committed to the repo, run automatically at startup.
- **Owner-enforced mutations** — Update and delete operations check the authenticated user owns the resource.
- **ULID primary keys** — Lexicographically sortable, URL-safe, no sequential ID enumeration.

## Quick start

```bash
# Install dependencies (pnpm-compatible via Nub)
nub install

# Start development server with watch mode
nub run dev
```

Open [http://localhost:3000/docs](http://localhost:3000/docs) for the interactive API reference.

> [!TIP]
> No `.env` file is needed for development. The default `DATABASE_URL` is `:memory:`, so data is reset on every restart. Set `DATABASE_URL` to a file path (e.g. `file:./data.db`) for persistent storage.

## API

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/login` | — | Login or auto-create user by email |
| `POST` | `/auth/logout` | Required | Destroy session |
| `GET` | `/posts` | — | List posts, optional `?authorId` filter |
| `POST` | `/posts` | Required | Create a new post |
| `GET` | `/posts/:id` | — | Get a post by ID |
| `PUT` | `/posts/:id` | Required | Update a post (owner only) |
| `DELETE` | `/posts/:id` | Required | Delete a post (owner only) |
| `GET` | `/posts/:id/comments` | — | List comments for a post |
| `POST` | `/posts/:id/comments` | Required | Create a comment on a post |

### Request & response examples

**Login or sign up:**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@test.com"}'
```

```json
// 200 OK
{ "id": "01J...", "email": "alice@test.com", "name": "alice", "createdAt": "2026-06-25T..." }
```

The `Set-Cookie` header on success is required for subsequent authenticated requests.

**Create a post (authenticated):**

```bash
curl -X POST http://localhost:3000/posts \
  -H "Content-Type: application/json" \
  -H "Cookie: blog-session=<session-token>" \
  -d '{"title": "Hello World", "content": "My first post"}'
```

```json
// 201 Created
{ "id": "01J...", "title": "Hello World", "content": "My first post", "authorId": "01J...", "createdAt": "2026-06-25T..." }
```

**List posts with author filter:**

```bash
curl "http://localhost:3000/posts?authorId=01J..."
```

```json
// 200 OK
[{ "id": "01J...", "title": "Hello World", "content": "...", "authorId": "01J...", "createdAt": "..." }]
```

### OpenAPI spec

The API serves a full OpenAPI 3.0 specification at `/openapi.json`. An interactive documentation UI is available at `/docs` via the [Scalar API Reference](https://scalar.com).

## Project structure

```
src/
  db/
    schema.ts       — Drizzle table definitions (users, posts, comments) + inferred types
    index.ts        — libsql client, drizzle instance, migration runner
  routes/
    auth.ts         — POST /auth/login, POST /auth/logout
    posts.ts        — Full CRUD for posts
    comments.ts     — List and create comments
  setup.ts          — createApi<Auth> singleton, session middleware, auth bridge
  types.d.ts        — Hono ContextVariableMap augmentation for typed c.var.session
  index.ts          — Entry point: imports routes (side effects), docs(), serve()
test/
  api.test.ts       — 20 end-to-end tests using node:test + node:assert
drizzle/            — Generated migration SQL files (committed)
```

## Scripts

All commands run via [Nub](https://nubjs.com), the project's TypeScript toolkit and package manager.

| Command | Description |
|---------|-------------|
| `nub run dev` | Start dev server with watch mode (`nub watch src/index.ts`) |
| `nub run build` | Bundle with tsdown → `dist/index.mjs` |
| `nub run typecheck` | Type-check with `tsc --noEmit` |
| `nub run test` | Run test suite using `node:test` |
| `nub run lint` | Check lint and formatting with Biome |
| `nub run lint:fix` | Auto-fix lint and formatting issues |
| `nub run format` | Format code with Biome |
| `nubx drizzle-kit generate` | Generate migration SQL from schema changes |
| `nubx drizzle-kit push` | Push schema directly to database (dev shortcut) |

## Auth flow

The project uses a two-layer authentication system:

1. **Session middleware** (runs on every request) — [peta-auth](https://github.com/zfadhli/peta-stack) reads the encrypted `blog-session` cookie and hydrates `c.var.session`. Stateless: no server-side storage, the cookie itself holds the encrypted data.

2. **Auth bridge** (runs per-route, opt-in) — Routes with `auth: "required"` trigger a middleware that reads `c.var.session.userId`, looks up the user in the database via Drizzle, and injects `{ user }` into the handler as `req.auth`.

```ts
// src/setup.ts — the auth bridge
auth("required", async (c) => {
  const userId = c.var.session?.userId;
  if (!userId) throw fail.unauthorized();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw fail.unauthorized();
  return { user };   // becomes req.auth in handlers
});
```

> [!NOTE]
> Because sessions are stateless, calling `POST /auth/logout` sets an expired cookie in the response — the client must stop sending the old cookie. Browser clients handle this automatically.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `:memory:` | libsql database URL (`file:./data.db` for file-based SQLite, or remote libsql URL) |
| `SESSION_PASSWORD` | `change-me-to-32-char-string!!!!` | Encryption key for session cookies (minimum 32 characters) |
| `PORT` | `3000` | HTTP server port |

> [!WARNING]
> The default `SESSION_PASSWORD` is a known string and must be overridden in production. Use a randomly generated value of at least 32 characters.

### Production deployment

For production, set these environment variables — no `.env` file is needed, the app reads from `process.env` directly:

| Variable | Required | Example |
|----------|----------|---------|
| `SESSION_PASSWORD` | Yes | `openssl rand -base64 32` output (minimum 32 characters) |
| `DATABASE_URL` | Yes | `file:./data.db` for persistent SQLite, or a remote libsql URL |
| `PORT` | No | `8080` (defaults to `3000`) |

```bash
# Example: run with persistent storage
DATABASE_URL=file:./data.db SESSION_PASSWORD="$(openssl rand -base64 32)" nub src/index.ts
```

Migrations run automatically at startup — no separate migration step in production.

## Development

### Writing a new endpoint

Every endpoint follows this pattern:

```ts
import { type } from "arktype";
import { eq } from "drizzle-orm";
import { fail } from "peta-hono";
import { db, tableName } from "../db";
import { api } from "../setup";

// 1. ArkType schema for the request body
const RequestBody = type({ title: "string >= 1", content: "string >= 1" });

// 2. api() call — config first, handler second
api(
  {
    method: "POST",
    path: "/posts",
    body: RequestBody,
    auth: "required",
    tags: ["posts"],
    summary: "Create a post",
    status: 201,
  },
  async ({ body, auth: { user } }) => {
    const [record] = await db.insert(tableName).values({ ... }).returning();
    return record;
  },
);
```

Path params (`:id`) appear as top-level keys in the handler. The Hono Context is available as `c` (destructured from the handler params: `async ({ c })`) for session operations like `c.var.session.save()`.

### Adding a new table

1. Add the table definition in `src/db/schema.ts`
2. Generate the migration: `nubx drizzle-kit generate`
3. Commit the generated SQL files in `drizzle/`
4. Create a route file in `src/routes/`
5. Import the new route file in `src/index.ts`
6. Run `nub run test` to verify

## Testing

Tests use the built-in `node:test` runner with `node:assert/strict`. All tests are end-to-end, running against a real Hono app instance with an in-memory SQLite database.

```bash
# Run all tests
nub run test

# Run a specific test by name pattern
nub --test --test-name-pattern="posts"
```

The shared helper pattern for authenticated requests:

```ts
// Login → capture Set-Cookie
const { cookie } = await login("alice@test.com");

// Use the cookie in subsequent requests
const res = await app.request("/posts", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ title: "Hello", content: "World" }),
});
```

## Git hooks

[Lefthook](https://lefthook.dev) enforces quality gates:

- **pre-commit**: Biome lint + TypeScript type-check on staged files (parallel). Lint auto-fixes are applied and re-staged.
- **pre-push**: Full test suite + build verification.

Skip hooks with `LEFTHOOK=0 git commit -m "wip"`.
