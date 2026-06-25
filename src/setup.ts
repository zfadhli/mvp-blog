import { eq } from "drizzle-orm";
import { session } from "peta-auth/hono";
import { APIError, createApi, fail } from "peta-hono";
import "./types.d.ts";
import { db, type User, users } from "./db";
import { logger } from "./lib/logger.js";

// ponytail: dev fallback secret — override SESSION_PASSWORD in prod (>= 32 chars)
const SESSION_PASSWORD = process.env.SESSION_PASSWORD ?? "change-me-to-a-32-char-string!!!!";

export type Auth = { user: User };

export const { api, auth, docs, app } = createApi<Auth>({
  title: "Blog API",
  version: "1.0.0",
  // ponytail: debug shows real error details in dev; omit or set NODE_ENV=production to hide
  debug: process.env.NODE_ENV !== "production",
});

// Request logging — outermost middleware, times the full request lifecycle.
app.use("*", async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info(
    { method: c.req.method, path: c.req.path, status: c.res.status, durationMs: ms },
    "request",
  );
});

// Global encrypted-cookie session — runs before every handler so c.var.session
// is always available (login reads it, auth('required') reads it, public routes
// simply don't check it). Typed via ContextVariableMap augmentation in types.d.ts.
app.use(
  "*",
  session<{ userId?: string }>({
    password: SESSION_PASSWORD,
    cookieName: "blog-session",
  }),
);

// Auth bridge: peta-auth session → peta-hono typed auth context.
// The session middleware populates c.var.session; this reads it, looks up the
// user, and returns { user } which becomes req.auth in handlers.
auth(
  "required",
  async (c) => {
    const userId = c.var.session?.userId;
    if (!userId) throw fail.unauthorized();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw fail.unauthorized();
    return { user };
  },
  { type: "apiKey", in: "header", name: "Cookie" },
);

// Error handling — override peta-hono's default to route through pino.
// APIErrors are intentional (fail.*) — log at warn, use their message.
// Unknown errors log at error; hide internal details in production.
app.onError((err, c) => {
  if (err instanceof APIError) {
    logger.warn({ err, status: err.status }, err.message);
    return c.json({ error: err.message }, err.status);
  }
  logger.error({ err }, "unhandled error");
  const message = process.env.NODE_ENV !== "production" ? err.message : "Internal Server Error";
  return c.json({ error: message }, 500);
});

// JSON 404 for unmatched routes — closes the text-plain gap.
app.notFound((c) => c.json({ error: "Not Found" }, 404));
