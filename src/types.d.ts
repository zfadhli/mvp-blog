import "hono";

// Module augmentation: types c.var.session across the app so handlers and the
// auth bridge read it without casts. Mirrors peta-auth's IronSession surface.
declare module "hono" {
  interface ContextVariableMap {
    session: {
      userId?: string;
      save(): Promise<void>;
      destroy(): void;
      [key: string]: unknown;
    };
  }
}
