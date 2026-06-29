import { serve } from "@hono/node-server";
import "./routes/auth.js";
import "./routes/posts.js";
import "./routes/comments.js";
import "./routes/users.js";
import { logger } from "./lib/logger.js";
import { app, docs } from "./setup.js";

docs();

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, `Blog API running on http://localhost:${info.port}`);
  logger.info({ port: info.port }, `API docs at http://localhost:${info.port}/docs`);
});
