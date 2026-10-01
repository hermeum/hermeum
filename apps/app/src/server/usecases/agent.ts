import { z } from "zod";
import * as fastJsonPatch from "fast-json-patch";

import { Agent, AgentInput, AgentInputSchema, Context, Env, JsonPatchOp, DEFAULT_AGENT_TYPE_KEY } from "@/entities";

import { BaseUseCase, HermeumConfigLoadable, OwnershipGuarded } from "./mixin";

// fast-json-patch's ESM export places applyPatch on `default`, not the
// namespace. Fall back to the namespace for CJS consumers (e.g. vitest).
const { applyPatch } = fastJsonPatch.default ?? fastJsonPatch;

export const ListAgentsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListAgentsFilter = z.infer<typeof ListAgentsFilterSchema>;

export class AgentUseCase extends OwnershipGuarded(HermeumConfigLoadable(BaseUseCase)) {
  async listHermesAgents(ctx: Context, input?: ListAgentsFilter): Promise<Agent[]> {
    const agents = await this.runtime.listHermesAgents(input);
    this.logger.debug("listed hermes agents", { count: agents.length, filter: input });
    return agents;
  }

  async getHermesAgent(ctx: Context, id: string): Promise<Agent | null> {
    const agent = await this.runtime.getHermesAgent(id);
    this.logger.debug("got hermes agent", { id, found: agent !== null });
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

  async getmutatingWebhookJsonPatch(
    agent: Agent,
    incomingObject?: unknown,
  ): Promise<JsonPatchOp[] | null> {
    const { agentTypes } = await this.loadHermeumConfig();
    // Agents without an explicit type fall back to the reserved `default`
    // agent type; a set-but-unknown type stays a no-op.
    const agentType = agentTypes?.[agent.type ?? DEFAULT_AGENT_TYPE_KEY];
    if (!agentType) return null;
    // mutatingWebhookJsonPatch is normalized to JsonPatchOp[][] by the schema
    // transform. When an incoming object is provided, every candidate whose
    // `test` ops pass contributes its ops to the combined patch. Without one,
    // return all candidates concatenated — a backwards-compatibility path only
    // reachable from tests/scripts; webhookRouter always passes the object.
    const candidates = agentType.mutatingWebhookJsonPatch as unknown as JsonPatchOp[][];
    const patch =
      incomingObject === undefined
        ? candidates.flat()
        : this.combinePatches(candidates, incomingObject);
    if (patch.length > 0) {
      this.logger.info("mutating webhook: patching agent", {
        agentId: agent.id,
        ops: patch.length,
      });
    }
    return patch;
  }

  /**
   * Combine every matching candidate into a single patch, in declaration
   * order. A candidate with no `test` ops always matches (unconditional).
   *
   * Candidates are evaluated sequentially: each candidate's ops are applied
   * to a sandbox copy of the object *as mutated by the previously accepted
   * candidates*. A candidate is accepted (appended to the combined patch)
   * only if its whole sequence applies cleanly, including its `test` ops;
   * the sandbox is committed to the working copy only then. This matters for
   * atomicity: `applyPatch` mutates per-op and throws mid-sequence, so
   * applying a partially-failed candidate to the working copy would leak
   * "ghost" values that later candidates' `test` ops could assert — the
   * emitted patch would then fail at kube-apiserver apply time and reject
   * the whole admission.
   *
   * Returns the combined patch, or an empty array when no candidate matches
   * (no-op / admit unchanged).
   */
  private combinePatches(candidates: JsonPatchOp[][], doc: unknown): JsonPatchOp[] {
    let working = structuredClone(doc);
    const combined: JsonPatchOp[] = [];
    for (const candidate of candidates) {
      const sandbox = structuredClone(working);
      const testOps = candidate.filter((op) => op.op === "test");
      if (testOps.length > 0) {
        try {
          applyPatch(sandbox, testOps as unknown as fastJsonPatch.Operation[], true);
        } catch {
          continue;
        }
      }
      try {
        applyPatch(sandbox, candidate as unknown as fastJsonPatch.Operation[], true);
      } catch (error) {
        this.logger.warn("mutating webhook: candidate patch failed to apply, skipping", {
          ops: candidate.length,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      working = sandbox;
      combined.push(...candidate);
    }
    return combined;
  }
}
