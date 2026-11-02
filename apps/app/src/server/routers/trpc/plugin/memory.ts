import { z } from "zod";

import { AgentMemoryEntrySchema } from "@/entities";
import { AgentMemoryUseCase } from "@/server/usecases/agent-memory";

import { t, tokenProtectedProcedure } from "./shared.js";

// Hermeum-managed agent memory over the plugin protocol, authenticated by the
// per-agent ingest token. Read-only: the hermeum plugin's MemoryProvider uses
// it for prefetch — memory is operator-authored context, and no agent-facing
// path can write it. Operator writes live in the resources router
// (agentMemory.add / patch / remove), ownership-guarded.

const usecase = new AgentMemoryUseCase();

const AgentMemoryReadResultSchema = z.object({
  entries: z.array(AgentMemoryEntrySchema),
});

export const agentMemoryRouter = t.router({
  read: tokenProtectedProcedure
    .output(AgentMemoryReadResultSchema)
    .query(async ({ ctx }) => ({ entries: await usecase.readForAgent(ctx.agentId) })),
});

export type AgentMemoryRouter = typeof agentMemoryRouter;
