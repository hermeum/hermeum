import { z } from "zod";

import { Instance, InstanceInputSchema, SkillSchema, EnvVarSchema } from "@/entities";
import { InstanceUseCase } from "@/server/usecases/instance";
import { protectedProcedure, t } from "./shared.js";

const usecase = new InstanceUseCase();

export const instanceRouter = t.router({
  list: protectedProcedure.query(async (): Promise<Instance[]> => {
    return await usecase.listOpenClawInstances();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }): Promise<Instance | null> => {
      return await usecase.getOpenClawInstance(input.id);
    }),

  create: protectedProcedure.input(InstanceInputSchema).mutation(async ({ input }): Promise<Instance> => {
    return await usecase.createOpenClawInstance(input);
  }),

  update: protectedProcedure
    .input(InstanceInputSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      const { id, ...instanceInput } = input;
      return await usecase.updateOpenClawInstance(id, instanceInput);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<void> => {
      return await usecase.deleteOpenClawInstance(input.id);
    }),

  installSkill: protectedProcedure
    .input(z.object({ instanceId: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.installSkill(input.instanceId, input.skill);
    }),

  uninstallSkill: protectedProcedure
    .input(z.object({ instanceId: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.uninstallSkill(input.instanceId, input.skill);
    }),

  addEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.addEnv(input.id, input.envVar);
    }),

  updateEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.updateEnv(input.id, input.envVar);
    }),

  removeEnv: protectedProcedure
    .input(z.object({ id: z.string().min(1), envName: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.removeEnv(input.id, input.envName);
    }),

  suspend: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.suspendOpenClawInstance(input.id);
    }),

  resume: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.resumeOpenClawInstance(input.id);
    }),
});
