import { z } from "zod";

import { Instance, InstanceInputSchema, SkillSchema, EnvVarSchema } from "@/entities";
import { InstanceUseCase } from "@/server/usecases/instance";
import { protectedProcedure, t } from "./shared.js";

const usecase = new InstanceUseCase();

export const instanceRouter = t.router({
  list: protectedProcedure.query(async ({ ctx }): Promise<Instance[]> => {
    return await usecase.listOpenClawInstances(ctx);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<Instance | null> => {
      return await usecase.getOpenClawInstance(ctx, input.id);
    }),

  create: protectedProcedure.input(InstanceInputSchema).mutation(async ({ ctx, input }): Promise<Instance> => {
    return await usecase.createOpenClawInstance(ctx, input);
  }),

  update: protectedProcedure
    .input(InstanceInputSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Instance> => {
      const { id, ...instanceInput } = input;
      return await usecase.updateOpenClawInstance(ctx, id, instanceInput);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<void> => {
      return await usecase.deleteOpenClawInstance(ctx, input.id);
    }),

  installSkill: protectedProcedure
    .input(z.object({ instanceId: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ ctx, input }): Promise<Instance> => {
      return await usecase.installSkill(ctx, input.instanceId, input.skill);
    }),

  uninstallSkill: protectedProcedure
    .input(z.object({ instanceId: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ ctx, input }): Promise<Instance> => {
      return await usecase.uninstallSkill(ctx, input.instanceId, input.skill);
    }),

  addEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ ctx, input }): Promise<Instance> => {
      return await usecase.addEnv(ctx, input.id, input.envVar);
    }),

  updateEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ ctx, input }): Promise<Instance> => {
      return await usecase.updateEnv(ctx, input.id, input.envVar);
    }),

  removeEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envName: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Instance> => {
      return await usecase.removeEnv(ctx, input.id, input.envName);
    }),

  suspend: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Instance> => {
      return await usecase.suspendOpenClawInstance(ctx, input.id);
    }),

  resume: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Instance> => {
      return await usecase.resumeOpenClawInstance(ctx, input.id);
    }),

  getGatewayToken: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<string | null> => {
      return await usecase.getGatewayToken(ctx, input.id);
    }),
});
