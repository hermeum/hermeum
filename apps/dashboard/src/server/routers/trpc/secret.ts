import { z } from "zod";

import { EnvVarSchema, Secret } from "@/entities";
import {
  CreateSecretInputSchema,
  ListSecretsFilterSchema,
  SecretUseCase,
  UpdateSecretInputSchema,
} from "@/server/usecases/secret";
import { protectedProcedure, t } from "./shared.js";

const usecase = new SecretUseCase();

export const secretRouter = t.router({
  list: protectedProcedure
    .input(ListSecretsFilterSchema.optional())
    .query(async ({ ctx, input }): Promise<Secret[]> => {
      return usecase.listSecrets(ctx, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<Secret | null> => {
      return usecase.getSecret(ctx, input.id);
    }),

  create: protectedProcedure
    .input(CreateSecretInputSchema)
    .mutation(async ({ ctx, input }): Promise<Secret> => {
      return usecase.createSecret(ctx, input);
    }),

  update: protectedProcedure
    .input(UpdateSecretInputSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Secret> => {
      const { id, ...patch } = input;
      return usecase.updateSecret(ctx, id, patch);
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Secret> => {
      return usecase.archiveSecret(ctx, input.id);
    }),

  addEnvVar: protectedProcedure
    .input(z.object({ secretId: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ ctx, input }): Promise<Secret> => {
      return usecase.addEnvVar(ctx, input.secretId, input.envVar);
    }),

  updateEnvVar: protectedProcedure
    .input(z.object({ secretId: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ ctx, input }): Promise<Secret> => {
      return usecase.updateEnvVar(ctx, input.secretId, input.envVar);
    }),

  removeEnvVar: protectedProcedure
    .input(z.object({ secretId: z.string().min(1), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<Secret> => {
      return usecase.removeEnvVar(ctx, input.secretId, input.name);
    }),
});
