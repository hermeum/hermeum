import { z } from "zod";

import { Context, EnvVar, EnvVarSchema, Secret } from "@/entities";
import { KubernetesClient } from "../infras/kubernetes/client";
import { Runtime } from "./adaptors/runtime";

export const CreateSecretInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  shared: z.boolean().optional(),
});
export type CreateSecretInput = z.infer<typeof CreateSecretInputSchema>;

export const ListSecretsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListSecretsInput = z.infer<typeof ListSecretsFilterSchema>;

export const UpdateSecretInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  shared: z.boolean().optional(),
});
export type UpdateSecretInput = z.infer<typeof UpdateSecretInputSchema>;

export class SecretUseCase {
  constructor(private readonly runtime: Runtime = new KubernetesClient()) {}

  async listSecrets(ctx: Context, input?: ListSecretsInput): Promise<Secret[]> {
    return this.runtime.listSecrets(input);
  }

  async getSecret(ctx: Context, id: string): Promise<Secret | null> {
    return this.runtime.getSecret(id);
  }

  async createSecret(ctx: Context, input: CreateSecretInput): Promise<Secret> {
    return this.runtime.createSecret({ ...input, userId: ctx.user!.id });
  }

  async updateSecret(ctx: Context, id: string, input: UpdateSecretInput): Promise<Secret> {
    const secret = await this.runtime.getSecret(id);
    if (!secret) {
      throw new Error(`Secret "${id}" not found`);
    }
    this.verifyOwnership(ctx, secret);
    return this.runtime.patchSecret(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.shared !== undefined && { shared: input.shared }),
    });
  }

  async archiveSecret(ctx: Context, id: string): Promise<Secret> {
    const secret = await this.runtime.getSecret(id);
    if (!secret) {
      throw new Error(`Secret "${id}" not found`);
    }
    this.verifyOwnership(ctx, secret);
    return this.runtime.archiveSecret(id);
  }

  async addEnvVar(ctx: Context, secretId: string, envVar: EnvVar): Promise<Secret> {
    EnvVarSchema.parse(envVar);
    const secret = await this.runtime.getSecret(secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    this.verifyOwnership(ctx, secret);
    if (secret.envVars.some((e) => e.name === envVar.name)) {
      throw new Error(`Env var "${envVar.name}" already exists in secret "${secretId}"`);
    }
    return this.runtime.addEnvVar(secretId, envVar);
  }

  async updateEnvVar(ctx: Context, secretId: string, envVar: EnvVar): Promise<Secret> {
    EnvVarSchema.parse(envVar);
    const secret = await this.runtime.getSecret(secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    this.verifyOwnership(ctx, secret);
    if (!secret.envVars.some((e) => e.name === envVar.name)) {
      throw new Error(`Env var "${envVar.name}" not found in secret "${secretId}"`);
    }
    return this.runtime.updateEnvVar(secretId, envVar);
  }

  async removeEnvVar(ctx: Context, secretId: string, name: string): Promise<Secret> {
    const secret = await this.runtime.getSecret(secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    this.verifyOwnership(ctx, secret);
    if (!secret.envVars.some((e) => e.name === name)) {
      throw new Error(`Env var "${name}" not found in secret "${secretId}"`);
    }
    return this.runtime.removeEnvVar(secretId, name);
  }

  private verifyOwnership(ctx: Context, resource: { userId: string }): void {
    if (ctx.user!.id !== resource.userId) {
      throw new Error("You don't have permission to perform this action");
    }
  }
}
