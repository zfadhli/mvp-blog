import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import "../src/routes/auth.js";
import "../src/routes/comments.js";
import "../src/routes/posts.js";
import "../src/routes/tags.js";
import "../src/routes/users.js";
import { comments, db, posts, postTags, tags, users } from "../src/db/index.js";
import { app, docs } from "../src/setup.js";

docs();

async function resetDb() {
  await db.delete(postTags);
  await db.delete(comments);
  await db.delete(posts);
  await db.delete(tags);
  await db.delete(users);
}

async function register(email = "alice@test.com") {
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: email.split("@")[0], password: "password123" }),
  });
  assert.strictEqual(res.status, 201);
  const cookie = res.headers.get("set-cookie");
  assert.ok(cookie, "register should set a cookie");
  const user = await res.json();
  return { cookie: cookie as string, user };
}

async function login(email = "alice@test.com", password = "password123") {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.strictEqual(res.status, 200);
  const cookie = res.headers.get("set-cookie");
  assert.ok(cookie, "login should set a cookie");
  const user = await res.json();
  return { cookie: cookie as string, user };
}

function authed(path: string, init: RequestInit & { cookie: string }) {
  const { cookie, ...rest } = init;
  return app.request(path, {
    ...rest,
    headers: { ...rest.headers, Cookie: cookie },
  });
}

const json = (body: unknown) => JSON.stringify(body);

// Promote a user to a role via the admin endpoint.
// `adminCookie` must be an admin's session cookie.
async function promote(adminCookie: string, userId: string, role: "admin" | "author" | "reader") {
  const res = await authed(`/users/${userId}/role`, {
    method: "PATCH",
    cookie: adminCookie,
    headers: { "Content-Type": "application/json" },
    body: json({ role }),
  });
  assert.strictEqual(res.status, 200, `promote to ${role} should return 200`);
  return res.json();
}

// Create a tag via an author/admin cookie. Returns the created tag.
async function createTag(cookie: string, name: string) {
  const res = await authed("/tags", {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/json" },
    body: json({ name }),
  });
  assert.strictEqual(res.status, 201, `createTag(${name}) should return 201`);
  return res.json();
}

