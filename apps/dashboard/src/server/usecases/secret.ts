import { z } from "zod";

import { Context, EnvVar, EnvVarSchema, Secret } from "@/entities";
import { KubernetesClient } from "../infras/kubernetes/client";
import { Runtime } from "./adaptors/runtime";

export const CreateSecretInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreateSecretInput = z.infer<typeof CreateSecretInputSchema>;

export const UpdateSecretInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type UpdateSecretInput = z.infer<typeof UpdateSecretInputSchema>;

export class SecretUseCase {
  constructor(private readonly runtime: Runtime = new KubernetesClient("kubeclaw")) {}

  async listSecrets(ctx: Context): Promise<Secret[]> {
    return this.runtime.listSecrets(ctx);
  }

  async getSecret(ctx: Context, id: string): Promise<Secret | null> {
    return this.runtime.getSecret(ctx, id);
  }

  async createSecret(ctx: Context, input: CreateSecretInput): Promise<Secret> {
    return this.runtime.createSecret(ctx, input);
  }

  async updateSecret(ctx: Context, id: string, input: UpdateSecretInput): Promise<Secret> {
    const secret = await this.runtime.getSecret(ctx, id);
    if (!secret) {
      throw new Error(`Secret "${id}" not found`);
    }
    return this.runtime.patchSecret(ctx, id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
    });
  }

  async archiveSecret(ctx: Context, id: string): Promise<Secret> {
    const secret = await this.runtime.getSecret(ctx, id);
    if (!secret) {
      throw new Error(`Secret "${id}" not found`);
    }
    return this.runtime.archiveSecret(ctx, id);
  }

  async addEnvVar(ctx: Context, secretId: string, envVar: EnvVar): Promise<Secret> {
    EnvVarSchema.parse(envVar);
    const secret = await this.runtime.getSecret(ctx, secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    if (secret.envVars.some((e) => e.name === envVar.name)) {
      throw new Error(`Env var "${envVar.name}" already exists in secret "${secretId}"`);
    }
    return this.runtime.addEnvVar(ctx, secretId, envVar);
  }

  async updateEnvVar(ctx: Context, secretId: string, envVar: EnvVar): Promise<Secret> {
    EnvVarSchema.parse(envVar);
    const secret = await this.runtime.getSecret(ctx, secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    if (!secret.envVars.some((e) => e.name === envVar.name)) {
      throw new Error(`Env var "${envVar.name}" not found in secret "${secretId}"`);
    }
    return this.runtime.updateEnvVar(ctx, secretId, envVar);
  }

  async removeEnvVar(ctx: Context, secretId: string, name: string): Promise<Secret> {
    const secret = await this.runtime.getSecret(ctx, secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    if (!secret.envVars.some((e) => e.name === name)) {
      throw new Error(`Env var "${name}" not found in secret "${secretId}"`);
    }
    return this.runtime.removeEnvVar(ctx, secretId, name);
  }
}
