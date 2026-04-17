import { EnvVar, Instance, InstanceInput, Secret } from "@/entities";

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
  listOpenClawInstances: () => Promise<Instance[]>;
  getOpenClawInstance: (id: string) => Promise<Instance | null>;
  createOpenClawInstance: (input: CreateOpenClawInstanceInput) => Promise<Instance>;
  patchOpenClawInstance: (input: PatchOpenClawInstanceInput) => Promise<Instance>;
  deleteOpenClawInstance: (id: string) => Promise<void>;

  listSecrets: () => Promise<Secret[]>;
  getSecret: (id: string) => Promise<Secret | null>;
  createSecret: (input: CreateSecretInput) => Promise<Secret>;
  archiveSecret: (id: string) => Promise<Secret>;
  patchSecret: (id: string, patch: SecretPatch) => Promise<Secret>;
  addEnvVar: (id: string, envVar: EnvVar) => Promise<Secret>;
  updateEnvVar: (id: string, envVar: EnvVar) => Promise<Secret>;
  removeEnvVar: (id: string, name: string) => Promise<Secret>;
}
