import { initTRPC } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { commandRouter } from "./routers/command.js";
import { sandboxRouter } from "./routers/sandbox.js";

const t = initTRPC.create();
export const appRouter = t.router({
  sandbox: sandboxRouter,
  command: commandRouter,
});

export type AppRouter = typeof appRouter;

export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: () => ({}),
});
