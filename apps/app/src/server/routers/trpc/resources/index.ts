import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { t, createTRPContext } from "./shared.js";
import { agentRouter } from "./agent.js";
import { agentSessionResourceRouter } from "./agent-session.js";
import { agentTypeRouter } from "./agent-type.js";
import { sharedEnvSetRouter } from "./shared-env-set.js";
import { skillRouter } from "./skill.js";
import { templateRouter } from "./template.js";

export const appRouter = t.router({
  agent: agentRouter,
  agentSession: agentSessionResourceRouter,
  agentType: agentTypeRouter,
  template: templateRouter,
  sharedEnvSet: sharedEnvSetRouter,
  skill: skillRouter,
});

export type AppRouter = typeof appRouter;

export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: createTRPContext,
});
