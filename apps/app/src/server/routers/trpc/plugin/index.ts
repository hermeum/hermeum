import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { t } from "./shared.js";
import { agentSessionRouter } from "./telemetry.js";

export const pluginRouter = t.router({
  agentSession: agentSessionRouter,
});

export type PluginRouter = typeof pluginRouter;

export const pluginTrpcMiddleware = createExpressMiddleware({
  router: pluginRouter,
});
