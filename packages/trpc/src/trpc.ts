import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

// ─── Context ──────────────────────────────────────────────────────────────────

export interface Context {
  /** Kubernetes namespace to scope requests, resolved from auth/session */
  namespace: string;
  /** Caller identity — populated by auth middleware */
  userId?: string;
}

export const createContext = (opts: Partial<Context> = {}): Context => ({
  namespace: opts.namespace ?? "default",
  userId: opts.userId,
});

// ─── Init ─────────────────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Procedure that requires a resolved namespace */
export const namespacedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.namespace) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Namespace required" });
  }
  return next({ ctx });
});
