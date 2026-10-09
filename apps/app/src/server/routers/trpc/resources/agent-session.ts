import { z } from "zod";

import { AgentSession, AgentSessionSummary, PaginatedResult, PaginationQuerySchema } from "@/entities";
import { AgentSessionUseCase } from "@/server/usecases/agent-session";
import { protectedProcedure, t } from "./shared.js";

const usecase = new AgentSessionUseCase();

export const agentSessionResourceRouter = t.router({
  list: protectedProcedure
    .input(
      z.object({
        agentId: z.string().min(1),
        limit: PaginationQuerySchema.shape.limit,
        offset: PaginationQuerySchema.shape.offset,
      })
    )
    .query(async ({ ctx, input }): Promise<PaginatedResult<AgentSessionSummary>> => {
      return await usecase.listAgentSessionSummaries(ctx, input.agentId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  get: protectedProcedure
    .input(z.object({ agentId: z.string().min(1), sessionId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<AgentSession> => {
      return await usecase.getAgentSession(ctx, input.agentId, input.sessionId);
    }),
});