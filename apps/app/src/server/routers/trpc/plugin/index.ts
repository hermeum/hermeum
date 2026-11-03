import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createPluginTRPCContext, t } from "./shared.js";
import { agentSessionRouter } from "./telemetry.js";
import { agentMemoryRouter } from "./memory.js";

export const pluginRouter = t.router({
  agentSession: agentSessionRouter,
  agentMemory: agentMemoryRouter,
});

export type PluginRouter = typeof pluginRouter;

export const pluginTrpcMiddleware = createExpressMiddleware({
  router: pluginRouter,
  createContext: createPluginTRPCContext(),
});
