import { Agent, AgentInput, EnvVar, SharedEnvSet } from "@/entities";

export type ListAgentsFilter = { archived?: boolean | undefined };
export type CreateAgentInput = AgentInput & { userId: string };
export type PatchAgentInput = {
  id: string;
  patch: Partial<Omit<Agent, "id" | "userId" | "phase" | "createdAt">>;
};

export type ListSharedEnvSetsFilter = { archived?: boolean | undefined };
export type CreateSharedEnvSetInput = Pick<SharedEnvSet, "userId" | "name" | "description">;
export type SharedEnvSetPatch = Partial<Pick<SharedEnvSet, "name" | "description" | "archived">>;

export interface Runtime {
  listHermesAgents: (params?: ListAgentsFilter) => Promise<Agent[]>;
  getHermesAgent: (id: string) => Promise<Agent | null>;
  createHermesAgent: (input: CreateAgentInput) => Promise<Agent>;
  patchHermesAgent: (input: PatchAgentInput) => Promise<Agent>;
  archiveHermesAgent: (id: string) => Promise<Agent>;

  getGatewayToken: (agentId: string) => Promise<string | null>;

  listSharedEnvSets: (params?: ListSharedEnvSetsFilter) => Promise<SharedEnvSet[]>;
  getSharedEnvSet: (id: string) => Promise<SharedEnvSet | null>;
  createSharedEnvSet: (input: CreateSharedEnvSetInput) => Promise<SharedEnvSet>;
  archiveSharedEnvSet: (id: string) => Promise<SharedEnvSet>;
  patchSharedEnvSet: (id: string, patch: SharedEnvSetPatch) => Promise<SharedEnvSet>;
  addEnvVar: (id: string, envVar: EnvVar) => Promise<SharedEnvSet>;
  updateEnvVar: (id: string, envVar: EnvVar) => Promise<SharedEnvSet>;
  removeEnvVar: (id: string, name: string) => Promise<SharedEnvSet>;
}
