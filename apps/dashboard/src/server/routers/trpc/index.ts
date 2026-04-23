import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { t, createTRPContext } from "./shared.js";
import { instanceRouter } from "./instance.js";
import { secretRouter } from "./secret.js";
import { templateRouter } from "./template.js";

export const appRouter = t.router({
  instance: instanceRouter,
  template: templateRouter,
  secret: secretRouter,
});

export type AppRouter = typeof appRouter;

export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: createTRPContext,
});
