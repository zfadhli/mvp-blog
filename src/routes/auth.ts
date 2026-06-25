import { type } from "arktype";
import { eq } from "drizzle-orm";
import { db, type User, users } from "../db";
import { api } from "../setup";

const LoginBody = type({ email: "string >= 1", name: "string?" });
const UserResponse = type({
  id: "string",
  email: "string",
  name: "string",
  createdAt: "string",
});

// POST /auth/login — upsert by email, set session cookie.
// Uses api() (not raw app.post) so it gets ArkType body validation + OpenAPI
// docs. The `c` param exposes the Hono Context → c.var.session.save().
api(
  {
    method: "POST",
    path: "/auth/login",
    body: LoginBody,
    responses: { 200: UserResponse },
    tags: ["auth"],
    summary: "Login or create user by email",
  },
  async ({ body, c }) => {
    const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);

    let user: User = existing;
    if (!user) {
      const [created] = await db
        .insert(users)
        .values({ email: body.email, name: body.name ?? body.email.split("@")[0] })
        .returning();
      user = created;
    }

    c.var.session.userId = user.id;
    await c.var.session.save();
    return user;
  },
);

// POST /auth/logout — destroy session, 204 No Content (auth required).
// Auth-required: a client with no session has nothing to log out from → 401.
api(
  {
    method: "POST",
    path: "/auth/logout",
    auth: "required",
    status: 204,
    tags: ["auth"],
    summary: "Logout and destroy session",
  },
  async ({ c }) => {
    c.var.session.destroy();
    return null;
  },
);

// GET /me — returns the current authenticated user (auth required).
// Reuses UserResponse schema from login. Auth bridge already loaded auth.user.
api(
  {
    method: "GET",
    path: "/me",
    auth: "required",
    responses: { 200: UserResponse },
    tags: ["auth"],
    summary: "Get current user",
  },
  async ({ auth }) => auth.user,
);
