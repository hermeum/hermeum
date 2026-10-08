import { z } from "zod";
import * as fastJsonPatch from "fast-json-patch";

import { Agent, AgentInput, AgentInputSchema, Context, Env, JsonPatchOp, DEFAULT_AGENT_TYPE_KEY } from "@/entities";

import { BaseUseCase, HermeumConfigLoadable, OwnershipGuarded } from "./mixin";

// fast-json-patch's ESM export places applyPatch on `default`, not the
// namespace. Fall back to the namespace for CJS consumers (e.g. vitest).
const { applyPatch } = fastJsonPatch.default ?? fastJsonPatch;

// Every soul deployed to a hermes-agent carries this managed preamble: it is
// prepended on write (create, update) and stripped on every read so the
// user-facing soul stays user-authored. hermes-agent loads SOUL.md as the
// identity slot — the first section of the system prompt — making this the
// first thing the deployed agent reads. Advisory by nature (defense-in-depth
// on top of the upstream config.yaml write guard and SOUL.md approval gate).
// Skills are deliberately absent: hermes-agent's curator maintains
// agent-created skills in the background, so self-managing skills is
// legitimate behavior.
export const MANAGED_SOUL_PREAMBLE = `# Managed by Hermeum

Your configuration — config.yaml, .env, plugins, and crons — is managed
by Hermeum. Do not edit these files or change plugins or cron jobs yourself;
changes made outside Hermeum are not tracked and are lost when the agent is
updated or redeployed. When a configuration change is needed, tell the user to
update your agent spec in Hermeum instead.`;

// Idempotent: input may already carry the preamble (e.g. a hand-written API
// patch echoing the stored soul), so never double-inject.
function withManagedSoulPreamble(soul: string): string {
  return soul.startsWith(MANAGED_SOUL_PREAMBLE)
    ? soul
    : `${MANAGED_SOUL_PREAMBLE}\n\n${soul}`;
}

// Returns the user-authored soul, or undefined when only the preamble remains.
// A no-op for stored souls without the prefix (agents migrated gradually).
function stripManagedSoulPreamble(soul: string | undefined): string | undefined {
  if (soul === undefined) return undefined;
  const stripped = soul.startsWith(MANAGED_SOUL_PREAMBLE)
    ? soul.slice(MANAGED_SOUL_PREAMBLE.length).replace(/^\n+/, "")
    : soul;
  return stripped === "" ? undefined : stripped;
}

export const ListAgentsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListAgentsFilter = z.infer<typeof ListAgentsFilterSchema>;

export class AgentUseCase extends OwnershipGuarded(HermeumConfigLoadable(BaseUseCase)) {
  async listHermesAgents(ctx: Context, input?: ListAgentsFilter): Promise<Agent[]> {
    const agents = await this.runtime.listHermesAgents(input);
    this.logger.debug("listed hermes agents", { count: agents.length, filter: input });
    return agents.map((a) => this.stripManagedSoul(a));
  }

  async getHermesAgent(ctx: Context, id: string): Promise<Agent | null> {
    const agent = await this.runtime.getHermesAgent(id);
    this.logger.debug("got hermes agent", { id, found: agent !== null });
    return agent === null ? null : this.stripManagedSoul(agent);
  }

  async createHermesAgent(ctx: Context, agentInput: AgentInput): Promise<Agent> {
    agentInput = AgentInputSchema.parse(agentInput);

    await this.checkAgentInputAllowed(agentInput);
    const userId = this.requireUser(ctx).id;
    // Soulless agents get the preamble alone — the management guard applies
    // to every deployed agent, not just those with a user-authored soul.
    const soul =
      agentInput.soul !== undefined
        ? withManagedSoulPreamble(agentInput.soul)
        : MANAGED_SOUL_PREAMBLE;
    const agent = await this.runtime.createHermesAgent({
      ...agentInput,
      soul,
      userId,
    });
    this.logger.info("created hermes agent", { id: agent.id, userId });
    return this.stripManagedSoul(agent);
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
    // Only soul-carrying patches inject — a patch without a soul keeps the
    // stored soul (gradual migration: agents deployed before the preamble
    // gain the guard on their next soul-bearing edit).
    const soul =
      patch.soul !== undefined ? withManagedSoulPreamble(patch.soul) : undefined;
    const updated = await this.runtime.patchHermesAgent({
      id,
      patch: soul !== undefined ? { ...patch, soul } : patch,
    });
    this.logger.info("updated hermes agent", { id, userId: this.requireUser(ctx).id });
    return this.stripManagedSoul(updated);
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
    return this.stripManagedSoul(archived);
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
    return this.stripManagedSoul(suspended);
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
    return this.stripManagedSoul(resumed);
  }

  // Inverse of the preamble injection on write: every runtime-returned Agent
  // is stripped before it reaches callers, keeping the user-facing soul
  // user-owned (the same read-direction policy as the hermeum-plugin filter).
  private stripManagedSoul(agent: Agent): Agent {
    const soul = stripManagedSoulPreamble(agent.soul);
    return soul === agent.soul ? agent : { ...agent, soul };
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
