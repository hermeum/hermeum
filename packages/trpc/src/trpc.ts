import { initTRPC, TRPCError } from "@trpc/server";

// ─── Context ──────────────────────────────────────────────────────────────────

export interface Context {
  /** Kubernetes namespace to scope requests, resolved from auth/session */
  namespace: string;
  /** Caller identity — populated by auth middleware */
  userId?: string;
}

export const createContext = (opts: Partial<Context> = {}): Context => {
  const ctx: Context = { namespace: opts.namespace ?? "default" };
  if (opts.userId !== undefined) ctx.userId = opts.userId;
  return ctx;
};

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
