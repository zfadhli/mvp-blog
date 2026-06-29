import { type } from "arktype";
import { and, eq, inArray } from "drizzle-orm";
import { fail } from "peta-hono";
import { db, posts, postTags, tags } from "../db";
import { api } from "../setup";

const PostBody = type({ title: "string >= 1", content: "string >= 1", "tagIds?": "string[]" });
const PostUpdate = type({
  "title?": "string >= 1",
  "content?": "string >= 1",
  "tagIds?": "string[]",
});
const ListQuery = type({ authorId: "string?", tag: "string?" });

const PostResponse = type({
  id: "string",
  title: "string",
  content: "string",
  authorId: "string",
  createdAt: "string",
});

const TagSummary = type({ id: "string", name: "string" });
const PostDetailResponse = PostResponse.and({ tags: TagSummary.array() });

// Verify every id in `tagIds` exists; throw badRequest on the first missing one.
// ponytail: O(n) round-trips avoided by a single inArray count check — fine up
// to thousands of tags per post; switch to a temp-table join if that ceiling bites.
async function assertTagsExist(tagIds: string[]) {
  if (tagIds.length === 0) return;
  const rows = await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds));
  if (rows.length !== tagIds.length) throw fail.badRequest("tag not found");
}

// Sync a post's tags to exactly `tagIds` (deduped): delete rows not in the set,
// insert rows that are missing. Composite PK dedupes within a single insert.
async function syncPostTags(postId: string, tagIds: string[]) {
  const unique = [...new Set(tagIds)];
  await db.delete(postTags).where(eq(postTags.postId, postId));
  if (unique.length === 0) return;
  await db.insert(postTags).values(unique.map((tagId) => ({ postId, tagId })));
}

// GET /posts — list all; optional ?authorId and/or ?tag (tag name) filter.
// List stays tag-free (tags[] only on detail) to keep the common path cheap.
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
    if (query.tag) {
      // Join through post_tags to filter posts by tag name.
      const rows = await db
        .select({
          id: posts.id,
          title: posts.title,
          content: posts.content,
          authorId: posts.authorId,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .innerJoin(postTags, eq(postTags.postId, posts.id))
        .innerJoin(tags, eq(tags.id, postTags.tagId))
        .where(
          and(
            eq(tags.name, query.tag),
            query.authorId ? eq(posts.authorId, query.authorId) : undefined,
          ),
        );
      return rows;
    }
    const rows = query.authorId
      ? await db.select().from(posts).where(eq(posts.authorId, query.authorId))
      : await db.select().from(posts);
    return rows;
  },
);

// POST /posts — create (auth required, author/admin only); optional tagIds[] attaches tags.
api(
  {
    method: "POST",
    path: "/posts",
    body: PostBody,
    auth: "required",
    responses: { 201: PostDetailResponse },
    tags: ["posts"],
    summary: "Create post",
    status: 201,
  },
  async ({ body, auth }) => {
    if (auth.user.role === "reader") throw fail.forbidden("author or admin role required");
    const tagIds = body.tagIds ?? [];
    await assertTagsExist(tagIds);

    const [post] = await db
      .insert(posts)
      .values({ title: body.title, content: body.content, authorId: auth.user.id })
      .returning();
    await syncPostTags(post.id, tagIds);

    const postTagsRows = await db
      .select({ id: tags.id, name: tags.name })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(eq(postTags.postId, post.id));
    return { ...post, tags: postTagsRows };
  },
);

// GET /posts/:id — get by id, includes attached tags[]
api(
  {
    method: "GET",
    path: "/posts/:id",
    responses: { 200: PostDetailResponse },
    tags: ["posts"],
    summary: "Get post",
  },
  async ({ id }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw fail.notFound("post not found");
    const postTagsRows = await db
      .select({ id: tags.id, name: tags.name })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(eq(postTags.postId, id));
    return { ...post, tags: postTagsRows };
  },
);

// PUT /posts/:id — update (owner or admin); optional tagIds[] resyncs tags.
api(
  {
    method: "PUT",
    path: "/posts/:id",
    body: PostUpdate,
    auth: "required",
    responses: { 200: PostDetailResponse },
    tags: ["posts"],
    summary: "Update post",
  },
  async ({ id, body, auth }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) throw fail.notFound("post not found");
    if (post.authorId !== auth.user.id && auth.user.role !== "admin")
      throw fail.forbidden("not the author");

    // Validate tags before any mutation so a bad tagIds never half-applies.
    if (body.tagIds !== undefined) await assertTagsExist(body.tagIds);

    // Only update post columns when at least one is present — Drizzle throws
    // "No values to set" on an empty .set({}), e.g. a tag-only PUT.
    const fields: Record<string, string> = {};
    if (body.title !== undefined) fields.title = body.title;
    if (body.content !== undefined) fields.content = body.content;
    let updated = post;
    if (Object.keys(fields).length > 0) {
      const [row] = await db.update(posts).set(fields).where(eq(posts.id, id)).returning();
      updated = row;
    }

    if (body.tagIds !== undefined) await syncPostTags(id, body.tagIds);

    const postTagsRows = await db
      .select({ id: tags.id, name: tags.name })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(eq(postTags.postId, id));
    return { ...updated, tags: postTagsRows };
  },
);

// DELETE /posts/:id — delete (owner or admin); cascades to post_tags.
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
    if (post.authorId !== auth.user.id && auth.user.role !== "admin")
      throw fail.forbidden("not the author");

    await db.delete(posts).where(eq(posts.id, id));
    return null;
  },
);
