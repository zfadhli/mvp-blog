import { type } from "arktype";
import { eq } from "drizzle-orm";
import { fail } from "peta-hono";
import { db, posts } from "../db";
import { api } from "../setup";

const PostBody = type({ title: "string >= 1", content: "string >= 1" });
const PostUpdate = type({ title: "string >= 1?", content: "string >= 1?" });
const ListQuery = type({ authorId: "string?" });

const PostResponse = type({
  id: "string",
  title: "string",
  content: "string",
  authorId: "string",
  createdAt: "string",
});

// GET /posts — list all, optional ?authorId filter
api(
  {
    method: "GET",
    path: "/posts",
    query: ListQuery,
    responses: { 200: PostResponse.array() },
    tags: ["posts"],
    summary: "List posts",
  },
  async ({ query }) => {
    const rows = query.authorId
      ? await db.select().from(posts).where(eq(posts.authorId, query.authorId))
      : await db.select().from(posts);
    return rows;
  },
);

// POST /posts — create (auth required)
api(
  {
    method: "POST",
    path: "/posts",
    body: PostBody,
    auth: "required",
    responses: { 201: PostResponse },
    tags: ["posts"],
    summary: "Create post",
    status: 201,
  },
  async ({ body, auth }) => {
    const [post] = await db
      .insert(posts)
      .values({ title: body.title, content: body.content, authorId: auth.user.id })
      .returning();
    return post;
  },
);

// GET /posts/:id — get by id
api(
  {
    method: "GET",
    path: "/posts/:id",
    responses: { 200: PostResponse },
    tags: ["posts"],
    summary: "Get post",
  },
  async ({ id }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw fail.notFound("post not found");
    return post;
  },
);

// PUT /posts/:id — update (owner only)
api(
  {
    method: "PUT",
    path: "/posts/:id",
    body: PostUpdate,
    auth: "required",
    responses: { 200: PostResponse },
    tags: ["posts"],
    summary: "Update post",
  },
  async ({ id, body, auth }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw fail.notFound("post not found");
    if (post.authorId !== auth.user.id) throw fail.forbidden("not the author");

    const [updated] = await db
      .update(posts)
      .set({
        ...(body.title !== undefined && { title: body.title }),
        ...(body.content !== undefined && { content: body.content }),
      })
      .where(eq(posts.id, id))
      .returning();
    return updated;
  },
);

// DELETE /posts/:id — delete (owner only)
api(
  {
    method: "DELETE",
    path: "/posts/:id",
    auth: "required",
    tags: ["posts"],
    summary: "Delete post",
    status: 204,
  },
  async ({ id, auth }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw fail.notFound("post not found");
    if (post.authorId !== auth.user.id) throw fail.forbidden("not the author");

    await db.delete(posts).where(eq(posts.id, id));
    return null;
  },
);
