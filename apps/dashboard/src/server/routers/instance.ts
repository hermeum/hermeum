import { initTRPC } from "@trpc/server";
import { z } from "zod";

import { Instance, SkillSchema, EnvVarSchema } from "@/entities";
import { InstanceUseCase } from "../usecases/instance";

const usecase = new InstanceUseCase();

const t = initTRPC.create();
export const instanceRouter = t.router({
  list: t.procedure.query(async (): Promise<Instance[]> => {
    return await usecase.listOpenClawInstances();
  }),

  get: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input }): Promise<Instance | null> => {
      return await usecase.getOpenClawInstance(input.name);
    }),

  create: t.procedure
    .input(z.object({ templateName: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.createOpenClawInstanceByTemplate(input.templateName);
    }),

  delete: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }): Promise<void> => {
      return await usecase.deleteOpenClawInstance(input.name);
    }),

  installSkill: t.procedure
    .input(z.object({ instanceName: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.installSkill(input.instanceName, input.skill);
    }),

  uninstallSkill: t.procedure
    .input(z.object({ instanceName: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.uninstallSkill(input.instanceName, input.skill);
    }),

  addEnv: t.procedure
    .input(z.object({ name: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.addEnv(input.name, input.envVar);
    }),

  updateEnv: t.procedure
    .input(z.object({ name: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.updateEnv(input.name, input.envVar);
    }),

  removeEnv: t.procedure
    .input(z.object({ name: z.string().min(1), envName: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.removeEnv(input.name, input.envName);
    }),
});
