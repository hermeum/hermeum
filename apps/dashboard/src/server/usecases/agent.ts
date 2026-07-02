import Handlebars from "handlebars";

import {
  Agent,
  AgentInput,
  AgentInputSchema,
  Context,
  JsonPatchOp,
  Skill,
  SkillSchema,
  WebhookVariables,
} from "@/entities";

import { KubernetesClient } from "../infras/kubernetes/client";
import { LocalConfig } from "../infras/local-agent-config";
import { Runtime } from "./adaptors/runtime";
import { ConfigAdaptor } from "./adaptors/config";

export class AgentUseCase {
  constructor(
    private readonly runtime: Runtime = new KubernetesClient(),
    private readonly config: ConfigAdaptor = new LocalConfig()
  ) {}

  getmutatingWebhookJsonPatch(agent: Agent): JsonPatchOp[] | null {
    if (!agent.type) return null;
    const { agentTypes } = this.config.get();
    const agentType = agentTypes?.[agent.type];
    if (!agentType) return null;
    return this.substituteVariables(agentType.mutatingWebhookJsonPatch, agent);
  }

  private substituteVariables(patch: JsonPatchOp[], agent: Agent): JsonPatchOp[] {
    const vars: WebhookVariables = {
      agentId: agent.id,
      userId: agent.userId,
      agentName: agent.name ?? "",
      agentDescription: agent.description ?? "",
      agentType: agent.type ?? "",
    };

    const substituteValue = (v: unknown): unknown => {
      const json = JSON.stringify(v);
      const substituted = Handlebars.compile(json, { noEscape: true })(vars);
      return JSON.parse(substituted);
    };

    return patch.map((op) => ({
      ...op,
      ...(op.value !== undefined && { value: substituteValue(op.value) }),
    }));
  }

  async listHermesAgents(ctx: Context): Promise<Agent[]> {
    return this.runtime.listHermesAgents();
  }

  async getHermesAgent(ctx: Context, id: string): Promise<Agent | null> {
    return this.runtime.getHermesAgent(id);
  }

  async createHermesAgent(ctx: Context, agentInput: AgentInput): Promise<Agent> {
    agentInput = AgentInputSchema.parse(agentInput);

    if (agentInput.type !== undefined) {
      this.checkAgentTypeAllowed(agentInput.type);
    }
    await this.checkSecretsAccessible(ctx, agentInput.secrets);
    return this.runtime.createHermesAgent({ ...agentInput, userId: ctx.user!.id });
  }

  async updateHermesAgent(ctx: Context, id: string, patch: AgentInput): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      throw new Error(`HermesAgent ${id} not found`);
    }
    this.verifyOwnership(ctx, agent);

    patch = AgentInputSchema.parse(patch);

    if (patch.type !== undefined) {
      this.checkAgentTypeAllowed(patch.type);
    }
    await this.checkSecretsAccessible(ctx, patch.secrets);
    return this.runtime.patchHermesAgent({ id, patch });
  }

  async deleteHermesAgent(ctx: Context, id: string): Promise<void> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      throw new Error(`HermesAgent ${id} not found`);
    }
    this.verifyOwnership(ctx, agent);
    return this.runtime.deleteHermesAgent(id);
  }

  async installSkill(ctx: Context, agentId: string, skill: Skill): Promise<Agent> {
    SkillSchema.parse(skill);

    const agent = await this.runtime.getHermesAgent(agentId);
    if (!agent) {
      throw new Error(`HermesAgent "${agentId}" not found`);
    }
    this.verifyOwnership(ctx, agent);
    const current = agent.skills ?? [];
    if (current.includes(skill)) {
      throw new Error(`Skill "${skill}" is already installed on agent "${agentId}"`);
    }
    if (current.length >= 20) {
      throw new Error("Agent already has the maximum of 20 skills");
    }
    return this.runtime.patchHermesAgent({
      id: agentId,
      patch: { skills: [...current, skill] },
    });
  }

  async uninstallSkill(ctx: Context, agentId: string, skill: Skill): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(agentId);
    if (!agent) {
      throw new Error(`HermesAgent "${agentId}" not found`);
    }
    this.verifyOwnership(ctx, agent);
    const current = agent.skills ?? [];
    if (!current.includes(skill)) {
      throw new Error(`Skill "${skill}" is not installed on agent "${agentId}"`);
    }
    return this.runtime.patchHermesAgent({
      id: agentId,
      patch: { skills: current.filter((s) => s !== skill) },
    });
  }

  private async checkSecretsAccessible(ctx: Context, secrets: string[] | undefined): Promise<void> {
    for (const name of secrets ?? []) {
      const secret = await this.runtime.getSecret(name);
      if (!secret || (secret.userId !== ctx.user!.id && !secret.shared)) {
        throw new Error(`Secret "${name}" not found`);
      }
      if (secret.archived) {
        throw new Error(`Secret "${name}" is archived`);
      }
    }
  }

  async suspendHermesAgent(ctx: Context, id: string): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      throw new Error(`HermesAgent ${id} not found`);
    }
    this.verifyOwnership(ctx, agent);
    return this.runtime.patchHermesAgent({ id, patch: { suspended: true } });
  }

  async resumeHermesAgent(ctx: Context, id: string): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      throw new Error(`HermesAgent ${id} not found`);
    }
    this.verifyOwnership(ctx, agent);
    return this.runtime.patchHermesAgent({ id, patch: { suspended: false } });
  }

  async getGatewayToken(ctx: Context, agentId: string): Promise<string | null> {
    const agent = await this.runtime.getHermesAgent(agentId);
    if (!agent) {
      throw new Error(`HermesAgent ${agentId} not found`);
    }
    this.verifyOwnership(ctx, agent);
    return this.runtime.getGatewayToken(agentId);
  }

  private checkAgentTypeAllowed(agentType: string): void {
    const { agentTypes } = this.config.get();
    if (!agentTypes) {
      throw new Error("Agent types are not configured");
    }
    if (!(agentType in agentTypes)) {
      throw new Error(`Agent type "${agentType}" is not configured`);
    }
  }

  private verifyOwnership(ctx: Context, resource: { userId: string }): void {
    if (ctx.user!.id !== resource.userId) {
      throw new Error("You don't have permission to perform this action");
    }
  }
}
