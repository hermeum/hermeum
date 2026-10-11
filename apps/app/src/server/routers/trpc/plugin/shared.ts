import { initTRPC, TRPCError } from "@trpc/server";
import type { Request } from "express";

import { hashPluginToken } from "@/server/libs/plugin-token";
import type { Database } from "@/server/usecases/adaptors/database.js";
import { sharedDatabase } from "@/server/usecases/mixin.js";

// Standalone initTRPC instance: no SuperJSON transformer (plain JSON wire
// format so non-TS clients can serialize/deserialize) and no Better Auth
// context — agents are not users. Instead, every procedure authenticates a
// per-agent ingest token: the raw token ships in the managed agent's env
// (HERMEUM_PLUGIN_TOKEN) and is presented as `Authorization: Bearer <token>`;
// the server stores only its SHA-256 digest, so verification hashes the
// presented value and resolves the agent id by lookup.

export interface PluginContext {
  agentId: string | null;
}

export const createPluginTRPCContext =
  ({ db = sharedDatabase }: { db?: Database } = {}) =>
  async ({ req }: { req: Request }): Promise<PluginContext> => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    // An empty (whitespace-only) value is rejected explicitly — fail-closed
    // either way, but clearer and no wasted digest lookup.
    const token = match?.[1]?.trim();
    if (!token) {
      return { agentId: null };
    }
    const agentId = await db.findAgentIdByTokenHash(hashPluginToken(token));
    return { agentId };
  };

export const t = initTRPC.context<PluginContext>().create();

// Throws UNAUTHORIZED when the bearer token is missing, unknown, or revoked;
// narrows ctx.agentId to non-null for the procedure.
export const tokenProtectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.agentId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { agentId: ctx.agentId } });
});
