import { z } from "zod";

import { AgentInput, AgentInputObjectSchema } from "@/entities";
import { AgentUseCase, PromptSchema } from "@/server/usecases/agent";

import { protectedProcedure, t } from "./shared.js";

const usecase = new AgentUseCase();

export const agentConfigRouter = t.router({
  create: protectedProcedure
    .input(z.object({ prompt: PromptSchema }))
    .mutation(async ({ ctx, input }): Promise<AgentInput> => {
      return await usecase.generateAgentInput(ctx, input.prompt);
    }),

  update: protectedProcedure
    // AgentInputObjectSchema (no superRefine) so half-finished drafts are accepted.
    .input(z.object({ prompt: PromptSchema, config: AgentInputObjectSchema }))
    .mutation(async ({ ctx, input }): Promise<AgentInput> => {
      return await usecase.reviseAgentInput(ctx, input.config, input.prompt);
    }),
});
