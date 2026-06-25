import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import "../src/routes/auth.js";
import "../src/routes/comments.js";
import "../src/routes/posts.js";
import { comments, db, posts, users } from "../src/db/index.js";
import { app, docs } from "../src/setup.js";

docs();

async function resetDb() {
  await db.delete(comments);
  await db.delete(posts);
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
      const { cookie: b } = await register("b@x.com");

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
    });

    it("serves the docs UI", async () => {
      const res = await app.request("/docs");
      assert.strictEqual(res.status, 200);
    });
  });
});
