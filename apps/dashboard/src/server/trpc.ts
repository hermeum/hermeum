import { initTRPC } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { fromNodeHeaders } from "better-auth/node";
import SuperJSON from "superjson";
import { instanceRouter } from "./routers/instance.js";
import { secretRouter } from "./routers/secret.js";
import { templateRouter } from "./routers/template.js";
import { auth } from "./infras/better-auth/auth.js";
import type { Session } from "../entities/index.js";

const t = initTRPC.context<{ session: Session | null }>().create({ transformer: SuperJSON });

export const appRouter = t.router({
  instance: instanceRouter,
  template: templateRouter,
  secret: secretRouter,
});

export type AppRouter = typeof appRouter;

export const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: async ({ req }) => {
    const raw = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    const session: Session | null = raw
      ? { id: raw.session.id, userId: raw.session.userId, expiresAt: raw.session.expiresAt }
      : null;
    return { session };
  },
});
