import { eq } from "drizzle-orm";
import { session } from "peta-auth/hono";
import { createApi, fail } from "peta-hono";
import { db, type User, users } from "./db";

// ponytail: dev fallback secret — override SESSION_PASSWORD in prod (>= 32 chars)
const SESSION_PASSWORD = process.env.SESSION_PASSWORD ?? "change-me-to-a-32-char-string!!!!";

export type Auth = { user: User };

export const { api, auth, docs, app } = createApi<Auth>({
  title: "Blog API",
  version: "1.0.0",
});

// Global encrypted-cookie session — runs before every handler so c.var.session
// is always available (login reads it, auth('required') reads it, public routes
// simply don't check it).
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
// ponytail: c.var is typed via peta-hono's OpenAPIHono (no session vars); cast
// is minimal and contained here — handlers downstream get full types.
type SessionVars = { session: { userId?: string } };

auth(
  "required",
  async (c) => {
    const { session } = c.var as unknown as SessionVars;
    if (!session?.userId) throw fail.unauthorized();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId as string))
      .limit(1);
    if (!user) throw fail.unauthorized();
    return { user };
  },
  { type: "apiKey", in: "header", name: "Cookie" },
);
