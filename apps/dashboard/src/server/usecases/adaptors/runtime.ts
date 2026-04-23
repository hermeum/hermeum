import { Context, EnvVar, Instance, InstanceInput, Secret } from "@/entities";

export type CreateOpenClawInstanceInput = InstanceInput;
export type PatchOpenClawInstanceInput = {
  id: string;
  patch: Partial<Omit<Instance, "id" | "phase" | "createdAt">>;
};

export type CreateSecretInput = {
  name: string;
  description?: string | undefined;
};
export type SecretPatch = {
  name?: string | undefined;
  description?: string | undefined;
  archived?: boolean | undefined;
};

export interface Runtime {
  listOpenClawInstances: (ctx: Context) => Promise<Instance[]>;
  getOpenClawInstance: (ctx: Context, id: string) => Promise<Instance | null>;
  createOpenClawInstance: (ctx: Context, input: CreateOpenClawInstanceInput) => Promise<Instance>;
  patchOpenClawInstance: (ctx: Context, input: PatchOpenClawInstanceInput) => Promise<Instance>;
  deleteOpenClawInstance: (ctx: Context, id: string) => Promise<void>;

  listSecrets: (ctx: Context) => Promise<Secret[]>;
  getSecret: (ctx: Context, id: string) => Promise<Secret | null>;
  createSecret: (ctx: Context, input: CreateSecretInput) => Promise<Secret>;
  archiveSecret: (ctx: Context, id: string) => Promise<Secret>;
  patchSecret: (ctx: Context, id: string, patch: SecretPatch) => Promise<Secret>;
  addEnvVar: (ctx: Context, id: string, envVar: EnvVar) => Promise<Secret>;
  updateEnvVar: (ctx: Context, id: string, envVar: EnvVar) => Promise<Secret>;
  removeEnvVar: (ctx: Context, id: string, name: string) => Promise<Secret>;
}
