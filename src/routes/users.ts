import { type } from "arktype";
import { eq } from "drizzle-orm";
import { fail } from "peta-hono";
import { db, users } from "../db";
import { pick } from "../lib/utils.js";
import { api } from "../setup";

const RoleBody = type({ role: "'admin' | 'author' | 'reader'" });
const UserResponse = type({
  id: "string",
  email: "string",
  name: "string",
  role: "'admin' | 'author' | 'reader'",
  createdAt: "string",
});

// PATCH /users/:id/role — change a user's role (admin only).
// First registered user is admin by default; this is how readers get
// promoted to author (or any other role transition).
api(
  {
    method: "PATCH",
    path: "/users/:id/role",
    body: RoleBody,
    auth: "required",
    responses: { 200: UserResponse },
    tags: ["users"],
    summary: "Update a user's role (admin only)",
  },
  async ({ id, body, auth }) => {
    if (auth.user.role !== "admin") throw fail.forbidden("admin role required");
    const [user] = await db
      .update(users)
      .set({ role: body.role })
      .where(eq(users.id, id))
      .returning();
    if (!user) throw fail.notFound("user not found");
    return pick(user, ["id", "email", "name", "role", "createdAt"] as const);
  },
);
