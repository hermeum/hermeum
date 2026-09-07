import { z } from "zod";

import { EnvVarSchema, SharedEnvSet } from "@/entities";
import {
  CreateSharedEnvSetInputSchema,
  ListSharedEnvSetsFilterSchema,
  SharedEnvSetUseCase,
  UpdateSharedEnvSetInputSchema,
} from "@/server/usecases/shared-env-set";
import { protectedProcedure, t } from "./shared.js";

const usecase = new SharedEnvSetUseCase();

export const sharedEnvSetRouter = t.router({
  list: protectedProcedure
    .input(ListSharedEnvSetsFilterSchema.optional())
    .query(async ({ ctx, input }): Promise<SharedEnvSet[]> => {
      return usecase.listSharedEnvSets(ctx, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<SharedEnvSet | null> => {
      return usecase.getSharedEnvSet(ctx, input.id);
    }),

  create: protectedProcedure
    .input(CreateSharedEnvSetInputSchema)
    .mutation(async ({ ctx, input }): Promise<SharedEnvSet> => {
      return usecase.createSharedEnvSet(ctx, input);
    }),

  update: protectedProcedure
    .input(UpdateSharedEnvSetInputSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<SharedEnvSet> => {
      const { id, ...patch } = input;
      return usecase.updateSharedEnvSet(ctx, id, patch);
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<SharedEnvSet> => {
      return usecase.archiveSharedEnvSet(ctx, input.id);
    }),

  addEnvVar: protectedProcedure
    .input(z.object({ setId: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ ctx, input }): Promise<SharedEnvSet> => {
      return usecase.addEnvVar(ctx, input.setId, input.envVar);
    }),

  updateEnvVar: protectedProcedure
    .input(z.object({ setId: z.string().min(1), envVar: EnvVarSchema }))
    .mutation(async ({ ctx, input }): Promise<SharedEnvSet> => {
      return usecase.updateEnvVar(ctx, input.setId, input.envVar);
    }),

  removeEnvVar: protectedProcedure
    .input(z.object({ setId: z.string().min(1), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<SharedEnvSet> => {
      return usecase.removeEnvVar(ctx, input.setId, input.name);
    }),
});
