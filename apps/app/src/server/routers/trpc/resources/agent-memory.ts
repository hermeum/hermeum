import { z } from "zod";

import { AgentMemoryEntry } from "@/entities";
import { AgentMemoryUseCase } from "@/server/usecases/agent-memory";

import { protectedProcedure, t } from "./shared.js";

// Operator memory management for the agent detail page's Memory tab. Unlike
// agent-session telemetry (browsable by any authenticated user), memory is
// curated content: every procedure authorizes ownership in the use case
// (agent → userId) before touching entries, and writes are refused for
// archived agents.

const usecase = new AgentMemoryUseCase();

const AgentIdInput = z.object({ agentId: z.string().min(1) });

export const agentMemoryResourceRouter = t.router({
  list: protectedProcedure
    .input(AgentIdInput)
    .query(async ({ ctx, input }): Promise<AgentMemoryEntry[]> => {
      return await usecase.listEntries(ctx, input.agentId);
    }),

  add: protectedProcedure
    .input(AgentIdInput.extend({ content: z.string() }))
    .mutation(async ({ ctx, input }): Promise<AgentMemoryEntry[]> => {
      return await usecase.addEntry(ctx, input.agentId, input.content);
    }),

  patch: protectedProcedure
    .input(AgentIdInput.extend({ id: z.string().min(1), content: z.string() }))
    .mutation(async ({ ctx, input }): Promise<AgentMemoryEntry[]> => {
      return await usecase.patchEntry(ctx, input.agentId, input.id, input.content);
    }),

  remove: protectedProcedure
    .input(AgentIdInput.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<AgentMemoryEntry[]> => {
      return await usecase.removeEntry(ctx, input.agentId, input.id);
    }),
});