describe("Blog API", () => {
  beforeEach(resetDb);

  describe("auth", () => {
    it("register creates a new user", async () => {
      const { user } = await register("new@test.com");
      assert.ok(user.id);
      assert.strictEqual(user.email, "new@test.com");
      assert.strictEqual(user.name, "new");
    });

    it("rejects duplicate email on register", async () => {
      await register("dup@test.com");
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ email: "dup@test.com", name: "dup", password: "password123" }),
      });
      assert.strictEqual(res.status, 409);
      const body = await res.json();
      assert.strictEqual(body.error, "email already registered");
    });

    it("login with valid credentials", async () => {
      const { user: registered } = await register("alice@test.com");
      const { user: loggedIn } = await login("alice@test.com", "password123");
      assert.strictEqual(loggedIn.id, registered.id);
      assert.strictEqual(loggedIn.email, registered.email);
    });

    it("login with wrong password returns 401", async () => {
      await register("alice@test.com");
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ email: "alice@test.com", password: "wrongpassword" }),
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.error, "invalid credentials");
    });

    it("login with unknown email returns 401", async () => {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ email: "nobody@test.com", password: "password123" }),
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.strictEqual(body.error, "invalid credentials");
    });

    it("rejects unauthenticated logout", async () => {
      const res = await app.request("/auth/logout", { method: "POST" });
      assert.strictEqual(res.status, 401);
    });

    it("logout destroys session", async () => {
      const { cookie } = await register();
      const res = await authed("/auth/logout", { method: "POST", cookie });
      assert.strictEqual(res.status, 204);
      assert.ok(res.headers.get("set-cookie"), "logout should expire the cookie");

      const after = await app.request("/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ title: "x", content: "y" }),
      });
      assert.strictEqual(after.status, 401);
    });

    it("rejects missing fields on register", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({}),
      });
      assert.strictEqual(res.status, 400);
    });

    it("rejects short password on register", async () => {
      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ email: "a@b.com", name: "a", password: "1234567" }),
      });
      assert.strictEqual(res.status, 400);
    });

    it("returns current user from /me", async () => {
      const { cookie, user } = await register();
      const res = await authed("/me", { method: "GET", cookie });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.id, user.id);
      assert.strictEqual(body.email, user.email);
      assert.strictEqual(body.passwordHash, undefined);
    });

    it("rejects unauthenticated /me", async () => {
      const res = await app.request("/me");
      assert.strictEqual(res.status, 401);
    });
  });

  describe("posts", () => {
    it("creates and lists posts", async () => {
      const { cookie, user } = await register();
      const createRes = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Hello", content: "World" }),
      });
      assert.strictEqual(createRes.status, 201);
      const post = await createRes.json();
      assert.strictEqual(post.title, "Hello");
      assert.strictEqual(post.authorId, user.id);

      const listRes = await app.request("/posts");
      assert.strictEqual(listRes.status, 200);
      const all = await listRes.json();
      assert.strictEqual(all.length, 1);
    });

    it("filters posts by authorId", async () => {
      const { cookie: a, user: userA } = await register("a@x.com");
      const { cookie: b, user: userB } = await register("b@x.com");
      await promote(a, userB.id, "author");

      await authed("/posts", {
        method: "POST",
        cookie: a,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "A's post", content: "x" }),
      });
      await authed("/posts", {
        method: "POST",
        cookie: b,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "B's post", content: "x" }),
      });

      const resA = await app.request(`/posts?authorId=${userA.id}`);
      const aPosts = await resA.json();
      assert.strictEqual(aPosts.length, 1);
      assert.strictEqual(aPosts[0].title, "A's post");
    });

    it("gets a post by id", async () => {
      const { cookie } = await register();
      const createRes = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Get me", content: "Content" }),
      });
      const { id } = await createRes.json();

      const getRes = await app.request(`/posts/${id}`);
      assert.strictEqual(getRes.status, 200);
      const fetched = await getRes.json();
      assert.strictEqual(fetched.title, "Get me");
    });

    it("updates own post", async () => {
      const { cookie } = await register();
      const createRes = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Original", content: "Original content" }),
      });
      const { id } = await createRes.json();

      const updateRes = await authed(`/posts/${id}`, {
        method: "PUT",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Updated" }),
      });
      assert.strictEqual(updateRes.status, 200);
      const updated = await updateRes.json();
      assert.strictEqual(updated.title, "Updated");
      assert.strictEqual(updated.content, "Original content");
    });

    it("forbids updating another user's post", async () => {
      const { cookie: alice } = await register("alice@test.com");
      const createRes = await authed("/posts", {
        method: "POST",
        cookie: alice,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Alice's post", content: "x" }),
      });
      const { id } = await createRes.json();

      const { cookie: bob } = await register("bob@test.com");
      const updateRes = await authed(`/posts/${id}`, {
        method: "PUT",
        cookie: bob,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Hacked" }),
      });
      assert.strictEqual(updateRes.status, 403);
    });

    it("deletes own post", async () => {
      const { cookie } = await register();
      const createRes = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Delete me", content: "x" }),
      });
      const { id } = await createRes.json();

      const deleteRes = await authed(`/posts/${id}`, { method: "DELETE", cookie });
      assert.strictEqual(deleteRes.status, 204);

      const getRes = await app.request(`/posts/${id}`);
      assert.strictEqual(getRes.status, 404);
    });

    it("returns 404 for missing post", async () => {
      const res = await app.request("/posts/nonexistent");
      assert.strictEqual(res.status, 404);
    });
  });

  describe("comments", () => {
    it("creates and lists comments on a post", async () => {
      const { cookie } = await register();
      const createPostRes = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Post", content: "Content" }),
      });
      const { id } = await createPostRes.json();

      const createCommentRes = await authed(`/posts/${id}/comments`, {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ content: "Nice post!" }),
      });
      assert.strictEqual(createCommentRes.status, 201);
      const comment = await createCommentRes.json();
      assert.strictEqual(comment.content, "Nice post!");
      assert.strictEqual(comment.postId, id);

      const listRes = await app.request(`/posts/${id}/comments`);
      assert.strictEqual(listRes.status, 200);
      const all = await listRes.json();
      assert.strictEqual(all.length, 1);
    });

    it("returns 404 for comments on missing post", async () => {
      const { cookie } = await register();
      const res = await authed("/posts/nonexistent/comments", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ content: "x" }),
      });
      assert.strictEqual(res.status, 404);
    });
  });

  describe("tags", () => {
    it("creates and lists tags", async () => {
      const { cookie } = await register();
      await createTag(cookie, "Hono");
      await createTag(cookie, "Drizzle");

      const res = await app.request("/tags");
      assert.strictEqual(res.status, 200);
      const all = await res.json();
      assert.strictEqual(all.length, 2);
      assert.ok(all.some((t: { name: string }) => t.name === "Hono"));
      assert.ok(all.some((t: { name: string }) => t.name === "Drizzle"));
    });

    it("rejects duplicate tag name with 409", async () => {
      const { cookie } = await register();
      await createTag(cookie, "Hono");
      const res = await authed("/tags", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ name: "Hono" }),
      });
      assert.strictEqual(res.status, 409);
    });

    it("reader cannot create tags", async () => {
      await register("admin@test.com");
      const { cookie } = await register("reader@test.com");
      const res = await authed("/tags", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ name: "x" }),
      });
      assert.strictEqual(res.status, 403);
    });

    it("rejects unauthenticated tag creation", async () => {
      const res = await app.request("/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ name: "x" }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("deletes a tag (author/admin), cascades off join", async () => {
      const { cookie } = await register();
      const { id: tagId } = await createTag(cookie, "Hono");

      // Attach tag to a post first.
      const createPost = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "P", content: "C", tagIds: [tagId] }),
      });
      await createPost.json();
      const links = await db.select().from(postTags);
      assert.strictEqual(links.length, 1);

      const delRes = await authed(`/tags/${tagId}`, { method: "DELETE", cookie });
      assert.strictEqual(delRes.status, 204);

      const after = await db.select().from(postTags);
      assert.strictEqual(after.length, 0, "join rows should cascade-delete with the tag");
      const getRes = await app.request("/tags");
      const all = await getRes.json();
      assert.strictEqual(all.length, 0);
    });

    it("reader cannot delete tags", async () => {
      const { cookie: adminCookie } = await register("admin@test.com");
      const { id: tagId } = await createTag(adminCookie, "Hono");

      const { cookie: readerCookie } = await register("reader@test.com");
      const res = await authed(`/tags/${tagId}`, { method: "DELETE", cookie: readerCookie });
      assert.strictEqual(res.status, 403);
    });

    it("returns 404 for deleting a missing tag", async () => {
      const { cookie } = await register();
      const res = await authed("/tags/nonexistent", { method: "DELETE", cookie });
      assert.strictEqual(res.status, 404);
    });

    it("attaches tags on post create and returns them on detail", async () => {
      const { cookie } = await register();
      const { id: t1 } = await createTag(cookie, "Hono");
      const { id: t2 } = await createTag(cookie, "Drizzle");

      const createRes = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "P", content: "C", tagIds: [t1, t2] }),
      });
      assert.strictEqual(createRes.status, 201);
      const created = await createRes.json();
      assert.strictEqual(created.tags.length, 2);
      assert.ok(created.tags.some((t: { name: string }) => t.name === "Hono"));

      const getRes = await app.request(`/posts/${created.id}`);
      const fetched = await getRes.json();
      assert.strictEqual(fetched.tags.length, 2);
    });

    it("resyncs tags on post update", async () => {
      const { cookie } = await register();
      const { id: t1 } = await createTag(cookie, "Hono");
      const { id: t2 } = await createTag(cookie, "Drizzle");

      const createRes = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "P", content: "C", tagIds: [t1] }),
      });
      const { id } = await createRes.json();

      // Replace t1 with t2.
      const updateRes = await authed(`/posts/${id}`, {
        method: "PUT",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ tagIds: [t2] }),
      });
      assert.strictEqual(updateRes.status, 200);
      const updated = await updateRes.json();
      assert.strictEqual(updated.tags.length, 1);
      assert.strictEqual(updated.tags[0].name, "Drizzle");

      // Empty array clears all tags.
      const clearRes = await authed(`/posts/${id}`, {
        method: "PUT",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ tagIds: [] }),
      });
      const cleared = await clearRes.json();
      assert.strictEqual(cleared.tags.length, 0);
    });

    it("rejects unknown tagId on post create with 400", async () => {
      const { cookie } = await register();
      const res = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "P", content: "C", tagIds: ["nope"] }),
      });
      assert.strictEqual(res.status, 400);
    });

    it("rejects unknown tagId on post update with 400", async () => {
      const { cookie } = await register();
      const createRes = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "P", content: "C" }),
      });
      const { id } = await createRes.json();

      const res = await authed(`/posts/${id}`, {
        method: "PUT",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ tagIds: ["nope"] }),
      });
      assert.strictEqual(res.status, 400);
    });

    it("filters posts by tag name", async () => {
      const { cookie } = await register();
      const { id: taggedId } = await createTag(cookie, "Hono");
      await createTag(cookie, "Drizzle");

      await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Tagged", content: "C", tagIds: [taggedId] }),
      });
      await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Untagged", content: "C" }),
      });

      const res = await app.request("/posts?tag=Hono");
      assert.strictEqual(res.status, 200);
      const filtered = await res.json();
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].title, "Tagged");
    });

    it("combines authorId and tag filters", async () => {
      const { cookie: a, user: userA } = await register("a@x.com");
      const { cookie: b } = await register("b@x.com");
      const { id: tagId } = await createTag(a, "Hono");

      await authed("/posts", {
        method: "POST",
        cookie: a,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "A-tagged", content: "C", tagIds: [tagId] }),
      });
      await authed("/posts", {
        method: "POST",
        cookie: b,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "B-tagged", content: "C", tagIds: [tagId] }),
      });

      const res = await app.request(`/posts?tag=Hono&authorId=${userA.id}`);
      const filtered = await res.json();
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].title, "A-tagged");
    });
  });

  describe("auth guards", () => {
    it("rejects unauthenticated post creation", async () => {
      const res = await app.request("/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ title: "x", content: "y" }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("rejects unauthenticated post update", async () => {
      const res = await app.request("/posts/some-id", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: json({ title: "x" }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("rejects unauthenticated post deletion", async () => {
      const res = await app.request("/posts/some-id", { method: "DELETE" });
      assert.strictEqual(res.status, 401);
    });

    it("rejects unauthenticated comment creation", async () => {
      const res = await app.request("/posts/some-id/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json({ content: "x" }),
      });
      assert.strictEqual(res.status, 401);
    });
  });

  describe("RBAC", () => {
    it("first registered user is admin", async () => {
      const { user } = await register("first@test.com");
      assert.strictEqual(user.role, "admin");
    });

    it("second registered user is reader by default", async () => {
      await register("first@test.com");
      const { user } = await register("second@test.com");
      assert.strictEqual(user.role, "reader");
    });

    it("reader cannot create posts", async () => {
      await register("admin@test.com");
      const { cookie } = await register("reader@test.com");
      const res = await authed("/posts", {
        method: "POST",
        cookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "x", content: "y" }),
      });
      assert.strictEqual(res.status, 403);
    });

    it("admin can update another user's post", async () => {
      const { cookie: adminCookie } = await register("admin@test.com");
      const { cookie: authorCookie, user: author } = await register("author@test.com");
      await promote(adminCookie, author.id, "author");

      const createRes = await authed("/posts", {
        method: "POST",
        cookie: authorCookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Author's post", content: "x" }),
      });
      const { id } = await createRes.json();

      const updateRes = await authed(`/posts/${id}`, {
        method: "PUT",
        cookie: adminCookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Admin edited this" }),
      });
      assert.strictEqual(updateRes.status, 200);
      const updated = await updateRes.json();
      assert.strictEqual(updated.title, "Admin edited this");
    });

    it("admin can delete another user's post", async () => {
      const { cookie: adminCookie } = await register("admin@test.com");
      const { cookie: authorCookie, user: author } = await register("author@test.com");
      await promote(adminCookie, author.id, "author");

      const createRes = await authed("/posts", {
        method: "POST",
        cookie: authorCookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Author's post", content: "x" }),
      });
      const { id } = await createRes.json();

      const deleteRes = await authed(`/posts/${id}`, { method: "DELETE", cookie: adminCookie });
      assert.strictEqual(deleteRes.status, 204);
    });

    it("admin can promote reader to author", async () => {
      const { cookie: adminCookie } = await register("admin@test.com");
      const { user: reader } = await register("reader@test.com");
      assert.strictEqual(reader.role, "reader");

      const updated = await promote(adminCookie, reader.id, "author");
      assert.strictEqual(updated.role, "author");
    });

    it("non-admin cannot promote users", async () => {
      await register("admin@test.com");
      const { cookie: authorCookie, user: reader } = await register("reader@test.com");
      const res = await authed(`/users/${reader.id}/role`, {
        method: "PATCH",
        cookie: authorCookie,
        headers: { "Content-Type": "application/json" },
        body: json({ role: "author" }),
      });
      assert.strictEqual(res.status, 403);
    });

    it("reader can still comment on posts", async () => {
      const { cookie: adminCookie } = await register("admin@test.com");
      const { cookie: authorCookie, user: author } = await register("author@test.com");
      await promote(adminCookie, author.id, "author");

      const createRes = await authed("/posts", {
        method: "POST",
        cookie: authorCookie,
        headers: { "Content-Type": "application/json" },
        body: json({ title: "Post", content: "Content" }),
      });
      const { id } = await createRes.json();

      const { cookie: readerCookie } = await register("reader@test.com");
      const commentRes = await authed(`/posts/${id}/comments`, {
        method: "POST",
        cookie: readerCookie,
        headers: { "Content-Type": "application/json" },
        body: json({ content: "Nice post!" }),
      });
      assert.strictEqual(commentRes.status, 201);
    });
  });

  describe("OpenAPI", () => {
    it("serves the OpenAPI spec", async () => {
      const res = await app.request("/openapi.json");
      assert.strictEqual(res.status, 200);
      const spec = await res.json();
      assert.strictEqual(spec.info.title, "Blog API");
      assert.ok(spec.paths["/posts"]);
      assert.ok(spec.paths["/posts/{id}"]);
      assert.ok(spec.paths["/posts/{id}/comments"]);
      assert.ok(spec.paths["/auth/register"], "register route is documented");
      assert.ok(spec.paths["/auth/login"], "login route is documented");
      assert.ok(spec.paths["/auth/logout"], "logout route is documented");
      assert.ok(spec.paths["/me"], "me route is documented");
      assert.ok(spec.paths["/users/{id}/role"], "user role route is documented");
      assert.ok(spec.paths["/tags"], "tags list route is documented");
      assert.ok(spec.paths["/tags/{id}"], "tag delete route is documented");
    });

    it("serves the docs UI", async () => {
      const res = await app.request("/docs");
      assert.strictEqual(res.status, 200);
    });
  });
});
