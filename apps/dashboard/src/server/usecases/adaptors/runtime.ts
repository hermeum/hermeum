import { Agent, AgentInput, EnvVar, Secret } from "@/entities";

export type CreateAgentInput = AgentInput & { userId: string };
export type PatchAgentInput = {
  id: string;
  patch: Partial<Omit<Agent, "id" | "userId" | "phase" | "createdAt">>;
};

export type CreateSecretInput = Pick<Secret, "userId" | "name" | "description">;
export type SecretPatch = Partial<Pick<Secret, "name" | "description" | "archived">>;
export type ListSecretsFilter = { archived?: boolean | undefined };

export interface Runtime {
  listHermesAgents: () => Promise<Agent[]>;
  getHermesAgent: (id: string) => Promise<Agent | null>;
  createHermesAgent: (input: CreateAgentInput) => Promise<Agent>;
  patchHermesAgent: (input: PatchAgentInput) => Promise<Agent>;
  deleteHermesAgent: (id: string) => Promise<void>;

  getGatewayToken: (agentId: string) => Promise<string | null>;

  listSecrets: (params?: ListSecretsFilter) => Promise<Secret[]>;
  getSecret: (id: string) => Promise<Secret | null>;
  createSecret: (input: CreateSecretInput) => Promise<Secret>;
  archiveSecret: (id: string) => Promise<Secret>;
  patchSecret: (id: string, patch: SecretPatch) => Promise<Secret>;
  addEnvVar: (id: string, envVar: EnvVar) => Promise<Secret>;
  updateEnvVar: (id: string, envVar: EnvVar) => Promise<Secret>;
  removeEnvVar: (id: string, name: string) => Promise<Secret>;
}
