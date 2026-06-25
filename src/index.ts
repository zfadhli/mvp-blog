import { serve } from "@hono/node-server";
import "./routes/auth.js";
import "./routes/posts.js";
import "./routes/comments.js";
import { app, docs } from "./setup.js";

docs();

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Blog API running on http://localhost:${info.port}`);
  console.log(`API docs at http://localhost:${info.port}/docs`);
});
