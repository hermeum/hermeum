import { z } from "zod";
import * as fastJsonPatch from "fast-json-patch";

import { Agent, AgentInput, AgentInputSchema, Context, Env, JsonPatchOp, DEFAULT_AGENT_TYPE_KEY } from "@/entities";

import { BaseUseCase, HermeumConfigLoadable, OwnershipGuarded } from "./mixin";
import { config } from "@/server/libs/config";

// fast-json-patch's ESM export places applyPatch on `default`, not the
// namespace. Fall back to the namespace for CJS consumers (e.g. vitest).
const { applyPatch } = fastJsonPatch.default ?? fastJsonPatch;

// ─── Managed-aspect pipeline ─────────────────────────────────────────────────
// Content Hermeum injects on write (create, update) and strips on every read
// so the user-facing agent stays user-authored. Each concern implements
// ManagedAgentAspect — a new managed concern registers in MANAGED_ASPECTS and
// the call sites never change. The runtime stores whatever the pipeline wraps
// and returns it verbatim; wrapping/stripping is pure use-case policy.

// The preamble wrapped around every managed soul (see SoulPreamble).
export const MANAGED_SOUL_PREAMBLE = `# Managed by Hermeum

Your configuration — config.yaml, .env, plugins, and crons — is managed
by Hermeum. Do not edit these files or change plugins or cron jobs yourself;
changes made outside Hermeum are not tracked and are lost when the agent is
updated or redeployed. When a configuration change is needed, tell the user to
update your agent spec in Hermeum instead.`;

// A managed aspect of the deployed agent. wrapInput applies the policy to a
// create payload — every managed field is populated, even when the input
// leaves it undefined. wrapPatch applies it to an update patch — only patches
// carrying the field are wrapped; a patch without it keeps the stored value
// (gradual migration: agents deployed before a policy gain it on their next
// field-bearing edit). stripAgent removes managed content from a
// runtime-returned agent before it reaches callers. Implementations must be
// pure, and a no-change step must return its input object unchanged so
// untouched agents keep identity.
interface ManagedAgentAspect {
  wrapInput(input: AgentInput): AgentInput;
  wrapPatch(patch: AgentInput): AgentInput;
  stripAgent(agent: Agent): Agent;
}

// Soul preamble: every soul deployed to a hermes-agent carries the managed
// preamble. hermes-agent loads SOUL.md as the identity slot — the first
// section of the system prompt — making it the first thing the deployed agent
// reads. Advisory by nature (defense-in-depth on top of the upstream
// config.yaml write guard and SOUL.md approval gate). Skills are deliberately
// absent: hermes-agent's curator maintains agent-created skills in the
// background, so self-managing skills is legitimate behavior.
class SoulPreamble implements ManagedAgentAspect {
  wrapInput(input: AgentInput): AgentInput {
    // Soulless agents get the preamble alone — the management guard applies
    // to every deployed agent, not just those with a user-authored soul.
    return {
      ...input,
      soul: input.soul === undefined ? MANAGED_SOUL_PREAMBLE : this.#withPreamble(input.soul),
    };
  }

  wrapPatch(patch: AgentInput): AgentInput {
    if (patch.soul === undefined) return patch;
    return { ...patch, soul: this.#withPreamble(patch.soul) };
  }

  stripAgent(agent: Agent): Agent {
    const soul = this.#stripPreamble(agent.soul);
    return soul === agent.soul ? agent : { ...agent, soul };
  }

  // Idempotent: input may already carry the preamble (e.g. a hand-written API
  // patch echoing the stored soul), so never double-inject.
  #withPreamble(soul: string): string {
    return soul.startsWith(MANAGED_SOUL_PREAMBLE)
      ? soul
      : `${MANAGED_SOUL_PREAMBLE}\n\n${soul}`;
  }

  // Returns the user-authored soul, or undefined when only the preamble
  // remains. A no-op for stored souls without the prefix (agents migrated
  // gradually).
  #stripPreamble(soul: string | undefined): string | undefined {
    if (soul === undefined) return undefined;
    const stripped = soul.startsWith(MANAGED_SOUL_PREAMBLE)
      ? soul.slice(MANAGED_SOUL_PREAMBLE.length).replace(/^\n+/, "")
      : soul;
    return stripped === "" ? undefined : stripped;
  }
}

