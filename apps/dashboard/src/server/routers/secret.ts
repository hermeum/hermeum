import { initTRPC } from "@trpc/server";
import { z } from "zod";

import { EnvVarSchema, Secret } from "@/entities";
import {
  CreateSecretInputSchema,
  SecretUseCase,
  UpdateSecretInputSchema,
} from "../usecases/secret";

const usecase = new SecretUseCase();

const t = initTRPC.create();
export const secretRouter = t.router({
  list: t.procedure.query(async (): Promise<Secret[]> => {
    return usecase.listSecrets();
  }),

  get: t.procedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }): Promise<Secret | null> => {
      return usecase.getSecret(input.id);
    }),

  create: t.procedure
    .input(CreateSecretInputSchema)
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.createSecret(input);
    }),

  update: t.procedure
    .input(UpdateSecretInputSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Secret> => {
      const { id, ...patch } = input;
      return usecase.updateSecret(id, patch);
    }),

  delete: t.procedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<void> => {
      return usecase.deleteSecret(input.id);
    }),

  addEnvVar: t.procedure
    .input(z.object({ secretId: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.addEnvVar(input.secretId, input.envVar);
    }),

  updateEnvVar: t.procedure
    .input(z.object({ secretId: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.updateEnvVar(input.secretId, input.envVar);
    }),

  removeEnvVar: t.procedure
    .input(z.object({ secretId: z.string().min(1), name: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.removeEnvVar(input.secretId, input.name);
    }),
});
