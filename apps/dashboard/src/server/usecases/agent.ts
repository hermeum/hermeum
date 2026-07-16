import { z } from "zod";

import { Agent, AgentInput, AgentInputSchema, Context, Env, JsonPatchOp } from "@/entities";

import { KubernetesClient } from "../infras/kubernetes/client";
import { FileAdaptor } from "./adaptors/file";
import { Runtime } from "./adaptors/runtime";
import { FilesUseCase, HermeumConfigLoadable } from "./mixin";
import { verifyOwnership } from "./authz";

export const ListAgentsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListAgentsFilter = z.infer<typeof ListAgentsFilterSchema>;

export class AgentUseCase extends HermeumConfigLoadable(FilesUseCase) {
  constructor(
    private readonly runtime: Runtime = new KubernetesClient(),
    files?: FileAdaptor
  ) {
    super(files);
  }

  async getmutatingWebhookJsonPatch(agent: Agent): Promise<JsonPatchOp[] | null> {
    if (!agent.type) return null;
    const { agentTypes } = await this.loadHermeumConfig();
    const agentType = agentTypes?.[agent.type];
    if (!agentType) return null;
    return agentType.mutatingWebhookJsonPatch;
  }

  async listHermesAgents(ctx: Context, input?: ListAgentsFilter): Promise<Agent[]> {
    return this.runtime.listHermesAgents(input);
  }

  async getHermesAgent(ctx: Context, id: string): Promise<Agent | null> {
    return this.runtime.getHermesAgent(id);
  }

  async createHermesAgent(ctx: Context, agentInput: AgentInput): Promise<Agent> {
    agentInput = AgentInputSchema.parse(agentInput);

    await this.checkAgentInputAllowed(agentInput);
    return this.runtime.createHermesAgent({ ...agentInput, userId: ctx.user!.id });
  }

  async updateHermesAgent(ctx: Context, id: string, patch: AgentInput): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      throw new Error(`HermesAgent ${id} not found`);
    }
    verifyOwnership(ctx, agent);

    patch = AgentInputSchema.parse(patch);

    await this.checkAgentInputAllowed(patch);
    if (patch.env !== undefined) {
      this.checkEnvSensitivityNotDowngraded(agent.env, patch.env);
    }
    return this.runtime.patchHermesAgent({ id, patch });
  }

  private checkEnvSensitivityNotDowngraded(existingEnv: Env, patchEnv: Env): void {
    const existingByName = new Map((existingEnv ?? []).map((v) => [v.name, v]));
    for (const v of patchEnv ?? []) {
      const prev = existingByName.get(v.name);
      if (prev?.sensitive && !v.sensitive) {
        throw new Error(`Env var "${v.name}" is sensitive and cannot be marked as non-sensitive`);
      }
    }
  }

  async archiveHermesAgent(ctx: Context, id: string): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      throw new Error(`HermesAgent ${id} not found`);
    }
    verifyOwnership(ctx, agent);
    return this.runtime.archiveHermesAgent(id);
  }

  async suspendHermesAgent(ctx: Context, id: string): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      throw new Error(`HermesAgent ${id} not found`);
    }
    verifyOwnership(ctx, agent);
    return this.runtime.patchHermesAgent({ id, patch: { suspended: true } });
  }

  async resumeHermesAgent(ctx: Context, id: string): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      throw new Error(`HermesAgent ${id} not found`);
    }
    verifyOwnership(ctx, agent);
    return this.runtime.patchHermesAgent({ id, patch: { suspended: false } });
  }

  async getGatewayToken(ctx: Context, agentId: string): Promise<string | null> {
    const agent = await this.runtime.getHermesAgent(agentId);
    if (!agent) {
      throw new Error(`HermesAgent ${agentId} not found`);
    }
    verifyOwnership(ctx, agent);
    return this.runtime.getGatewayToken(agentId);
  }

  private async checkAgentInputAllowed(
    input: Pick<AgentInput, "type" | "sharedEnvSets">
  ): Promise<void> {
    if (input.type !== undefined) {
      const { agentTypes } = await this.loadHermeumConfig();
      if (!agentTypes) {
        throw new Error("Agent types are not configured");
      }
      if (!(input.type in agentTypes)) {
        throw new Error(`Agent type "${input.type}" is not configured`);
      }
    }
    for (const id of input.sharedEnvSets ?? []) {
      const envSet = await this.runtime.getSharedEnvSet(id);
      if (!envSet) {
        throw new Error(`Shared env set "${id}" not found`);
      }
      if (envSet.archived) {
        throw new Error(`Shared env set "${id}" is archived`);
      }
    }
  }
}
