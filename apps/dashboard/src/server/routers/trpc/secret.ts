import { z } from "zod";

import { EnvVarSchema, Secret } from "@/entities";
import {
  CreateSecretInputSchema,
  SecretUseCase,
  UpdateSecretInputSchema,
} from "@/server/usecases/secret";
import { protectedProcedure, t } from "./shared.js";

const usecase = new SecretUseCase();

export const secretRouter = t.router({
  list: protectedProcedure.query(async (): Promise<Secret[]> => {
    return usecase.listSecrets();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }): Promise<Secret | null> => {
      return usecase.getSecret(input.id);
    }),

  create: protectedProcedure
    .input(CreateSecretInputSchema)
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.createSecret(input);
    }),

  update: protectedProcedure
    .input(UpdateSecretInputSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Secret> => {
      const { id, ...patch } = input;
      return usecase.updateSecret(id, patch);
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.archiveSecret(input.id);
    }),

  addEnvVar: protectedProcedure
    .input(z.object({ secretId: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.addEnvVar(input.secretId, input.envVar);
    }),

  updateEnvVar: protectedProcedure
    .input(z.object({ secretId: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.updateEnvVar(input.secretId, input.envVar);
    }),

  removeEnvVar: protectedProcedure
    .input(z.object({ secretId: z.string().min(1), name: z.string().min(1) }))
    .mutation(async ({ input }): Promise<Secret> => {
      return usecase.removeEnvVar(input.secretId, input.name);
    }),
});
