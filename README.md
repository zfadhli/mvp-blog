# mvp-blog

MVP blog API — Hono + peta-hono + peta-auth + ArkType + Drizzle ORM, on Node.js via [Nub](https://nubjs.com).

## Stack

| Tool | Role |
|---|---|
| [Nub](https://nubjs.com) | TypeScript runtime, package manager, script runner (on stock Node) |
| [Hono](https://hono.dev) | HTTP framework |
| [peta-hono](https://github.com/zfadhli/peta-hono) | Function-based API DSL on Hono + ArkType |
| [peta-auth](https://github.com/zfadhli/peta-stack) | Encrypted cookie sessions for Hono |
| [ArkType](https://arktype.io) | Runtime validation (schemas double as OpenAPI types) |
| [Drizzle ORM](https://orm.drizzle.team) | TypeScript ORM for libsql/SQLite |
| [ulid](https://github.com/ulid/javascript) | Lexicographically sortable IDs |
| [Biome](https://biomejs.dev) | Linter + formatter |
| [Lefthook](https://lefthook.dev) | Git hooks |

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | Login or auto-create user by `{ email }` |
| POST | `/auth/logout` | required | Destroy session |
| GET | `/posts` | — | List posts (optional `?authorId` filter) |
| POST | `/posts` | required | Create post `{ title, content }` |
| GET | `/posts/:id` | — | Get post by ID |
| PUT | `/posts/:id` | required | Update post (owner only) |
| DELETE | `/posts/:id` | required | Delete post (owner only) |
| GET | `/posts/:id/comments` | — | List comments for a post |
| POST | `/posts/:id/comments` | required | Create comment `{ content }` |

OpenAPI spec at `/openapi.json`, Scalar API reference UI at `/docs`.

## Scripts

| Command | Description |
|---|---|
| `nub run dev` | Watch mode dev server |
| `nub run build` | Build with tsdown |
| `nub run typecheck` | Type-check with tsc |
| `nub run test` | Run tests (node:test) |
| `nub run lint` | Check lint + formatting |
| `nub run lint:fix` | Auto-fix lint + formatting |
| `nub run db:generate` | Generate Drizzle migration SQL |
| `nub run db:push` | Push schema directly to DB |

## Local dev

```bash
nub install
nubx drizzle-kit generate   # generate migration SQL (already committed)
nub run dev                 # start dev server on :3000
```

Open `http://localhost:3000/docs` for the API reference.

## Project structure

```
src/
  db/
    schema.ts       — drizzle table defs (users, posts, comments) + types
    index.ts        — libsql client + drizzle instance + migrate() at startup
  routes/
    auth.ts         — login/logout (raw Hono, needs session.save/destroy)
    posts.ts        — post CRUD via api()
    comments.ts     — comment routes via api()
  setup.ts          — createApi<Auth>, session middleware, auth() bridge
  index.ts          — bootstrap: import routes, docs(), serve()
test/
  api.test.ts       — e2e tests (node:test + node:assert)
drizzle/            — generated migration SQL
drizzle.config.ts   — drizzle-kit config
```

## Git hooks

Lefthook runs on commit and push:

- **pre-commit**: Biome lint + type-check on staged files
- **pre-push**: Run tests + build

Skip hooks: `LEFTHOOK=0 git commit -m "wip"`
