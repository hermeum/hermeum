import { z } from "zod";
import * as fastJsonPatch from "fast-json-patch";

import {
  Agent,
  AgentInput,
  AgentInputSchema,
  Context,
  Env,
  JsonPatchOp,
  Plugins,
  DEFAULT_AGENT_TYPE_KEY,
} from "@/entities";

import { BaseUseCase, HermeumConfigLoadable, OwnershipGuarded } from "./mixin";
import { config } from "@/server/libs/config";
import { generatePluginToken, hashPluginToken } from "@/server/libs/plugin-token";

// fast-json-patch's ESM export places applyPatch on `default`, not the
// namespace. Fall back to the namespace for CJS consumers (e.g. vitest).
const { applyPatch } = fastJsonPatch.default ?? fastJsonPatch;

// ─── Managed-aspect pipeline ─────────────────────────────────────────────────
// Content Hermeum injects on write (create, update) and strips on every read
// so the user-facing agent stays user-authored. Each concern implements
// ManagedAgentAspect — a new managed concern registers in MANAGED_ASPECTS and
// the call sites never change. The runtime stores whatever the pipeline wraps
// and returns it verbatim; wrapping/stripping is pure use-case policy.

// The postamble appended to every managed soul (see SoulPostamble).
export const MANAGED_SOUL_POSTAMBLE = `# Managed by the platform

Your configuration — config.yaml, .env, plugins, skills, and crons — is
managed by the platform you were deployed from. Do not edit these files
or change plugins or cron jobs yourself, and do not install or uninstall
skills; changes made outside the platform are not tracked and are lost
when the agent is updated or redeployed. When a configuration change is
needed, tell the user to update your agent spec on the platform instead.`;

// A managed aspect of the deployed agent. wrapInput applies the policy to a
// create payload — every managed field is populated, even when the input
// leaves it undefined; ctx carries per-agent values only the use case can
// produce. wrapPatch applies it to an update patch — only patches carrying
// the field are wrapped; a patch without it keeps the stored value (gradual
// migration: agents deployed before a policy gain it on their next
// field-bearing edit); ctx.storedAgent is the runtime-returned agent being
// patched (sensitive env values masked), so per-agent values ride the patch
// instead of being regenerated. stripAgent removes managed content from a
// runtime-returned agent before it reaches callers. Implementations must be
// pure, and a no-change step must return its input object unchanged so
// untouched agents keep identity. Aspects without per-agent context simply
// ignore the ctx argument.
interface ManagedAgentAspect {
  wrapInput(input: AgentInput, ctx: ManagedCreateContext): AgentInput;
  wrapPatch(patch: AgentInput, ctx: ManagedPatchContext): AgentInput;
  stripAgent(agent: Agent): Agent;
}

// Values only the use case can supply on create: the plugin ingest token,
// which the use case generates and persists the digest of — aspects never
// touch randomness or the database.
interface ManagedCreateContext {
  pluginToken: string;
}

// The agent being patched, as returned by the runtime (sensitive env values
// masked; wrapPatch sees the un-stripped form). Update never regenerates
// per-agent values.
interface ManagedPatchContext {
  storedAgent: Agent;
}

// Soul postamble: every soul deployed to a hermes-agent carries the managed
// notice at its end. hermes-agent loads SOUL.md as the identity slot — the
// first section of the system prompt — so the user-authored identity leads
// and the managed notice trails it. Advisory by nature (defense-in-depth on
// top of the upstream config.yaml write guard and SOUL.md approval gate).
// Skills are included in the notice: agents must not install or uninstall
// skills themselves.
// Deployment-wide — no per-agent context, so the ctx argument is ignored.
// Legacy front-preamble souls (deployed before the position flip) are not
// recognized: they pass through unchanged on reads and gain the trailing
// copy on their next soul edit — same gradual migration as pre-preamble
// agents.
class SoulPostamble implements ManagedAgentAspect {
  wrapInput(input: AgentInput): AgentInput {
    // Soulless agents get the postamble alone — the management guard applies
    // to every deployed agent, not just those with a user-authored soul.
    return {
      ...input,
      soul: input.soul === undefined ? MANAGED_SOUL_POSTAMBLE : this.#withPostamble(input.soul),
    };
  }

