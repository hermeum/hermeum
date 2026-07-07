import { z } from "zod";

import { AgentInput, AgentInputObjectSchema } from "@/entities";
import {
  AgentConfigGeneratorUseCase,
  PromptSchema,
} from "@/server/usecases/agent-config-generator";

import { protectedProcedure, t } from "./shared.js";

const usecase = new AgentConfigGeneratorUseCase();

export const agentConfigRouter = t.router({
  create: protectedProcedure
    .input(z.object({ prompt: PromptSchema }))
    .mutation(async ({ ctx, input }): Promise<AgentInput> => {
      return await usecase.create(ctx, input.prompt);
    }),

  update: protectedProcedure
    // AgentInputObjectSchema (no superRefine) so half-finished drafts are accepted.
    .input(z.object({ prompt: PromptSchema, config: AgentInputObjectSchema }))
    .mutation(async ({ ctx, input }): Promise<AgentInput> => {
      return await usecase.update(ctx, input.config, input.prompt);
    }),
});
