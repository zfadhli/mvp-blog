import { sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ulid } from "ulid";

// ponytail: createdAt as ISO string text — swap to integer epoch if index/sort perf matters
const now = () => new Date().toISOString();

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(ulid),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("reader"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(now),
});

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey().$defaultFn(ulid),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(now),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey().$defaultFn(ulid),
  content: text("content").notNull(),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(now),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey().$defaultFn(ulid),
  name: text("name").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(now),
});

export const postTags = sqliteTable(
  "post_tags",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
);

export type Role = "admin" | "author" | "reader";
export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type PostTag = typeof postTags.$inferSelect;
