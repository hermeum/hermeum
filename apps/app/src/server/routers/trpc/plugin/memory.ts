import { z } from "zod";

import { AgentMemoryEntrySchema } from "@/entities";
import {
  AgentMemoryAddInputSchema,
  AgentMemoryBatchInputSchema,
  AgentMemoryPatchInputSchema,
  AgentMemoryRemoveInputSchema,
  AgentMemoryResultSchema,
  AgentMemoryUseCase,
} from "@/server/usecases/agent-memory";

import { t, tokenProtectedProcedure } from "./shared.js";

// Hermeum-managed agent memory over the plugin protocol, authenticated by the
// per-agent ingest token (tokenProtectedProcedure resolves the agent from the
// Authorization bearer token). The hermeum plugin's MemoryProvider mirrors
// hermes-agent's native memory tool onto these procedures: add / patch /
// remove, plus the atomic `operations` batch. `read` feeds the provider's
// prefetch (the native frozen-snapshot analog) and the future operator UI.
// Operation inputs and result payloads live in the use case (the same boundary
// as ListAgentsFilterSchema in the resources routers).

const usecase = new AgentMemoryUseCase();

const AgentMemoryReadResultSchema = z.object({
  entries: z.array(AgentMemoryEntrySchema),
});

export const agentMemoryRouter = t.router({
  read: tokenProtectedProcedure
    .output(AgentMemoryReadResultSchema)
    .query(async ({ ctx }) => ({ entries: await usecase.read(ctx.agentId) })),

  add: tokenProtectedProcedure
    .input(AgentMemoryAddInputSchema)
    .output(AgentMemoryResultSchema)
    .mutation(async ({ ctx, input }) => await usecase.add(ctx.agentId, input)),

  patch: tokenProtectedProcedure
    .input(AgentMemoryPatchInputSchema)
    .output(AgentMemoryResultSchema)
    .mutation(async ({ ctx, input }) => await usecase.patch(ctx.agentId, input)),

  remove: tokenProtectedProcedure
    .input(AgentMemoryRemoveInputSchema)
    .output(AgentMemoryResultSchema)
    .mutation(async ({ ctx, input }) => await usecase.remove(ctx.agentId, input)),

  batch: tokenProtectedProcedure
    .input(AgentMemoryBatchInputSchema)
    .output(AgentMemoryResultSchema)
    .mutation(async ({ ctx, input }) => await usecase.batch(ctx.agentId, input)),
});

export type AgentMemoryRouter = typeof agentMemoryRouter;