  wrapPatch(patch: AgentInput): AgentInput {
    if (patch.soul === undefined) return patch;
    return { ...patch, soul: this.#withPostamble(patch.soul) };
  }

  stripAgent(agent: Agent): Agent {
    const soul = this.#stripPostamble(agent.soul);
    return soul === agent.soul ? agent : { ...agent, soul };
  }

  // Idempotent: input may already carry the postamble (e.g. a hand-written
  // API patch echoing the stored soul), so never double-inject.
  #withPostamble(soul: string): string {
    return soul.endsWith(MANAGED_SOUL_POSTAMBLE) ? soul : `${soul}\n\n${MANAGED_SOUL_POSTAMBLE}`;
  }

  // Returns the user-authored soul, or undefined when only the postamble
  // remains. A no-op for stored souls without the suffix (agents migrated
  // gradually).
  #stripPostamble(soul: string | undefined): string | undefined {
    if (soul === undefined) return undefined;
    const stripped = soul.endsWith(MANAGED_SOUL_POSTAMBLE)
      ? soul.slice(0, -MANAGED_SOUL_POSTAMBLE.length).replace(/\n+$/, "")
      : soul;
    return stripped === "" ? undefined : stripped;
  }
}

// Hermeum plugin: every managed agent auto-installs the hermeum plugin so it
// posts its session telemetry to Hermeum. The bundled plugin reads its
// endpoint and ingest token from the environment
// (plugin/hermeum/__init__.py), so all four managed pieces ship as one
// unit: the plugin identifier (optionally pinned to pluginRef — the hermeum
// commit the plugin ships from, see config.ts; when unset the install
// follows main), the endpoint var (config-sourced,
// always live), and the per-agent ingest token. The identifier and both env
// names are platform-owned — user-supplied entries are force-overridden so
// the injected values are always live, and stripping by name stays
// unambiguous.
//
// The token is secret and per-agent, so the aspect never generates it: the
// use case creates one per agent (persisting only the SHA-256 digest, see
// libs/plugin-token) and hands the raw value in via the create context. On
// patches the masked stored entry rides along (never regenerated — the
// digest only changes on create), and every read strips the entry.
const MANAGED_PLUGIN_ENV_NAME = "HERMEUM_PLUGIN_BASE_URL";
const MANAGED_PLUGIN_TOKEN_ENV_NAME = "HERMEUM_PLUGIN_TOKEN";

class HermeumPlugin implements ManagedAgentAspect {
  wrapInput(input: AgentInput, ctx: ManagedCreateContext): AgentInput {
    return {
      ...input,
      plugins: this.#mergedPlugins(input.plugins),
      env: [
        ...this.#userEnv(input.env),
        { name: MANAGED_PLUGIN_TOKEN_ENV_NAME, value: ctx.pluginToken, sensitive: true },
        { name: MANAGED_PLUGIN_ENV_NAME, value: config.pluginEndpointUrl },
      ],
    };
  }