// Hermeum plugin: every managed agent auto-installs the hermeum plugin so it
// posts its session telemetry to Hermeum. The bundled plugin reads the
// endpoint from the environment (plugin/hermeum/__init__.py), so the var is
// injected together with the identifier — one concern, managed as a unit. The
// endpoint name is platform-owned: a user-supplied entry is force-overridden
// so the injected value is always live, and stripping by name stays
// unambiguous.
const MANAGED_PLUGIN_ENV_NAME = "HERMEUM_PLUGIN_BASE_URL";

class HermeumPlugin implements ManagedAgentAspect {
  wrapInput(input: AgentInput): AgentInput {
    return { ...input, ...this.#managed(input) };
  }

  // The plugins/env carrying guards are independent — a patch touching only
  // one of the two fields keeps the stored value of the other.
  wrapPatch(patch: AgentInput): AgentInput {
    const managed = this.#managed(patch);
    return {
      ...patch,
      ...(patch.plugins !== undefined && { plugins: managed.plugins }),
      ...(patch.env !== undefined && { env: managed.env }),
    };
  }

  stripAgent(agent: Agent): Agent {
    const plugins = agent.plugins?.filter(
      (identifier) => identifier !== config.hermesPluginIdentifier
    );
    const env = agent.env?.filter((v) => v.name !== MANAGED_PLUGIN_ENV_NAME);
    return {
      ...agent,
      ...(plugins !== undefined && { plugins }),
      ...(env !== undefined && { env }),
    };
  }

  #managed(input: AgentInput): Pick<AgentInput, "plugins" | "env"> {
    const plugins = [
      ...(input.plugins ?? []),
      ...(input.plugins?.includes(config.hermesPluginIdentifier)
        ? []
        : [config.hermesPluginIdentifier]),
    ];
    const env = [
      ...(input.env?.filter((v) => v.name !== MANAGED_PLUGIN_ENV_NAME) ?? []),
      { name: MANAGED_PLUGIN_ENV_NAME, value: config.pluginEndpointUrl },
    ];
    return { plugins, env };
  }
}

const MANAGED_ASPECTS: ManagedAgentAspect[] = [new SoulPreamble(), new HermeumPlugin()];

// Apply every managed aspect to a write payload. Call after input validation
// (AgentInputSchema.parse) so injected entries can't trip schema limits.
function wrapManagedInput(input: AgentInput): AgentInput {
  return MANAGED_ASPECTS.reduce((acc, aspect) => aspect.wrapInput(acc), input);
}

function wrapManagedPatch(patch: AgentInput): AgentInput {
  return MANAGED_ASPECTS.reduce((acc, aspect) => aspect.wrapPatch(acc), patch);
}

// Inverse of the write-direction wrapping: every runtime-returned Agent is
// stripped before it reaches callers, keeping the user-facing agent
// user-owned. Untouched agents pass through by identity.
function stripManagedAgent(agent: Agent): Agent {
  return MANAGED_ASPECTS.reduce((acc, aspect) => aspect.stripAgent(acc), agent);
}

export const ListAgentsFilterSchema = z.object({
  archived: z.boolean().optional(),
});
export type ListAgentsFilter = z.infer<typeof ListAgentsFilterSchema>;

export class AgentUseCase extends OwnershipGuarded(HermeumConfigLoadable(BaseUseCase)) {
  async listHermesAgents(ctx: Context, input?: ListAgentsFilter): Promise<Agent[]> {
    const agents = await this.runtime.listHermesAgents(input);
    this.logger.debug("listed hermes agents", { count: agents.length, filter: input });
    return agents.map(stripManagedAgent);
  }

  async getHermesAgent(ctx: Context, id: string): Promise<Agent | null> {
    const agent = await this.runtime.getHermesAgent(id);
    this.logger.debug("got hermes agent", { id, found: agent !== null });
    return agent === null ? null : stripManagedAgent(agent);
  }

  async createHermesAgent(ctx: Context, agentInput: AgentInput): Promise<Agent> {
    agentInput = AgentInputSchema.parse(agentInput);

    await this.checkAgentInputAllowed(agentInput);
    const userId = this.requireUser(ctx).id;
    const agent = await this.runtime.createHermesAgent({
      ...wrapManagedInput(agentInput),
      userId,
    });
    this.logger.info("created hermes agent", { id: agent.id, userId });
    return stripManagedAgent(agent);
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
    const updated = await this.runtime.patchHermesAgent({
      id,
      patch: wrapManagedPatch(patch),
    });
    this.logger.info("updated hermes agent", { id, userId: this.requireUser(ctx).id });
    return stripManagedAgent(updated);
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
    return stripManagedAgent(archived);
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
    return stripManagedAgent(suspended);
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
    return stripManagedAgent(resumed);
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
