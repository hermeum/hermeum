import { z } from "zod";

import { EnvVar, EnvVarSchema, Secret } from "@/entities";
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

  async listSecrets(): Promise<Secret[]> {
    return this.runtime.listSecrets();
  }

  async getSecret(id: string): Promise<Secret | null> {
    return this.runtime.getSecret(id);
  }

  async createSecret(input: CreateSecretInput): Promise<Secret> {
    return this.runtime.createSecret(input);
  }

  async updateSecret(id: string, input: UpdateSecretInput): Promise<Secret> {
    const secret = await this.runtime.getSecret(id);
    if (!secret) {
      throw new Error(`Secret "${id}" not found`);
    }
    return this.runtime.patchSecret(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
    });
  }

  async deleteSecret(id: string): Promise<void> {
    const secret = await this.runtime.getSecret(id);
    if (!secret) {
      throw new Error(`Secret "${id}" not found`);
    }
    return this.runtime.deleteSecret(id);
  }

  async addEnvVar(secretId: string, envVar: EnvVar): Promise<Secret> {
    EnvVarSchema.parse(envVar);
    const secret = await this.runtime.getSecret(secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    if (secret.envVars.some((e) => e.name === envVar.name)) {
      throw new Error(`Env var "${envVar.name}" already exists in secret "${secretId}"`);
    }
    return this.runtime.addEnvVar(secretId, envVar);
  }

  async updateEnvVar(secretId: string, envVar: EnvVar): Promise<Secret> {
    EnvVarSchema.parse(envVar);
    const secret = await this.runtime.getSecret(secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    if (!secret.envVars.some((e) => e.name === envVar.name)) {
      throw new Error(`Env var "${envVar.name}" not found in secret "${secretId}"`);
    }
    return this.runtime.updateEnvVar(secretId, envVar);
  }

  async removeEnvVar(secretId: string, name: string): Promise<Secret> {
    const secret = await this.runtime.getSecret(secretId);
    if (!secret) {
      throw new Error(`Secret "${secretId}" not found`);
    }
    if (!secret.envVars.some((e) => e.name === name)) {
      throw new Error(`Env var "${name}" not found in secret "${secretId}"`);
    }
    return this.runtime.removeEnvVar(secretId, name);
  }
}
