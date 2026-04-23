import { initTRPC, TRPCError } from "@trpc/server";
import SuperJSON from "superjson";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth } from "@/server/infras/better-auth/auth.js";
import type { Session } from "@/entities/index.js";

export const createTRPContext = async ({ req }: { req: Request }) => {
  const raw = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  const session: Session | null = raw ? raw.session : null;
  return {
    session,
  };
};

type TRPCContext = Awaited<ReturnType<typeof createTRPContext>>;

export const t = initTRPC.context<TRPCContext>().create({ transformer: SuperJSON });

export const publicProcedure = t.procedure;

// Throws UNAUTHORIZED if no session cookie is present; narrows ctx.session to non-null.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session } });
});