  // The plugins/env carrying guards are independent — a patch touching only
  // one of the two fields keeps the stored value of the other.
  wrapPatch(patch: AgentInput, ctx: ManagedPatchContext): AgentInput {
    return {
      ...patch,
      ...(patch.plugins !== undefined && { plugins: this.#mergedPlugins(patch.plugins) }),
      ...(patch.env !== undefined && {
        env: [
          ...this.#userEnv(patch.env),
          ...this.#preservedToken(ctx.storedAgent.env),
          { name: MANAGED_PLUGIN_ENV_NAME, value: config.pluginEndpointUrl },
        ],
      }),
    };
  }

  stripAgent(agent: Agent): Agent {
    const plugins = agent.plugins?.filter(
      (plugin) => plugin.identifier !== config.pluginIdentifier
    );
    const env = agent.env?.filter(
      (v) => v.name !== MANAGED_PLUGIN_ENV_NAME && v.name !== MANAGED_PLUGIN_TOKEN_ENV_NAME
    );
    return {
      ...agent,
      ...(plugins !== undefined && { plugins }),
      ...(env !== undefined && { env }),
    };
  }

  // Managed names are platform-owned: user-supplied entries for either are
  // dropped before the managed ones are appended.
  #userEnv(env: Env | undefined): NonNullable<Env> {
    return (
      env?.filter(
        (v) => v.name !== MANAGED_PLUGIN_ENV_NAME && v.name !== MANAGED_PLUGIN_TOKEN_ENV_NAME
      ) ?? []
    );
  }

  #mergedPlugins(plugins: Plugins | undefined): NonNullable<Plugins> {
    // The managed identifier is platform-owned: a user-supplied entry is
    // dropped and replaced wholesale — ref included — so the pin is always
    // live (mirrors the env force-override above). When pluginRef is unset
    // the entry ships without a ref: hermes-agent then installs from the
    // plugin repo's default branch (main).
    return [
      ...(plugins?.filter((plugin) => plugin.identifier !== config.pluginIdentifier) ?? []),
      { identifier: config.pluginIdentifier, ...(config.pluginRef !== undefined && { ref: config.pluginRef }) },
    ];
  }

  // Env-carrying patches replace the stored env wholesale, so the token entry
  // must ride the patch to survive. The stored agent arrives with sensitive
  // values masked to ENV_SECRET_SENTINEL by the runtime; copying the masked
  // entry verbatim keeps the raw value out of this layer while the runtime's
  // sentinel resolution restores it in the Secret. Never regenerated here —
  // the stored digest only changes when the agent is created.
  #preservedToken(storedEnv: Env | undefined): NonNullable<Env> {
    const stored = storedEnv?.find((v) => v.name === MANAGED_PLUGIN_TOKEN_ENV_NAME);
    if (!stored) return [];
    return [{ name: MANAGED_PLUGIN_TOKEN_ENV_NAME, value: stored.value, sensitive: true }];
  }
}

const MANAGED_ASPECTS: ManagedAgentAspect[] = [new SoulPostamble(), new HermeumPlugin()];

// Apply every managed aspect to a write payload. Call after input validation
// (AgentInputSchema.parse) so injected entries can't trip schema limits.
function wrapManagedInput(input: AgentInput, ctx: ManagedCreateContext): AgentInput {
  return MANAGED_ASPECTS.reduce((acc, aspect) => aspect.wrapInput(acc, ctx), input);
}

function wrapManagedPatch(patch: AgentInput, ctx: ManagedPatchContext): AgentInput {
  return MANAGED_ASPECTS.reduce((acc, aspect) => aspect.wrapPatch(acc, ctx), patch);
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
    // The raw token must be in the agent's env before its pod first posts;
    // the digest must be in the app DB before the server first verifies. A
    // failed store surfaces here — the agent exists but its ingest stays
    // unauthorized until re-created, so a silent gap is worse than an error.
    const pluginToken = generatePluginToken();
    const agent = await this.runtime.createHermesAgent({
      ...wrapManagedInput(agentInput, { pluginToken }),
      userId,
    });
    await this.db.storeAgentToken(agent.id, hashPluginToken(pluginToken));
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
      patch: wrapManagedPatch(patch, { storedAgent: agent }),
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
    // Archived is terminal: revoke the ingest token so a lingering pod can
    // no longer post telemetry. Idempotent (archiving twice re-patches), so
    // a failure simply retries the whole operation.
    await this.db.revokeAgentToken(id);
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
    incomingObject?: unknown
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
