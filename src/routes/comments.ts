import { type } from "arktype";
import { eq } from "drizzle-orm";
import { fail } from "peta-hono";
import { comments, db, posts } from "../db";
import { api } from "../setup";

const CommentBody = type({ content: "string >= 1" });
const CommentResponse = type({
  id: "string",
  content: "string",
  postId: "string",
  authorId: "string",
  createdAt: "string",
});

// GET /posts/:id/comments — list comments for a post
api(
  {
    method: "GET",
    path: "/posts/:id/comments",
    responses: { 200: CommentResponse.array() },
    tags: ["comments"],
    summary: "List comments for a post",
  },
  async ({ id }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw fail.notFound("post not found");
    const rows = await db.select().from(comments).where(eq(comments.postId, id));
    return rows;
  },
);

// POST /posts/:id/comments — create comment (auth required)
api(
  {
    method: "POST",
    path: "/posts/:id/comments",
    body: CommentBody,
    auth: "required",
    responses: { 201: CommentResponse },
    tags: ["comments"],
    summary: "Create comment",
    status: 201,
  },
  async ({ id, body, auth }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw fail.notFound("post not found");

    const [comment] = await db
      .insert(comments)
      .values({ content: body.content, postId: id, authorId: auth.user.id })
      .returning();
    return comment;
  },
);
