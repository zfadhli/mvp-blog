# AGENTS.md

## Project Overview

mvp-blog is an MVP blog API — a function-based REST API on Hono + peta-hono + peta-auth + ArkType + Drizzle ORM, running on Node.js via Nub.

**Repo:** `git@github.com:zfadhli/mvp-blog.git`  
**Branch:** `main`  
**Runtime:** Node.js ≥ 22.15 (pinned to 26.4.0 via `.node-version`)

### Stack

| Layer | Technology | Role |
|---|---|---|
| Runtime | [Nub](https://nubjs.com) | TS runner, pnpm-compatible package manager, watch mode. Replaces `node`/`npm`/`npx`/`nvm`. |
| HTTP | [Hono 4](https://hono.dev) + `@hono/node-server` | Ultralight HTTP framework |
| API DSL | [peta-hono 0.3.0](https://github.com/zfadhli/peta-hono) | Function-based `createApi<Auth>()` → `{ api, auth, docs, app }`. ArkType schemas auto-generate OpenAPI 3.0. |
| Auth | [peta-auth/hono](https://github.com/zfadhli/peta-stack) | Encrypted stateless cookie sessions (AES-256-CBC + HMAC-SHA256). `session()` middleware globally, bridge to peta-hono `auth('required')`. |
| Validation | [ArkType 2](https://arktype.io) | Runtime validation + JSON Schema generation. Inline schemas in route configs. |
| ORM | [Drizzle ORM](https://orm.drizzle.team) 0.45 + `@libsql/client` 0.17 | Type-safe SQLite. Migrations via `drizzle-kit generate`. |
| IDs | [ulid 3](https://github.com/ulid/javascript) | Lexicographically sortable 26-char base32. `.$defaultFn(ulid)` in schema. |
| Build | [tsdown](https://github.com/sxzz/tsdown) 0.22 | Rolldown-based bundler. ESM output to `dist/index.mjs`. |
| Lint/Format | [Biome](https://biomejs.dev) | Linter + formatter. `biome check .` for CI, `--write --unsafe` for auto-fix. |
| Git Hooks | [Lefthook](https://lefthook.dev) | pre-commit: lint + typecheck. pre-push: test + build. |
| Tests | `node:test` + `node:assert` | Zero-dep stdlib test runner. Run via `nub --test`. |
| CI | GitHub Actions (`nubjs/setup-nub@v0`) | typecheck → lint → test → build on push/PR to `main`. |

### Folder structure

```
src/
  db/
    schema.ts       — Drizzle table defs (users, posts, comments) + inferred types
    index.ts        — libsql client + drizzle instance + migrate() at import
  routes/
    auth.ts         — POST /auth/register, POST /auth/login, POST /auth/logout, GET /me
    posts.ts        — CRUD for posts (list, create, get, update, delete)
    comments.ts     — List/create comments on a post
    users.ts        — PATCH /users/:id/role (admin-only role management)
  lib/
    utils.ts        — Generic utilities (pick)
    logger.ts       — Pino logger singleton (pino-pretty in dev, JSON in prod)
  setup.ts          — createApi<Auth>(), session middleware, auth('required') bridge, error handler
  types.d.ts        — Hono ContextVariableMap augmentation (typed c.var.session)
  index.ts          — Bootstrap: import routes for side effects, docs(), serve()
test/
  api.test.ts       — 34 e2e tests via app.request()
drizzle/            — Generated migration SQL (committed)
.github/workflows/
  ci.yml            — CI pipeline
```

---

## Setup Commands

```bash
# Install everything (pnpm-compatible, uses lock.yaml)
nub install

# Generate Drizzle migration SQL (after schema changes)
nubx drizzle-kit generate

# Push schema directly to DB (dev shortcut, no migration files)
nubx drizzle-kit push

# Prune stale lockfile entries (after removing deps)
nub install
```

**No `.env` is needed for dev.** Defaults:
- `DATABASE_URL` → `:memory:` (in-memory SQLite)
- `SESSION_PASSWORD` → `"change-me-to-a-32-char-string!!!!"` (dev fallback)
- `PORT` → `3000`

---

## Development Workflow

```bash
# Start dev server with watch mode (auto-restart on changes)
nub run dev
# → http://localhost:3000
# → http://localhost:3000/docs (Scalar API reference)

# Run once
nub src/index.ts
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `:memory:` | libsql DB URL (`file:./data.db` for persistent file, or libsql remote URL) |
| `SESSION_PASSWORD` | `change-me-to-a-32-char-string!!!!` | >= 32 chars, used to encrypt session cookies |
| `PORT` | `3000` | HTTP server port |

### Key scripts (`nub run <script>`)

| Script | Command | What it does |
|---|---|---|
| `dev` | `nub watch src/index.ts` | Watch-mode dev server |
| `build` | `tsdown` | Bundle to `dist/index.mjs` |
| `typecheck` | `tsc --noEmit` | TypeScript type checking |
| `test` | `nub --test` | Run test suite (node:test) |
| `lint` | `biome check .` | Check lint + formatting |
| `lint:fix` | `biome check --write .` | Auto-fix lint + formatting |
| `format` | `biome format --write .` | Format only |
| `db:generate` | `nubx drizzle-kit generate` | Generate migration SQL from schema changes |
| `db:push` | `nubx drizzle-kit push` | Push schema directly to DB (dev only) |
| `seed` | `nub src/db/seed.ts` | Seed 4 users / 12 posts / 24 comments (use `--env-file .env` to seed persistent DB) |

---

## Testing Instructions

### Running tests

```bash
# Run all tests
nub run test

# Run a specific test file
nub --test test/api.test.ts

# Run tests matching a pattern (node:test built-in filter)
nub --test --test-name-pattern="posts"
```

### Test structure

- **File:** `test/api.test.ts` (single file, 34 test cases)
- **Framework:** `node:test` (stdlib — `describe`, `it`, `beforeEach`) + `node:assert/strict`
- **Pattern:** All tests run against the full app via `app.request()` (Hono's built-in test helper)
- **Database:** Shared in-memory SQLite per process. `beforeEach` truncates all tables via `db.delete()`.
- **No mocking** — all tests are e2e against the real stack.

### Auth helper patterns

```ts
// Login — returns the Set-Cookie header for subsequent requests
async function login(email = "alice@test.com") {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  assert.strictEqual(res.status, 200);
  const cookie = res.headers.get("set-cookie");
  assert.ok(cookie);
  const user = await res.json();
  return { cookie: cookie as string, user };
}

// Authenticated request — injects Cookie header
function authed(path: string, init: RequestInit & { cookie: string }) {
  const { cookie, ...rest } = init;
  return app.request(path, {
    ...rest,
    headers: { ...rest.headers, Cookie: cookie },
  });
}
```

### Writing new tests

1. Import route files for side effects (registers routes on the shared `app`):
   ```ts
   import "../src/routes/auth.js";
   import { app, docs } from "../src/setup.js";
   docs();  // Mount OpenAPI spec
   ```
2. Use `node:test` describe/it/beforeEach.
3. Call `resetDb` in `beforeEach` if you write to the database.
4. Assert via `assert.strictEqual` / `assert.ok` from `node:assert/strict`.

---

## Code Style

### General

- **Function-based Composition API** — no classes, no decorators, no DI. Handlers are plain async functions receiving a flat `{ body, query, params, auth, c }` object.
- **Immutability** — create new objects, never mutate parameters.
- **Few small files** (200–400 lines typical, 800 max) — one concern per file.
- **Descriptive names, no abbreviations** — `user` not `usr`, `comment` not `c`.
- **Minimal API surface** — expose only what's needed. No speculative abstractions.
- `// ponytail:` comments mark deliberate shortcuts with an identified ceiling and upgrade path.

### TypeScript

- Strict mode enabled (`tsconfig.json` — `strict: true`).
- `verbatimModuleSyntax` — always use `import type { X }` for type-only imports.
- No `isolatedDeclarations` (this is an app, not a library).
- `@types/node` for Node types.
- Prefer explicit `: Type` annotations on exported boundaries when the inferred type isn't trivially readable. Let inference work for locals.
- Use `as unknown as Target` as a last resort — prefer proper module augmentation (see `src/types.d.ts` for the pattern).

### Linting & Formatting

- **Formatter:** Biome (2-space indent, 100-char width, `space` indent style).
- **Linter:** Biome `recommended` preset.
- VCS integration: Biome reads `.gitignore` and respects git-staged files in lefthook.
- **Auto-fix on commit:** Lefthook runs `biome check --staged --write --unsafe` — unsafe fixes (e.g., `useTemplate`, `noNonNullAssertion`, `noUnusedImports`) are applied automatically. Review them if they surprise you.
- Always run `biome check .` before pushing (pre-push hook does this).

### File organization patterns

```
src/
  db/           — Database layer (schema + client)
  routes/       — Route handlers, grouped by resource
  setup.ts      — Shared singleton (createApi, session, auth bridge)
  types.d.ts    — Global module augmentations
  index.ts      — Entry point (imports routes for side effects, starts server)
```

### Import patterns

- Use `.js` extension in imports (`import { x } from "../db/index.js"`). Nub's TS runtime resolves `.js` → `.ts`.
- `import type { Type }` for type-only imports (`verbatimModuleSyntax`).
- Route files import `{ api }` from `../setup` — they never import `app` directly.
- Database helpers import `{ db, tableName }` from `../db` — query builders are co-located in routes.

### API endpoint pattern

Every endpoint follows this structure:

```ts
import { type } from "arktype";
import { eq } from "drizzle-orm";
import { fail } from "peta-hono";
import { db, tableName } from "../db";
import { api } from "../setup";

// 1. ArkType schemas (validation + OpenAPI types)
const RequestBody = type({ field: "string >= 1" });
const ResponseType = type({ id: "string", field: "string" });

// 2. api() call — config then handler
api(
  {
    method: "POST",             // GET | POST | PUT | PATCH | DELETE
    path: "/resource",          // supports :param syntax
    body: RequestBody,          // ArkType schema (body, query, headers supported)
    responses: { 201: ResponseType },
    auth: "required",           // omit for public endpoints
    tags: ["resource"],
    summary: "Short description",
    status: 201,                // explicit success status; 204 → return null
  },
  // Handler receives flat { body, query, auth, c } + path params as top-level keys
  async ({ body, auth: { user }, c }) => {
    const [record] = await db.insert(tableName).values({ ... }).returning();
    return record;
  },
);
```

---

## API Design

### Endpoints

| Method | Path | Auth | Handler shape |
|---|---|---|---|
| POST | `/auth/register` | — | `async ({ body: { name, email, password }, c })` — creates user, sets session cookie (201) |
| POST | `/auth/login` | — | `async ({ body: { email, password }, c })` — verifies credentials, sets session cookie |
| POST | `/auth/logout` | required | `async ({ c })` — destroys session, returns null (204) |
| GET | `/me` | required | `async ({ auth })` — returns current user |
| GET | `/posts` | — | `async ({ query: { authorId? } })` — returns array |
| POST | `/posts` | required (author+) | `async ({ body: { title, content }, auth })` — reader blocked, returns created (201) |
| GET | `/posts/:id` | — | `async ({ id })` — returns single post or 404 |
| PUT | `/posts/:id` | required (owner/admin) | `async ({ id, body, auth })` — owner or admin, returns updated |
| DELETE | `/posts/:id` | required (owner/admin) | `async ({ id, auth })` — owner or admin, returns null (204) |
| GET | `/posts/:id/comments` | — | `async ({ id })` — returns array |
| POST | `/posts/:id/comments` | required | `async ({ id, body, auth })` — returns created (201) |
| PATCH | `/users/:id/role` | required (admin) | `async ({ id, body: { role }, auth })` — admin-only, returns updated user |

### Auth flow

1. `POST /auth/register` with `{ name, email, password }` → server creates user (argon2id hash via `peta-auth`'s `hashPassword`), stores `userId` in encrypted cookie via `c.var.session.save()`. Response includes `Set-Cookie` header.
2. `POST /auth/login` with `{ email, password }` → server looks up user by email, verifies hash with `verifyPassword`, stores `userId` in session. Same `401` for unknown email and wrong password (prevents enumeration).
3. All subsequent requests include the `Cookie` header → `session()` middleware decrypts and hydrates `c.var.session`.
4. Routes with `auth: "required"` trigger the auth bridge: `c.var.session.userId` → Drizzle user lookup → `req.auth.user` (typed).
5. `POST /auth/logout` (auth-required) calls `c.var.session.destroy()` → response sets expired cookie. Client must stop sending the old cookie.

### RBAC (role-based access control)

Three roles stored as a `role` text column on `users` (default `'reader'`):

| Role | Can read | Can comment | Can create posts | Can edit/delete posts |
|---|---|---|---|---|
| `reader` | ✓ | ✓ | ✗ (403) | ✗ |
| `author` | ✓ | ✓ | ✓ | own only |
| `admin` | ✓ | ✓ | ✓ | any (bypasses ownership) |

- **First registered user is `admin`**; everyone else is `reader` by default.
- **Promotion:** `PATCH /users/:id/role` (admin-only) sets any user's role to `admin`, `author`, or `reader`.
- **Enforcement is inline** in route handlers — `auth.user.role` checked directly, no middleware abstraction (one line per guard, used 1-2 times).

### Auth bridge implementation

In `src/setup.ts`:

```ts
// Global session middleware (runs on every request)
app.use("*", session<{ userId?: string }>({ password: SESSION_PASSWORD, cookieName: "blog-session" }));

// Auth middleware (runs per-route via { auth: "required" })
auth("required", async (c) => {
  const userId = c.var.session?.userId;
  if (!userId) throw fail.unauthorized();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw fail.unauthorized();
  return { user };  // → becomes req.auth in handlers
});

// Auth routes use api() with req.c to access session
api(..., async ({ c }) => { c.var.session.save(); });
api(..., async ({ c }) => { c.var.session.destroy(); return null; });
```

### Error handling

- Throw `fail.notFound("post")` → `{ error: "post" }` with status 404.
- Throw `fail.unauthorized()` / `fail.forbidden()` / `fail.badRequest()` / `fail.conflict()` / `fail.unprocessableEntity()`.
- Throw `fail.tooManyRequests()` / `fail.internalServerError()`.
- For custom statuses: `throw new APIError(418, "I'm a teapot")` (imported from `peta-hono`).
- ArkType validation errors automatically return `{ error: "..." }` 400 — no manual try/catch needed.

---

## Database

### Schema

- Drizzle ORM + `@libsql/client` (SQLite-compatible).
- Tables: `users`, `posts`, `comments` — defined in `src/db/schema.ts`.
- All primary keys use `ulid()` (lexicographically sortable, URL-safe).
- Foreign keys with `onDelete: "cascade"`.
- `createdAt` stored as ISO 8601 text (easy to read; upgrade to integer epoch if sort perf matters).
- Schema changes: `nubx drizzle-kit generate` → commit the generated SQL → `migrate()` runs it at import.

### Client

```ts
// src/db/index.ts
const client = createClient({ url: DATABASE_URL });        // DATABASE_URL or :memory:
export const db = drizzle(client, { schema: { users, posts, comments } });
await migrate(db, { migrationsFolder: "./drizzle" });     // top-level await, runs at import
```

- `db` is a singleton — imported directly by routes and setup.
- `:memory:` is per-process. In tests, each `nub --test` process gets a fresh DB.
- `DATABASE_URL` env var switches to persistent file or remote libsql.

### Migrations

- **Generate:** `nubx drizzle-kit generate` → creates `.sql` in `drizzle/` + updates meta JSON.
- **Run:** `migrate(db, { migrationsFolder: './drizzle' })` at module import (line 15 of `src/db/index.ts`).
- **Dev push:** `nubx drizzle-kit push` — pushes schema directly without migration files (use for prototyping only).
- Migrations are **committed to the repo** — CI runs `migrate()` at test startup.
- Config: `drizzle.config.ts` (dialect: `turso`, schema: `./src/db/schema.ts`, out: `./drizzle`).

---

## Build and Deployment

### Build

```bash
nub run build
# → tsdown bundles src/index.ts → dist/index.mjs (7 kB, ESM, Node 22 target)
```

`dist/` is gitignored. The entry `src/index.ts` is run directly by nub in dev — no build step needed for local dev.

### CI

`.github/workflows/ci.yml` runs on push/PR to `main`:

```yaml
- uses: actions/checkout@v4
- uses: nubjs/setup-nub@v0     # Installs nub + provisions pinned Node
- run: nub install
- run: nub run typecheck
- run: nub run lint
- run: nub run test            # Migrations run via top-level await at import
- run: nub run build
```

### Deployment notes

- No `Dockerfile` or `Docker` deployment config exists yet.
- No publish workflow (user opted out).
- For production, set `DATABASE_URL`, `SESSION_PASSWORD`, and `PORT` environment variables.
- The app entry is `src/index.ts` (run via `nub src/index.ts`). For a containerized deployment, build with `tsdown` and run `node dist/index.mjs`.

---

## Adding a new resource (e.g., "categories")

1. **Schema:** Add a table to `src/db/schema.ts` — use `text("id").primaryKey().$defaultFn(ulid)`, follow the existing pattern.
2. **Migration:** `nubx drizzle-kit generate` → commit the generated SQL.
3. **Routes:** Create `src/routes/categories.ts` — import `{ api }` from `../setup`, `{ db, tableName }` from `../db`, define ArkType schemas, register `api()` calls.
4. **Register:** Import `"./routes/categories.js"` in `src/index.ts` (before `docs()`).
5. **Test:** Add cases to `test/api.test.ts` or create a new test file.
6. **Verify:** `nub run typecheck && nub run lint && nub run test`.

---

## Git and Pull Requests

### Commit conventions

- Format: `<type>: <short description>`
- Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `upgrade`
- Examples: `feat: add categories resource`, `fix: owner check on post update`, `chore: enable Biome organizeImports assist`, `upgrade peta-hono to 0.2.1`

### Git hooks (automatic)

- **pre-commit** (parallel): `biome check --staged --write --unsafe` + `tsc --noEmit`. Auto-fixes are applied and re-staged.
- **pre-push**: `nub run test` + `nub run build`. Push is blocked if tests fail or build breaks.

### Before committing

- [ ] `nub run typecheck` — no TypeScript errors
- [ ] `nub run lint` — no warnings (safe fixes auto-applied by hook)
- [ ] `nub run test` — all tests pass
- [ ] No `console.log` statements in non-test code (use `// ponytail:` if needed)
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] Review `git diff` for unintended changes

### PR guidelines

- Title format: `[<scope>] <short description>`
- Ensure CI passes (GitHub Actions runs on PR to `main`).
- Keep PRs focused on a single concern.

---

## Security Considerations

- **Session secret:** The dev fallback `"change-me-to-a-32-char-string!!!!"` in `src/setup.ts` must be overridden via `SESSION_PASSWORD` env var in production.
- **Session security:** Cookies are encrypted (AES-256-CBC + HMAC-SHA256 via `iron-webcrypto`). No server-side session store. `destroy()` sets an expired cookie — the client must stop sending the old cookie (browsers do this automatically).
- **Stateless sessions:** There is no server-side session invalidation. Changing `SESSION_PASSWORD` invalidates all existing sessions (password rotation is supported via `{ 1: "old", 2: "new" }`).
- **Input validation:** All request bodies and query parameters are validated by ArkType schemas before reaching handlers. Malformed input returns 400 automatically.
- **Owner checks:** Mutations on posts (update/delete) check `post.authorId === auth.user.id` — enforced in route handlers. Missing or unowned resources return 404 (resource not found) or 403 (forbidden).
- **Auth-required endpoints:** `/auth/logout`, `POST/PUT/DELETE /posts`, `POST /posts/:id/comments` — unauthenticated requests return 401.
- **No auth on GET endpoints:** Public read access for `/posts`, `/posts/:id`, `/posts/:id/comments`.

---

## Deliberate Simplifications (ponytail debt)

These are marked with `// ponytail:` in source and represent intentional shortcuts:

| Location | Shortcut | Ceiling / Upgrade path |
|---|---|---|
| `src/setup.ts` | Dev fallback session password hardcoded | Load from env / secrets manager in prod |
| `src/db/index.ts` | Top-level await for migration at import | Wrap in `init()` guard for long-lived workers |
| `src/db/schema.ts` | `createdAt` as ISO string text | Change to integer epoch if sort perf matters |
| `test/api.test.ts` | `:memory:` shared across all tests in one process | Per-test DB spin-up or transaction rollback |

---

## Common gotchas

- **Lockfile stale after dep version bump:** `nub install` regenerates `lock.yaml`. Commit the updated lockfile.
- **Route import order matters** in `src/index.ts` — Hono matches routes in registration order. List most-specific routes before less-specific ones (not an issue currently, but watch for `/posts/latest` vs `/posts/:id`).
- **`nub --test` and TypeScript:** The `nub --test` flag passes `--test` through to Node's test runner while nub handles TS transpilation. Test files in `test/*.test.ts` are auto-discovered.
- **Biome `--unsafe` fixes:** The pre-commit hook applies unsafe fixes automatically (e.g., removing unused imports, converting string concatenation to template literals). Always review `git diff` after a commit to catch unintended changes.
- **`as unknown as Target` casts:** The codebase previously had these for session access. They were removed in the peta-hono 0.2.1 upgrade. If you encounter new ones, prefer Hono's `ContextVariableMap` module augmentation (see `src/types.d.ts`).
