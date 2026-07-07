import Handlebars from "handlebars";
import { z } from "zod";

import {
  Agent,
  AgentEnvVar,
  AgentInput,
  AgentInputObjectSchema,
  AgentInputSchema,
  Context,
  ENV_PLACEHOLDER_SENTINEL,
  ENV_SECRET_SENTINEL,
  Env,
  JsonPatchOp,
  Skill,
  SkillSchema,
  WebhookVariables,
} from "@/entities";

import { AiSdkGenerator } from "../infras/ai-sdk";
import { KubernetesClient } from "../infras/kubernetes/client";
import { LocalConfig } from "../infras/local-hermeum-config";
import { AiGenerator } from "./adaptors/generator";
import { Runtime } from "./adaptors/runtime";
import { ConfigAdaptor } from "./adaptors/config";

export const ListAgentsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListAgentsFilter = z.infer<typeof ListAgentsFilterSchema>;

export const PromptSchema = z.string().min(1).max(4000);
export type Prompt = z.infer<typeof PromptSchema>;

// Field semantics live in the output schema's .describe() texts; this prompt
// only carries the task framing and cross-field rules.
export const AGENT_INPUT_SYSTEM_PROMPT = `You generate Hermes agent definitions — a JSON
object that prefills the form for an autonomous Hermes agent deployed to
Kubernetes. Field semantics are defined by the output schema.

Rules:
- Credentials in env must have sensitive: true and the literal value
  "${ENV_PLACEHOLDER_SENTINEL}" — never invent or guess secret values.
- When config.platforms.webhook.enabled is true, env MUST include a sensitive
  WEBHOOK_SECRET; when config.api_server.enabled is true, a sensitive
  API_SERVER_KEY (both with value "${ENV_PLACEHOLDER_SENTINEL}").
- Sensitive values shown as "${ENV_SECRET_SENTINEL}" in an existing definition are stored
  secrets — keep them as the literal "${ENV_SECRET_SENTINEL}" when revising.
- Only enable features the request calls for. Prefer minimal, valid output.`;

export class AgentUseCase {
  constructor(
    private readonly runtime: Runtime = new KubernetesClient(),
    private readonly config: ConfigAdaptor = new LocalConfig(),
    private readonly generator: AiGenerator = new AiSdkGenerator()
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

  async listHermesAgents(ctx: Context, input?: ListAgentsFilter): Promise<Agent[]> {
    return this.runtime.listHermesAgents(input);
  }

  async getHermesAgent(ctx: Context, id: string): Promise<Agent | null> {
    return this.runtime.getHermesAgent(id);
  }

  async createHermesAgent(ctx: Context, agentInput: AgentInput): Promise<Agent> {
    agentInput = AgentInputSchema.parse(agentInput);

    if (agentInput.type !== undefined) {
      this.checkAgentTypeAllowed(agentInput.type);
    }
    await this.checkSharedEnvSetsAccessible(agentInput.sharedEnvSets);
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
    await this.checkSharedEnvSetsAccessible(patch.sharedEnvSets);
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
    this.verifyOwnership(ctx, agent);
    return this.runtime.archiveHermesAgent(id);
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

  private async checkSharedEnvSetsAccessible(setIds: string[] | undefined): Promise<void> {
    for (const id of setIds ?? []) {
      const envSet = await this.runtime.getSharedEnvSet(id);
      if (!envSet) {
        throw new Error(`Shared env set "${id}" not found`);
      }
      if (envSet.archived) {
        throw new Error(`Shared env set "${id}" is archived`);
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

  async generateAgentInput(ctx: Context, prompt: Prompt): Promise<AgentInput> {
    prompt = PromptSchema.parse(prompt);
    const output = await this.generator.generateAgentInput({
      system: AGENT_INPUT_SYSTEM_PROMPT,
      prompt: `Create a new Hermes agent definition from this request:\n\n${prompt}`,
    });
    return this.finalizeGeneratedAgentInput(output);
  }

  async reviseAgentInput(ctx: Context, current: AgentInput, prompt: Prompt): Promise<AgentInput> {
    prompt = PromptSchema.parse(prompt);
    const output = await this.generator.generateAgentInput({
      system: AGENT_INPUT_SYSTEM_PROMPT,
      prompt:
        "Here is an existing Hermes agent definition as JSON:\n\n" +
        JSON.stringify(current, null, 2) +
        "\n\nApply the following change and return the FULL revised definition " +
        "(keep everything not affected by the change unchanged):\n\n" +
        prompt,
    });
    return this.finalizeGeneratedAgentInput(output, current.env ?? []);
  }

  private finalizeGeneratedAgentInput(
    output: AgentInput,
    existingEnv: readonly AgentEnvVar[] = []
  ): AgentInput {
    const parsed = AgentInputObjectSchema.parse(output);
    return { ...parsed, env: this.scrubGeneratedEnv(parsed, existingEnv) };
  }

  // The system prompt asks for these invariants, but LLMs occasionally slip;
  // patch the output rather than reject it so the prefill stays usable.
  private scrubGeneratedEnv(
    parsed: AgentInput,
    existingEnv: readonly AgentEnvVar[]
  ): AgentEnvVar[] | undefined {
    const existingSensitive = new Set(
      existingEnv.filter((v) => v.sensitive === true).map((v) => v.name)
    );

    // Never pass through generated secret values: sensitive vars may only hold
    // the fill-me placeholder, or "<secret>" when it round-trips an already
    // stored secret (the kubernetes client reuses the stored value for it).
    const env = (parsed.env ?? []).map((v) => {
      if (!v.sensitive || v.value === ENV_PLACEHOLDER_SENTINEL) return v;
      if (v.value === ENV_SECRET_SENTINEL && existingSensitive.has(v.name)) return v;
      return { ...v, value: ENV_PLACEHOLDER_SENTINEL };
    });

    const requireSensitiveEnv = (name: string) => {
      if (!env.some((v) => v.name === name && v.sensitive === true)) {
        env.push({ name, value: ENV_PLACEHOLDER_SENTINEL, sensitive: true });
      }
    };
    if (parsed.config?.platforms?.webhook?.enabled === true) {
      requireSensitiveEnv("WEBHOOK_SECRET");
    }
    if (parsed.config?.api_server?.enabled === true) {
      requireSensitiveEnv("API_SERVER_KEY");
    }

    return env.length > 0 ? env : parsed.env;
  }
}
