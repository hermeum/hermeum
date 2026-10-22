import { initTRPC, TRPCError } from "@trpc/server";
import SuperJSON from "superjson";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth } from "@/server/routers/better-auth/auth.js";
import { config } from "@/server/libs/config";
import { demoUser } from "@/entities/index.js";
import type { Context as TRPCContext, Session, User } from "@/entities/index.js";

// Every anonymous visitor maps to demoUser so they share a single workspace.
// The id is stable so resources created during the demo keep passing ownership
// checks across requests and restarts.
const DEMO_SESSION_ID = "demo-session";
const DEMO_EXPIRES_AT = new Date("9999-12-31T23:59:59.999Z");

function demoContext(): TRPCContext {
  const user: User = {
    ...demoUser,
    createdAt: new Date(0),
  };
  const session: Session = {
    id: DEMO_SESSION_ID,
    userId: demoUser.id,
    expiresAt: DEMO_EXPIRES_AT,
  };
  return { session, user };
}

export const createTRPContext = async ({ req }: { req: Request }): Promise<TRPCContext> => {
  const raw = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!raw && config.demoMode) {
    return demoContext();
  }
  const session: Session | null = raw ? raw.session : null;
  const user: User | null = raw ? raw.user : null;
  return {
    session,
    user,
  };
};

export const t = initTRPC.context<TRPCContext>().create({ transformer: SuperJSON });

export const publicProcedure = t.procedure;

// Throws UNAUTHORIZED if no session cookie is present; narrows ctx.session to non-null.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session, user: ctx.user } });
});
