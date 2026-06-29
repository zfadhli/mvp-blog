import { hashPassword } from "peta-auth";
import { db } from "./index";
import { comments, posts, users } from "./schema";

// ponytail: console.log is fine for a one-shot dev tool — Pino's worker-thread
// lifecycle is overkill for a script that prints once and exits.
const log = console.log;

async function seed() {
  log("Seeding database...");

  // Truncate in cascade-safe order (children before parents).
  await db.delete(comments);
  await db.delete(posts);
  await db.delete(users);

  // ── Users ──────────────────────────────────────────────────────────
  // All users authenticate with password "password123" (matches test helper default).
  const passwordHash = await hashPassword("password123");
  const allUsers = await db
    .insert(users)
    .values([
      { email: "alice@test.com", name: "Alice", passwordHash, role: "admin" },
      { email: "bob@test.com", name: "Bob", passwordHash, role: "author" },
      { email: "carol@test.com", name: "Carol", passwordHash, role: "reader" },
      { email: "dave@test.com", name: "Dave", passwordHash, role: "reader" },
    ])
    .returning();
  log(`  ${allUsers.length} users`);

  const [alice, bob, carol, dave] = allUsers;

  // ── Posts ──────────────────────────────────────────────────────────
  const allPosts = await db
    .insert(posts)
    .values([
      // Alice
      {
        title: "Getting Started with Hono",
        content:
          "Hono is an ultralight HTTP framework for building APIs on Node.js, Deno, and WinterCG runtimes. This post covers the basics of routing, middleware, and request handling.",
        authorId: alice.id,
      },
      {
        title: "Type-Safe APIs with ArkType",
        content:
          "ArkType provides runtime validation with TypeScript inference, catching invalid data at the edge before it reaches your business logic. Combined with auto-generated OpenAPI specs, it eliminates the schema duplication problem.",
        authorId: alice.id,
      },
      {
        title: "Why I Chose Drizzle ORM",
        content:
          "After evaluating Prisma, TypeORM, and Drizzle, the decision came down to SQL-like ergonomics, bundle size, and migration control. Drizzle's query builder feels like SQL with type safety — no magic.",
        authorId: alice.id,
      },
      // Bob
      {
        title: "SQLite for Production: Yes, Really",
        content:
          "SQLite is often dismissed as a toy, but with WAL mode, proper indexing, and the right concurrency model, it handles millions of reads per second. Perfect for single-server deployments and MVPs.",
        authorId: bob.id,
      },
      {
        title: "Encrypted Cookie Sessions Explained",
        content:
          "Stateless sessions encrypt data directly in the cookie using AES-256-CBC with HMAC-SHA256 integrity verification. No server-side storage, no Redis dependency, no session store to scale.",
        authorId: bob.id,
      },
      {
        title: "The Art of Minimal API Design",
        content:
          "A good API disappears — intuitive endpoints, sensible defaults, and self-documenting schemas. Every parameter should earn its place. This post walks through the design decisions behind a modern REST API.",
        authorId: bob.id,
      },
      // Carol
      {
        title: "Building MVPs the Lazy Way",
        content:
          "The best code is the code never written. Ship the simplest thing that works, defer complexity until you have evidence you need it. This is the ponytail philosophy in action — efficiency through laziness.",
        authorId: carol.id,
      },
      {
        title: "TypeScript Strict Mode Wins",
        content:
          "Enabling strict mode caught three production bugs before they shipped in the first week alone. The upfront cost of fixing types pays for itself tenfold in reduced debugging time and increased confidence.",
        authorId: carol.id,
      },
      {
        title: "Testing Without Frameworks",
        content:
          "Node's built-in test runner (node:test) provides describe, it, and assert without any dependencies. For an MVP test suite, it keeps the dependency graph flat and the feedback loop fast — no Jest config required.",
        authorId: carol.id,
      },
      // Dave
      {
        title: "ULID vs UUID: A Practical Comparison",
        content:
          "ULIDs offer lexicographic sorting, URL-safe 26-character encoding, and millisecond-precision timestamps embedded in the ID. Unlike UUIDv4, they preserve insertion order — no index fragmentation, no B-tree page splits.",
        authorId: dave.id,
      },
      {
        title: "Database Migrations Done Right",
        content:
          "Version-controlled SQL migrations committed alongside schema changes give you a reliable, replayable history. Drizzle Kit generates them automatically from your TypeScript schema definitions. This post covers the workflow.",
        authorId: dave.id,
      },
      {
        title: "The ponytail Philosophy",
        content:
          "Senior developers write less code because they have been paged at 3am for over-engineered systems. Laziness is efficiency — every abstraction, dependency, and feature should justify its existence. Delete more, ship faster.",
        authorId: dave.id,
      },
    ])
    .returning();
  log(`  ${allPosts.length} posts`);

  // ── Comments (2 per post = 24 total) ───────────────────────────────
  const allComments = await db
    .insert(comments)
    .values([
      // Alice post 0 — "Getting Started with Hono"
      {
        content: "Great intro! The middleware chaining pattern is really clean here.",
        postId: allPosts[0].id,
        authorId: bob.id,
      },
      {
        content: "How does Hono compare to Fastify for production workloads?",
        postId: allPosts[0].id,
        authorId: carol.id,
      },
      // Alice post 1 — "Type-Safe APIs with ArkType"
      {
        content:
          "The OpenAPI auto-generation is a killer feature. No more hand-writing spec files.",
        postId: allPosts[1].id,
        authorId: bob.id,
      },
      {
        content: "Have you compared ArkType's inference to Zod's? Curious about the edge cases.",
        postId: allPosts[1].id,
        authorId: dave.id,
      },
      // Alice post 2 — "Why I Chose Drizzle ORM"
      {
        content:
          "The SQL-like feel is what sold me too. Raw SQL with type safety is the sweet spot.",
        postId: allPosts[2].id,
        authorId: carol.id,
      },
      {
        content: "How does Drizzle handle complex joins compared to raw SQL?",
        postId: allPosts[2].id,
        authorId: dave.id,
      },
      // Bob post 0 — "SQLite for Production"
      {
        content: "I was skeptical about SQLite in production too, but the benchmarks convinced me.",
        postId: allPosts[3].id,
        authorId: alice.id,
      },
      {
        content: "What is your take on WAL mode vs DELETE mode for write-heavy workloads?",
        postId: allPosts[3].id,
        authorId: carol.id,
      },
      // Bob post 1 — "Encrypted Cookie Sessions"
      {
        content:
          "The no-Redis aspect is huge for deployment simplicity. One less service to manage.",
        postId: allPosts[4].id,
        authorId: alice.id,
      },
      {
        content: "How do you handle session rotation when the encryption key changes?",
        postId: allPosts[4].id,
        authorId: dave.id,
      },
      // Bob post 2 — "The Art of Minimal API Design"
      {
        content: '"Every parameter should earn its place" is going on my team API design doc.',
        postId: allPosts[5].id,
        authorId: carol.id,
      },
      {
        content: "What is your stance on HATEOAS for REST APIs? Worth the complexity?",
        postId: allPosts[5].id,
        authorId: dave.id,
      },
      // Carol post 0 — "Building MVPs the Lazy Way"
      {
        content:
          "This resonates deeply. We shipped three features in the time it took to plan one abstraction.",
        postId: allPosts[6].id,
        authorId: alice.id,
      },
      {
        content:
          "The ponytail philosophy needs more adoption. Code is a liability, not an asset. Love it.",
        postId: allPosts[6].id,
        authorId: bob.id,
      },
      // Carol post 1 — "TypeScript Strict Mode Wins"
      {
        content:
          "The strict mode bugs we caught were all related to null handling. TypeScript saved us.",
        postId: allPosts[7].id,
        authorId: alice.id,
      },
      {
        content: "Any tips for migrating an existing codebase to strict mode incrementally?",
        postId: allPosts[7].id,
        authorId: bob.id,
      },
      // Carol post 2 — "Testing Without Frameworks"
      {
        content:
          "Using node:test has been a breath of fresh air after Jest. Zero config, zero dependencies.",
        postId: allPosts[8].id,
        authorId: bob.id,
      },
      {
        content: "How do you handle test coverage reporting without a dedicated tool?",
        postId: allPosts[8].id,
        authorId: dave.id,
      },
      // Dave post 0 — "ULID vs UUID"
      {
        content: "The sortability is the killer feature. No more ORDER BY on indexed ULID columns.",
        postId: allPosts[9].id,
        authorId: alice.id,
      },
      {
        content: "What is the collision probability for ULIDs in high-throughput scenarios?",
        postId: allPosts[9].id,
        authorId: carol.id,
      },
      // Dave post 1 — "Database Migrations Done Right"
      {
        content: "We switched from raw SQL to generated migrations and never looked back.",
        postId: allPosts[10].id,
        authorId: alice.id,
      },
      {
        content: "Do you write down-migrations manually, or just rely on the next up-migration?",
        postId: allPosts[10].id,
        authorId: bob.id,
      },
      // Dave post 2 — "The ponytail Philosophy"
      {
        content:
          "Deleting code is the most underrated skill in software engineering. Great post, Dave!",
        postId: allPosts[11].id,
        authorId: carol.id,
      },
      {
        content:
          "This should be required reading for every junior developer (and some seniors too).",
        postId: allPosts[11].id,
        authorId: bob.id,
      },
    ])
    .returning();
  log(`  ${allComments.length} comments`);

  log(`Seeded: ${allUsers.length} users, ${allPosts.length} posts, ${allComments.length} comments`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
