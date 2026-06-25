import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { comments, posts, users } from "./schema";

const DATABASE_URL = process.env.DATABASE_URL ?? ":memory:";

const client = createClient({ url: DATABASE_URL });

export const db = drizzle(client, { schema: { users, posts, comments } });

// Run migrations at module load. In-memory DB is per-process, so each test
// process boots a fresh schema. ponytail: top-level await — fine for app entry;
// if a long-lived worker needs lazy init, wrap in an init() guard.
await migrate(db, { migrationsFolder: "./drizzle" });

export type { Comment, Post, User } from "./schema";
export { comments, posts, users } from "./schema";
