import {
  Agent,
  AgentEndpoints,
  ENV_SECRET_SENTINEL,
  Env,
  EnvVar,
  PLATFORM_INGRESS_LABELS,
  PlatformId,
  SharedEnvSet,
  isApiServerEnabled,
  isTeamsEnabled,
  isWebhookEnabled,
} from "@/entities";
import {
  CreateAgentInput,
  CreateSharedEnvSetInput,
  ListAgentsFilter,
  ListSharedEnvSetsFilter,
  PatchAgentInput,
  Runtime,
  SharedEnvSetPatch,
} from "../runtime";

// In-memory Runtime for local development and e2e tests without a Kubernetes
// cluster (HERMEUM_MOCK_RUNTIME). Mirrors the observable semantics of
// KubernetesClient: sensitive env values are masked with ENV_SECRET_SENTINEL
// on read, a sentinel arriving on patch resolves back to the stored value,
// list filters match on the archived flag, and not-found semantics match
// (get → null, patch/archive → throw).

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function maskSensitiveEnv(env: Env): Env {
  return env?.map((v) => (v.sensitive ? { ...v, value: ENV_SECRET_SENTINEL } : v));
}

// Fake per-platform endpoint URLs — one entry per HTTP platform (PlatformId),
// set only when the platform is enabled, null otherwise.
function buildEndpoints(agent: Agent): AgentEndpoints {
  const endpoint = (platform: PlatformId): string | null => {
    const label = PLATFORM_INGRESS_LABELS[platform];
    if (label === undefined) return null;
    return `http://${agent.id}.${label}.mock.local`;
  };
  return {
    [PlatformId.ApiServer]: isApiServerEnabled(agent) ? endpoint(PlatformId.ApiServer) : null,
    [PlatformId.Webhook]: isWebhookEnabled(agent) ? endpoint(PlatformId.Webhook) : null,
    [PlatformId.Teams]: isTeamsEnabled(agent) ? endpoint(PlatformId.Teams) : null,
  };
}

interface StoredAgent {
  // Carries the real (unmasked) env — masking happens only on exposure.
  agent: Agent;
}

interface StoredEnvSet {
  set: SharedEnvSet;
  values: Record<string, string>;
}

export class MockRuntime implements Runtime {
  private readonly agents = new Map<string, StoredAgent>();
  private readonly envSets = new Map<string, StoredEnvSet>();

  async listHermesAgents(params?: ListAgentsFilter): Promise<Agent[]> {
    return [...this.agents.values()]
      .filter(
        (stored) =>
          params?.archived === undefined ||
          (stored.agent.archived ?? false) === params.archived
      )
      .map((stored) => this.exposeAgent(stored.agent));
  }

  async getHermesAgent(id: string): Promise<Agent | null> {
    const stored = this.agents.get(id);
    return stored ? this.exposeAgent(stored.agent) : null;
  }

  async createHermesAgent(input: CreateAgentInput): Promise<Agent> {
    const id = randomId("agent");
    const agent: Agent = {
      ...input,
      id,
      phase: "Running",
      createdAt: new Date(),
    };
    this.agents.set(id, { agent });
    return this.exposeAgent(agent);
  }

  async patchHermesAgent({ id, patch }: PatchAgentInput): Promise<Agent> {
    const stored = this.agents.get(id);
    if (!stored) {
      throw new Error(`Agent with id ${id} not found`);
    }
    const { env: patchEnv, ...rest } = patch;
    let agent = stored.agent;
    if (patchEnv !== undefined) {
      agent = { ...agent, env: this.resolveMaskedEnv(agent.env, patchEnv) };
    }
    agent = { ...agent, ...rest };
    this.agents.set(id, { agent });
    return this.exposeAgent(agent);
  }

  async archiveHermesAgent(id: string): Promise<Agent> {
    return this.patchHermesAgent({ id, patch: { suspended: true, archived: true } });
  }

  async listSharedEnvSets(params?: ListSharedEnvSetsFilter): Promise<SharedEnvSet[]> {
    return [...this.envSets.values()]
      .filter(
        (stored) =>
          params?.archived === undefined ||
          (stored.set.archived ?? false) === params.archived
      )
      .map((stored) => this.exposeEnvSet(stored));
  }

  async getSharedEnvSet(id: string): Promise<SharedEnvSet | null> {
    const stored = this.envSets.get(id);
    return stored ? this.exposeEnvSet(stored) : null;
  }

  async createSharedEnvSet(input: CreateSharedEnvSetInput): Promise<SharedEnvSet> {
    const id = randomId("envset");
    const stored: StoredEnvSet = {
      set: {
        id,
        ...input,
        envVars: [],
        archived: false,
        createdAt: new Date(),
      },
      values: {},
    };
    this.envSets.set(id, stored);
    return this.exposeEnvSet(stored);
  }

  async archiveSharedEnvSet(id: string): Promise<SharedEnvSet> {
    return this.patchSharedEnvSet(id, { archived: true });
  }

  async patchSharedEnvSet(id: string, patch: SharedEnvSetPatch): Promise<SharedEnvSet> {
    const stored = this.requireEnvSet(id);
    stored.set = { ...stored.set, ...patch };
    return this.exposeEnvSet(stored);
  }

  async addEnvVar(id: string, envVar: EnvVar): Promise<SharedEnvSet> {
    const stored = this.requireEnvSet(id);
    stored.values[envVar.name] = envVar.value;
    return this.exposeEnvSet(stored);
  }

  async updateEnvVar(id: string, envVar: EnvVar): Promise<SharedEnvSet> {
    const stored = this.requireEnvSet(id);
    if (!(envVar.name in stored.values)) {
      throw new Error(`Environment variable "${envVar.name}" not found in shared env set ${id}`);
    }
    stored.values[envVar.name] = envVar.value;
    return this.exposeEnvSet(stored);
  }

  async removeEnvVar(id: string, name: string): Promise<SharedEnvSet> {
    const stored = this.requireEnvSet(id);
    if (!(name in stored.values)) {
      throw new Error(`Environment variable "${name}" not found in shared env set ${id}`);
    }
    delete stored.values[name];
    return this.exposeEnvSet(stored);
  }

  // Sensitive values round-trip through the client as the ENV_SECRET_SENTINEL
  // placeholder (never the real value), so an unchanged sensitive var arrives
  // here still holding the sentinel — swap it back for the stored value
  // instead of overwriting it with the literal placeholder string.
  private resolveMaskedEnv(existing: Env, incoming: Env): Env {
    return incoming?.map((v) => {
      if (v.sensitive && v.value === ENV_SECRET_SENTINEL) {
        const existingValue = existing?.find((e) => e.name === v.name)?.value;
        if (existingValue === undefined) {
          throw new Error(
            `Cannot preserve value for sensitive env var "${v.name}": no existing secret value found`
          );
        }
        return { ...v, value: existingValue };
      }
      return v;
    });
  }

  private exposeAgent(agent: Agent): Agent {
    return {
      ...agent,
      // KubernetesClient always surfaces archived as a boolean (decoded from
      // the label) — match that shape.
      archived: agent.archived ?? false,
      env: maskSensitiveEnv(agent.env),
      endpoints: buildEndpoints(agent),
    };
  }

  private exposeEnvSet(stored: StoredEnvSet): SharedEnvSet {
    return { ...stored.set, envVars: Object.keys(stored.values).map((name) => ({ name })) };
  }

  private requireEnvSet(id: string): StoredEnvSet {
    const stored = this.envSets.get(id);
    if (!stored) {
      throw new Error(`Shared env set with id ${id} not found`);
    }
    return stored;
  }
}