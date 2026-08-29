import { z } from "zod";
import * as fastJsonPatch from "fast-json-patch";

import { Agent, AgentInput, AgentInputSchema, Context, Env, JsonPatchOp } from "@/entities";

import { BaseUseCase, HermeumConfigLoadable, OwnershipGuarded } from "./mixin";

// fast-json-patch's ESM export places applyPatch on `default`, not the
// namespace. Fall back to the namespace for CJS consumers (e.g. vitest).
const { applyPatch } = fastJsonPatch.default ?? fastJsonPatch;

export const ListAgentsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListAgentsFilter = z.infer<typeof ListAgentsFilterSchema>;

export class AgentUseCase extends OwnershipGuarded(HermeumConfigLoadable(BaseUseCase)) {
  async getmutatingWebhookJsonPatch(
    agent: Agent,
    incomingObject?: unknown,
  ): Promise<JsonPatchOp[] | null> {
    if (!agent.type) return null;
    const { agentTypes } = await this.loadHermeumConfig();
    const agentType = agentTypes?.[agent.type];
    if (!agentType) return null;
    // mutatingWebhookJsonPatch is normalized to JsonPatchOp[][] by the schema
    // transform. When an incoming object is provided, select the first
    // candidate whose `test` ops pass (first-match-wins); without one, return
    // the first (only) candidate as-is for backwards compatibility.
    const candidates = agentType.mutatingWebhookJsonPatch as unknown as JsonPatchOp[][];
    if (incomingObject === undefined) return candidates[0] ?? null;
    return this.selectPatch(candidates, incomingObject);
  }

  async listHermesAgents(ctx: Context, input?: ListAgentsFilter): Promise<Agent[]> {
    const agents = await this.runtime.listHermesAgents(input);
    this.logger.info("listed hermes agents", { count: agents.length, filter: input });
    return agents;
  }

  async getHermesAgent(ctx: Context, id: string): Promise<Agent | null> {
    const agent = await this.runtime.getHermesAgent(id);
    this.logger.info("got hermes agent", { id, found: agent !== null });
    return agent;
  }

  async createHermesAgent(ctx: Context, agentInput: AgentInput): Promise<Agent> {
    agentInput = AgentInputSchema.parse(agentInput);

    await this.checkAgentInputAllowed(agentInput);
    const userId = this.requireUser(ctx).id;
    const agent = await this.runtime.createHermesAgent({ ...agentInput, userId });
    this.logger.info("created hermes agent", { id: agent.id, userId });
    return agent;
  }

  async updateHermesAgent(ctx: Context, id: string, patch: AgentInput): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      this.logger.warn("can't update — agent not found", { id });
      throw new Error(`HermesAgent ${id} not found`);
    }
    this.verifyOwnership(ctx, agent);

    patch = AgentInputSchema.parse(patch);

    await this.checkAgentInputAllowed(patch);
    if (patch.env !== undefined) {
      this.checkEnvSensitivityNotDowngraded(agent.env, patch.env);
    }
    const updated = await this.runtime.patchHermesAgent({ id, patch });
    this.logger.info("updated hermes agent", { id, userId: this.requireUser(ctx).id });
    return updated;
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
      this.logger.warn("can't archive — agent not found", { id });
      throw new Error(`HermesAgent ${id} not found`);
    }
    this.verifyOwnership(ctx, agent);
    const archived = await this.runtime.archiveHermesAgent(id);
    this.logger.info("archived hermes agent", { id, userId: this.requireUser(ctx).id });
    return archived;
  }

  async suspendHermesAgent(ctx: Context, id: string): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      this.logger.warn("can't suspend — agent not found", { id });
      throw new Error(`HermesAgent ${id} not found`);
    }
    this.verifyOwnership(ctx, agent);
    const suspended = await this.runtime.patchHermesAgent({ id, patch: { suspended: true } });
    this.logger.info("suspended hermes agent", { id, userId: this.requireUser(ctx).id });
    return suspended;
  }

  async resumeHermesAgent(ctx: Context, id: string): Promise<Agent> {
    const agent = await this.runtime.getHermesAgent(id);
    if (!agent) {
      this.logger.warn("can't resume — agent not found", { id });
      throw new Error(`HermesAgent ${id} not found`);
    }
    this.verifyOwnership(ctx, agent);
    const resumed = await this.runtime.patchHermesAgent({ id, patch: { suspended: false } });
    this.logger.info("resumed hermes agent", { id, userId: this.requireUser(ctx).id });
    return resumed;
  }

  async getGatewayToken(ctx: Context, agentId: string): Promise<string | null> {
    const agent = await this.runtime.getHermesAgent(agentId);
    if (!agent) {
      this.logger.warn("can't get gateway token — agent not found", { agentId });
      throw new Error(`HermesAgent ${agentId} not found`);
    }
    this.verifyOwnership(ctx, agent);
    const token = await this.runtime.getGatewayToken(agentId);
    this.logger.info("got gateway token", { agentId, userId: this.requireUser(ctx).id });
    return token;
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

  /**
   * Evaluate the `test` ops in a candidate patch against a document.
   * A candidate with no `test` ops always matches (unconditional).
   *
   * Uses `fast-json-patch`'s `applyPatch` with only the `test` ops. `test`
   * ops do not mutate the document, so applying them to the original is safe.
   * If any `test` fails, `applyPatch` throws `TEST_OPERATION_FAILED`, which we
   * catch and treat as a non-match.
   */
  private candidateMatches(candidate: JsonPatchOp[], doc: unknown): boolean {
    const testOps = candidate.filter((op) => op.op === "test");
    if (testOps.length === 0) return true;
    try {
      applyPatch(doc, testOps, true);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Select the first candidate whose `test` ops all pass against the document
   * (first-match-wins). Returns the matched candidate, or an empty array when
   * no candidate matches (no-op / admit unchanged).
   */
  private selectPatch(candidates: JsonPatchOp[][], doc: unknown): JsonPatchOp[] {
    return candidates.find((c) => this.candidateMatches(c, doc)) ?? [];
  }
}
