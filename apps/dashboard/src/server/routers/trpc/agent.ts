import { z } from "zod";

import { Agent, AgentInputSchema, SkillSchema, EnvVarSchema } from "@/entities";
import { AgentUseCase } from "@/server/usecases/agent";
import { protectedProcedure, t } from "./shared.js";

const usecase = new AgentUseCase();

export const agentRouter = t.router({
  list: protectedProcedure.query(async ({ ctx }): Promise<Agent[]> => {
    return await usecase.listHermesAgents(ctx);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<Agent | null> => {
      return await usecase.getHermesAgent(ctx, input.id);
    }),

  create: protectedProcedure.input(AgentInputSchema).mutation(async ({ ctx, input }): Promise<Agent> => {
    return await usecase.createHermesAgent(ctx, input);
  }),

  update: protectedProcedure
    .input(AgentInputSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Agent> => {
      const { id, ...agentInput } = input;
      return await usecase.updateHermesAgent(ctx, id, agentInput);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<void> => {
      return await usecase.deleteHermesAgent(ctx, input.id);
    }),

  installSkill: protectedProcedure
    .input(z.object({ agentId: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ ctx, input }): Promise<Agent> => {
      return await usecase.installSkill(ctx, input.agentId, input.skill);
    }),

  uninstallSkill: protectedProcedure
    .input(z.object({ agentId: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ ctx, input }): Promise<Agent> => {
      return await usecase.uninstallSkill(ctx, input.agentId, input.skill);
    }),

  addEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ ctx, input }): Promise<Agent> => {
      return await usecase.addEnv(ctx, input.id, input.envVar);
    }),

  updateEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ ctx, input }): Promise<Agent> => {
      return await usecase.updateEnv(ctx, input.id, input.envVar);
    }),

  removeEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envName: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Agent> => {
      return await usecase.removeEnv(ctx, input.id, input.envName);
    }),

  suspend: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Agent> => {
      return await usecase.suspendHermesAgent(ctx, input.id);
    }),

  resume: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Agent> => {
      return await usecase.resumeHermesAgent(ctx, input.id);
    }),

  getGatewayToken: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<string | null> => {
      return await usecase.getGatewayToken(ctx, input.id);
    }),
});
