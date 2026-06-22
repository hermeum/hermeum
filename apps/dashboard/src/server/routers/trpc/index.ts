import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { t, createTRPContext } from "./shared.js";
import { agentRouter } from "./agent.js";
import { secretRouter } from "./secret.js";
import { templateRouter } from "./template.js";

export const appRouter = t.router({
  agent: agentRouter,
  template: templateRouter,
  secret: secretRouter,
});

export type AppRouter = typeof appRouter;

export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: createTRPContext,
});
