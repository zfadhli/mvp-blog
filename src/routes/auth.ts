import { eq } from "drizzle-orm";
import { fail } from "peta-hono";
import { db, users } from "../db";
import { app } from "../setup";

type SessionVars = { session: { userId?: string } & { save(): Promise<void>; destroy(): void } };

// POST /auth/login — upsert by email, set session cookie.
// Raw Hono route (not api()) because we need c.var.session.save() which the
// flat req object from peta-hono doesn't expose.
app.post("/auth/login", async (c) => {
  const body = await c.req.json<{ email: string; name?: string }>();
  if (!body?.email) throw fail.badRequest("email is required");

  const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);

  let user = existing;
  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email: body.email,
        name: body.name ?? body.email.split("@")[0],
      })
      .returning();
    user = created;
  }

  const { session } = c.var as unknown as SessionVars;
  session.userId = user.id;
  await session.save();
  return c.json(user, 200);
});

// POST /auth/logout — destroy session, 204 No Content.
app.post("/auth/logout", (c) => {
  const { session } = c.var as unknown as SessionVars;
  session.destroy();
  return c.body(null, 204);
});
