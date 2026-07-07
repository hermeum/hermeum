import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { t, createTRPContext } from "./shared.js";
import { agentRouter } from "./agent.js";
import { agentConfigRouter } from "./agent-config.js";
import { sharedEnvSetRouter } from "./shared-env-set.js";
import { templateRouter } from "./template.js";

export const appRouter = t.router({
  agent: agentRouter,
  agentConfig: agentConfigRouter,
  template: templateRouter,
  sharedEnvSet: sharedEnvSetRouter,
});

export type AppRouter = typeof appRouter;

export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: createTRPContext,
});
