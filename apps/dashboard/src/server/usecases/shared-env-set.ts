import { z } from "zod";

import { Context, EnvVar, EnvVarSchema, SharedEnvSet } from "@/entities";
import { KubernetesClient } from "../infras/kubernetes/client";
import { Runtime } from "./adaptors/runtime";
import { verifyOwnership } from "./authz";

export const CreateSharedEnvSetInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreateSharedEnvSetInput = z.infer<typeof CreateSharedEnvSetInputSchema>;

export const ListSharedEnvSetsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListSharedEnvSetsInput = z.infer<typeof ListSharedEnvSetsFilterSchema>;

export const UpdateSharedEnvSetInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type UpdateSharedEnvSetInput = z.infer<typeof UpdateSharedEnvSetInputSchema>;

export class SharedEnvSetUseCase {
  constructor(private readonly runtime: Runtime = new KubernetesClient()) {}

  async listSharedEnvSets(ctx: Context, input?: ListSharedEnvSetsInput): Promise<SharedEnvSet[]> {
    return this.runtime.listSharedEnvSets(input);
  }

  async getSharedEnvSet(ctx: Context, id: string): Promise<SharedEnvSet | null> {
    return this.runtime.getSharedEnvSet(id);
  }

  async createSharedEnvSet(ctx: Context, input: CreateSharedEnvSetInput): Promise<SharedEnvSet> {
    return this.runtime.createSharedEnvSet({ ...input, userId: ctx.user!.id });
  }

  async updateSharedEnvSet(
    ctx: Context,
    id: string,
    input: UpdateSharedEnvSetInput
  ): Promise<SharedEnvSet> {
    const envSet = await this.runtime.getSharedEnvSet(id);
    if (!envSet) {
      throw new Error(`Shared env set "${id}" not found`);
    }
    verifyOwnership(ctx, envSet);
    return this.runtime.patchSharedEnvSet(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
    });
  }

  async archiveSharedEnvSet(ctx: Context, id: string): Promise<SharedEnvSet> {
    const envSet = await this.runtime.getSharedEnvSet(id);
    if (!envSet) {
      throw new Error(`Shared env set "${id}" not found`);
    }
    verifyOwnership(ctx, envSet);
    return this.runtime.archiveSharedEnvSet(id);
  }

  async addEnvVar(ctx: Context, setId: string, envVar: EnvVar): Promise<SharedEnvSet> {
    EnvVarSchema.parse(envVar);
    const envSet = await this.runtime.getSharedEnvSet(setId);
    if (!envSet) {
      throw new Error(`Shared env set "${setId}" not found`);
    }
    verifyOwnership(ctx, envSet);
    if (envSet.envVars.some((e) => e.name === envVar.name)) {
      throw new Error(`Env var "${envVar.name}" already exists in shared env set "${setId}"`);
    }
    return this.runtime.addEnvVar(setId, envVar);
  }

  async updateEnvVar(ctx: Context, setId: string, envVar: EnvVar): Promise<SharedEnvSet> {
    EnvVarSchema.parse(envVar);
    const envSet = await this.runtime.getSharedEnvSet(setId);
    if (!envSet) {
      throw new Error(`Shared env set "${setId}" not found`);
    }
    verifyOwnership(ctx, envSet);
    if (!envSet.envVars.some((e) => e.name === envVar.name)) {
      throw new Error(`Env var "${envVar.name}" not found in shared env set "${setId}"`);
    }
    return this.runtime.updateEnvVar(setId, envVar);
  }

  async removeEnvVar(ctx: Context, setId: string, name: string): Promise<SharedEnvSet> {
    const envSet = await this.runtime.getSharedEnvSet(setId);
    if (!envSet) {
      throw new Error(`Shared env set "${setId}" not found`);
    }
    verifyOwnership(ctx, envSet);
    if (!envSet.envVars.some((e) => e.name === name)) {
      throw new Error(`Env var "${name}" not found in shared env set "${setId}"`);
    }
    return this.runtime.removeEnvVar(setId, name);
  }
}
