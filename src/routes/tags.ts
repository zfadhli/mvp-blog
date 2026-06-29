import { type } from "arktype";
import { eq } from "drizzle-orm";
import { fail } from "peta-hono";
import { db, tags } from "../db";
import { pick } from "../lib/utils.js";
import { api } from "../setup";

const TagBody = type({ name: "string >= 1" });
const TagResponse = type({
  id: "string",
  name: "string",
  createdAt: "string",
});

// GET /tags — list all tags
api(
  {
    method: "GET",
    path: "/tags",
    responses: { 200: TagResponse.array() },
    tags: ["tags"],
    summary: "List tags",
  },
  async () => {
    const rows = await db.select().from(tags);
    return rows.map((row) => pick(row, ["id", "name", "createdAt"] as const));
  },
);

// POST /tags — create (author or admin only)
api(
  {
    method: "POST",
    path: "/tags",
    body: TagBody,
    auth: "required",
    responses: { 201: TagResponse },
    tags: ["tags"],
    summary: "Create tag",
    status: 201,
  },
  async ({ body, auth }) => {
    if (auth.user.role === "reader") throw fail.forbidden("author or admin role required");
    const [existing] = await db.select().from(tags).where(eq(tags.name, body.name)).limit(1);
    if (existing) throw fail.conflict("tag already exists");
    const [created] = await db.insert(tags).values({ name: body.name }).returning();
    return created;
  },
);

// DELETE /tags/:id — delete (author or admin only); cascades off the join table
api(
  {
    method: "DELETE",
    path: "/tags/:id",
    auth: "required",
    tags: ["tags"],
    summary: "Delete tag",
    status: 204,
  },
  async ({ id, auth }) => {
    if (auth.user.role === "reader") throw fail.forbidden("author or admin role required");
    const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    if (!tag) throw fail.notFound("tag not found");
    await db.delete(tags).where(eq(tags.id, id));
    return null;
  },
);
