import { initTRPC } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import SuperJSON from "superjson";
import { instanceRouter } from "./routers/instance.js";
import { secretRouter } from "./routers/secret.js";
import { templateRouter } from "./routers/template.js";

const t = initTRPC.create({ transformer: SuperJSON });
export const appRouter = t.router({
  instance: instanceRouter,
  template: templateRouter,
  secret: secretRouter,
});

export type AppRouter = typeof appRouter;

export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: () => ({}),
});
