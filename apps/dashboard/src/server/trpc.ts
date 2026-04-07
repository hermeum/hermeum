import { initTRPC } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { instanceRouter } from "./routers/openclaw-instance.js";

const t = initTRPC.create();
export const appRouter = t.router({
  instance: instanceRouter,
});

export type AppRouter = typeof appRouter;

export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: () => ({}),
});
