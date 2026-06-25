import { type } from "arktype";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "peta-auth";
import { fail } from "peta-hono";
import { db, type User, users } from "../db";
import { api } from "../setup";

const RegisterBody = type({ name: "string >= 1", email: "string.email", password: "string >= 8" });
const LoginBody = type({ email: "string.email", password: "string >= 8" });
const UserResponse = type({
  id: "string",
  email: "string",
  name: "string",
  createdAt: "string",
});

function publicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

// POST /auth/register — create account with name, email, password, set session.
api(
  {
    method: "POST",
    path: "/auth/register",
    body: RegisterBody,
    responses: { 201: UserResponse },
    status: 201,
    tags: ["auth"],
    summary: "Register a new user",
  },
  async ({ body, c }) => {
    const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (existing) throw fail.conflict("email already registered");

    const hash = await hashPassword(body.password);
    const [user] = await db
      .insert(users)
      .values({ email: body.email, name: body.name, passwordHash: hash })
      .returning();

    c.var.session.userId = user.id;
    await c.var.session.save();
    return publicUser(user);
  },
);

// POST /auth/login — authenticate with email and password, set session.
// Same 401 for unknown email and wrong password to prevent user enumeration.
api(
  {
    method: "POST",
    path: "/auth/login",
    body: LoginBody,
    responses: { 200: UserResponse },
    tags: ["auth"],
    summary: "Login with email and password",
  },
  async ({ body, c }) => {
    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user) throw fail.unauthorized("invalid credentials");

    const valid = await verifyPassword(user.passwordHash, body.password);
    if (!valid) throw fail.unauthorized("invalid credentials");

    c.var.session.userId = user.id;
    await c.var.session.save();
    return publicUser(user);
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
  async ({ auth }) => publicUser(auth.user),
);
