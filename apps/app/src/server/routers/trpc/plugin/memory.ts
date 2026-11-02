import { z } from "zod";

import { AgentMemoryEntrySchema } from "@/entities";
import {
  AgentMemoryBatchInputSchema,
  AgentMemoryResultSchema,
  AgentMemoryUseCase,
} from "@/server/usecases/agent-memory";

import { t, tokenProtectedProcedure } from "./shared.js";

// Hermeum-managed agent memory over the plugin protocol, authenticated by the
// per-agent ingest token (tokenProtectedProcedure resolves the agent from the
// Authorization bearer token). The hermeum plugin's MemoryProvider mirrors
// hermes-agent's native memory tool onto these procedures: `batch` applies the
// add / patch / remove operations atomically (a drifted single-op tool call is
// translated into a one-op batch by the plugin), and `read` feeds the
// provider's prefetch (the native frozen-snapshot analog) and the future
// operator UI. Operation inputs and result payloads live in the use case (the
// same boundary as ListAgentsFilterSchema in the resources routers).

const usecase = new AgentMemoryUseCase();

const AgentMemoryReadResultSchema = z.object({
  entries: z.array(AgentMemoryEntrySchema),
});

export const agentMemoryRouter = t.router({
  read: tokenProtectedProcedure
    .output(AgentMemoryReadResultSchema)
    .query(async ({ ctx }) => ({ entries: await usecase.read(ctx.agentId) })),

  batch: tokenProtectedProcedure
    .input(AgentMemoryBatchInputSchema)
    .output(AgentMemoryResultSchema)
    .mutation(async ({ ctx, input }) => await usecase.batch(ctx.agentId, input)),
});

export type AgentMemoryRouter = typeof agentMemoryRouter;
