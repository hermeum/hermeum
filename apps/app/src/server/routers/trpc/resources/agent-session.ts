import { z } from "zod";

import { AgentSessionEvent, AgentSessionSummary } from "@/entities";
import { TelemetryUseCase } from "@/server/usecases/telemetry";
import { protectedProcedure, t } from "./shared.js";

const usecase = new TelemetryUseCase();

export const agentSessionResourceRouter = t.router({
  list: protectedProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<AgentSessionSummary[]> => {
      return await usecase.listAgentSessions(ctx, input.agentId);
    }),

  get: protectedProcedure
    .input(z.object({ agentId: z.string().min(1), sessionId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<AgentSessionEvent[]> => {
      return await usecase.getAgentSession(ctx, input.agentId, input.sessionId);
    }),
});