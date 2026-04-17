import { initTRPC } from "@trpc/server";
import { z } from "zod";

import { Instance, InstanceInputSchema, SkillSchema, EnvVarSchema } from "@/entities";
import { InstanceUseCase } from "../usecases/instance";

const usecase = new InstanceUseCase();

const t = initTRPC.create();
export const instanceRouter = t.router({
  list: t.procedure.query(async (): Promise<Instance[]> => {
    return await usecase.listOpenClawInstances();
  }),

  get: t.procedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }): Promise<Instance | null> => {
      return await usecase.getOpenClawInstance(input.id);
    }),

  create: t.procedure.input(InstanceInputSchema).mutation(async ({ input }): Promise<Instance> => {
    return await usecase.createOpenClawInstance(input);
  }),

  update: t.procedure
    .input(InstanceInputSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      const { id, ...instanceInput } = input;
      return await usecase.updateOpenClawInstance(id, instanceInput);
    }),

  delete: t.procedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<void> => {
      return await usecase.deleteOpenClawInstance(input.id);
    }),

  installSkill: t.procedure
    .input(z.object({ instanceId: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.installSkill(input.instanceId, input.skill);
    }),

  uninstallSkill: t.procedure
    .input(z.object({ instanceId: z.string().min(1), skill: SkillSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.uninstallSkill(input.instanceId, input.skill);
    }),

  addEnv: t.procedure
    .input(z.object({ id: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.addEnv(input.id, input.envVar);
    }),

  updateEnv: t.procedure
    .input(z.object({ id: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.updateEnv(input.id, input.envVar);
    }),

  removeEnv: t.procedure
    .input(z.object({ id: z.string().min(1), envName: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.removeEnv(input.id, input.envName);
    }),

  suspend: t.procedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.suspendOpenClawInstance(input.id);
    }),

  resume: t.procedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Instance> => {
      return await usecase.resumeOpenClawInstance(input.id);
    }),
});
