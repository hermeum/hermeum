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
} from "@/entities";

import { AiSdkGenerator } from "./infras/ai-sdk";
import { KubernetesClient } from "./infras/kubernetes/client";
import { LocalConfig } from "./infras/local-hermeum-config";
import { AiGenerator } from "./adaptors/generator";
import { Runtime } from "./adaptors/runtime";
import { ConfigAdaptor } from "./adaptors/config";
import { verifyOwnership } from "./authz";

export const ListAgentsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListAgentsFilter = z.infer<typeof ListAgentsFilterSchema>;

export const PromptSchema = z.string().min(1).max(4000);
export type Prompt = z.infer<typeof PromptSchema>;

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
      const { agentTypes } = this.config.get();
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

  private buildSystemPrompt(): string {
    const { agentTypes } = this.config.get();
    if (!agentTypes) {
      return AGENT_INPUT_SYSTEM_PROMPT;
    }

    // Append a list of configured agent types to the system prompt.
    const lines = Object.entries(agentTypes).map(
      ([key, t]) => `- ${key}${t.description ? `: ${t.description}` : ""}`
    );
    return (
      AGENT_INPUT_SYSTEM_PROMPT +
      "\n\nAgent types (optional — set `type` only if the request clearly " +
      "matches one; otherwise omit):\n" +
      lines.join("\n")
    );
  }

  async generateAgentInput(ctx: Context, prompt: Prompt): Promise<AgentInput> {
    prompt = PromptSchema.parse(prompt);
    const output = await this.generator.generateAgentInput({
      system: this.buildSystemPrompt(),
      prompt: `Create a new Hermes agent definition from this request:\n\n${prompt}`,
    });
    return this.finalizeGeneratedAgentInput(output);
  }

  async reviseAgentInput(ctx: Context, current: AgentInput, prompt: Prompt): Promise<AgentInput> {
    prompt = PromptSchema.parse(prompt);
    const output = await this.generator.generateAgentInput({
      system: this.buildSystemPrompt(),
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

// Field semantics live in the output schema's .describe() texts; this prompt
// carries per-feature cross-field rules and worked examples instead.
export const AGENT_INPUT_SYSTEM_PROMPT = `\
You generate agent definitions — a JSON object that prefills the form for a
new autonomous agent. Field semantics are defined by the output schema; use
it to decide what each field means and how to shape it.

Tailor every field to the specific request — don't fall back to generic or
placeholder-sounding content:
- \`name\` and \`description\` should reflect what this particular agent does,
  not a generic template.
- \`soul\` should be written for this agent's actual job and tone, using the
  request's own domain language where possible — not a reused boilerplate
  personality.
- Only set \`config\` sub-features (model, webhooks, api_server) that the
  request actually needs to work. Infer the ones required to fulfill the
  request even if unstated (e.g. "on every new GitHub issue" implies a
  webhook route), but don't add unrelated ones "just in case".
- Webhook routes, prompts, and skills should be built from what the request
  says triggers the agent and what it should do — not copied from an
  unrelated example.
- When the request is ambiguous or gives no basis for a field, omit that
  field rather than guessing or inventing detail that wasn't asked for.`;
