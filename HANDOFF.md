# Handoff

## Goal

Add RBAC (admin/author/reader roles), pino logger, seed data, env/prod config, peta-hono upgrade, audit cleanups, and regression tests.

## Session Info

- **Branch:** `main`
- **Project:** mvp-blog
- **Saved:** 2026-06-29 19:53

## Changes

Working tree clean — all work committed. 10 commits ahead of origin/main.

```
e58ee07 add RBAC with admin/author/reader roles and promotion endpoint
6c56b6c chore: remove redundant and() casts dead exports from audit (findings 2-5)
47b52c9 add seed data (4 users, 12 posts, 24 comments)
7a36786 add pino logger with pino-pretty, request logging, error handler, JSON 404
ccf04d9 upgrade peta-hono to 0.3.0, wire debug flag
d0a1aa6 chore: add .env/.env.example for production deployment, passwordHash regression test
```

## Files Touched

| File | Status | Done | Left |
|------|--------|------|------|
| `src/db/schema.ts` | modified | Added `role` column with `$type<Role>()`, exported `Role` type | None |
| `src/db/index.ts` | modified | Added Role type re-export, removed dead export on DATABASE_URL | None |
| `drizzle/0002_medical_kronos.sql` | new | Migration: ALTER TABLE users ADD role | None |
| `src/routes/auth.ts` | modified | Role in UserResponse + pick() calls, first-user-is-admin in register | None |
| `src/routes/users.ts` | new | PATCH /users/:id/role admin-only endpoint | None |
| `src/routes/posts.ts` | modified | RBAC guards (reader blocked, admin bypass), removed redundant and() + casts | None |
| `src/routes/comments.ts` | modified | Removed unnecessary Comment cast + type import | None |
| `src/setup.ts` | modified | Request logging, onError->pino, JSON 404, debug flag (dead — see Next Steps) | Debug flag dead (skipped) |
| `src/lib/logger.ts` | new | Pino singleton with pino-pretty in dev, LOG_LEVEL from env | None |
| `src/lib/utils.ts` | new | pick<T,K>(obj, keys) utility | Add pluck if array-extraction pattern emerges |
| `src/index.ts` | modified | Import users route, logger startup messages | None |
| `src/db/seed.ts` | new | 4 users / 12 posts / 24 comments with roles (alice=admin, bob=author, carol=dave=reader) | None |
| `package.json` | modified | peta-hono ^0.3.0, pino + pino-pretty deps, seed script | None |
| `.env.example` | new | SESSION_PASSWORD, DATABASE_URL, PORT, LOG_LEVEL | None |
| `.gitignore` | modified | Added *.db | None |
| `test/api.test.ts` | modified | 26→34 tests: passwordHash regression, RBAC tests (8 new), promote helper | Add authorized-flows (reader can comment) if needed |
| `AGENTS.md` | modified | Endpoints table, RBAC section, folder structure, test count, scripts | None |
| `README.md` | modified | Production deployment (.env option) | Significantly out of date — see Next Steps |

## Key Decisions

- **RBAC: admin + author + reader**: Three roles, enforced inline in handlers (one line per guard). First user = admin, default = reader. Admin bypasses ownership on PUT/DELETE. Reader can comment but not create posts.
- **Promotion endpoint: PATCH /users/:id/role**: Dedicated endpoint in new src/routes/users.ts, admin-only, allows any role transition. Follows one-file-per-resource convention.
- **pino over console.log**: Structured JSON logging for prod, pino-pretty in dev. Replaces peta-hono's console.error via onError override. Request logging middleware times every request.
- **peta-hono 0.3.0**: Fixes validation-error routing through onError (issue #4). Adds debug flag for env-aware error detail visibility.
- **No helper for role checks**: Inline if-statements in handlers (used 1-2 times each). YAGNI on a requireRole abstraction.

## Dead Ends

- **Separate auth schemes for roles**: Considered auth("author") and auth("admin") schemes but rejected — same Cookie-based scheme with different names adds OpenAPI complexity for no spec benefit (403/404 gaps aren't solved by auth schemes). Inline checks are simpler.
- **promote() test helper placement**: Considered adding to register helper scope but kept as standalone — `promote(adminCookie, userId, role)` is explicit about the admin dependency.

## Blockers

- None. All 34 tests pass, typecheck/lint/build clean.

## Next Steps

- [ ] Update README.md — add RBAC roles, PATCH /users/:id/role endpoint, pino logger, LOG_LEVEL, seed script, JSON 404 section. Currently stale from before this session.
- [ ] Push to origin — 10 commits ahead, CI hasn't run on this session's work.
- [ ] Apply audit #1 (dead debug flag) — `debug: process.env.NODE_ENV !== "production"` in `createApi()` is dead because our `app.onError` override replaced peta-hono's onError (the only consumer). One-line removal. Skipped this session.
- [ ] Close 403/404 spec gap — add manual `responses: { 403: ..., 404: ... }` to PUT/DELETE /posts/:id. Upstream peta-hono issue #7 filed for auto-injection.
- [ ] Refresh HANDOFF.md after each session for continuity.

## Suggested Skills

- **ponytail-audit**: Full-repo over-engineering audit produced 5 findings (2-5 applied, #1 skipped). Worth re-running after new feature work.
- **improve**: Full codebase survey for remaining tech debt before feature work.
