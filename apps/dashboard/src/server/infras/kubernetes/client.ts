import { createHash } from "node:crypto";

import * as k8s from "@kubernetes/client-node";

import {
  Agent,
  AgentPhase,
  ENV_SECRET_SENTINEL,
  Env,
  EnvVar,
  SharedEnvSet,
  SharedEnvSetEnvVar,
} from "@/entities";
import { config } from "@/server/libs/config";
import {
  CreateAgentInput,
  CreateSharedEnvSetInput,
  ListAgentsFilter,
  ListSharedEnvSetsFilter,
  PatchAgentInput,
  Runtime,
  SharedEnvSetPatch,
} from "../../usecases/adaptors/runtime";
import { HermesAgent, HermesAgentList, HermesAgentSpec, HermesConfig } from "./types/hermes-agent";

const enum HermesGroup {
  Default = "agents.hermeum.app",
}
const enum HermesVersion {
  V1Alpha1 = "v1alpha1",
}
const enum HermesPlural {
  Agents = "hermesagents",
}

const enum HermeumLabel {
  // https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/#labels
  ManagedBy = "app.kubernetes.io/managed-by",
  UserId = "hermeum.app/user-id",
  Archived = "hermeum.app/archived",
  Resource = "hermeum.app/resource",
}
const enum HermeumLabelValue {
  ManagedBy = "hermeum",
  SharedEnvSet = "shared-env-set",
  AgentEnv = "agent-env",
}
const enum HermeumAnnotation {
  Name = "hermeum.app/name",
  Description = "hermeum.app/description",
  Type = "hermeum.app/type",
}
const enum HermeumPodAnnotation {
  EnvHash = "hermeum.app/env-hash",
}

export function agentEnvResourceName(agentId: string): string {
  return `${agentId}-dot-env`;
}

export function splitAgentEnv(env: Env): {
  configMapData: Record<string, string>;
  secretData: Record<string, string>;
} {
  const configMapData: Record<string, string> = {};
  const secretData: Record<string, string> = {};
  for (const v of env ?? []) {
    if (v.sensitive) {
      secretData[v.name] = v.value;
    } else {
      configMapData[v.name] = v.value;
    }
  }
  return { configMapData, secretData };
}

export function maskSensitiveEnv(env: Env): Env {
  return env?.map((v) => (v.sensitive ? { ...v, value: ENV_SECRET_SENTINEL } : v));
}

// Deterministic fingerprint of env content, stamped onto the pod template via
// podAnnotations so the StatefulSet rolls its pods whenever env changes.
export function hashAgentEnv(env: Env): string {
  const canonical = [...(env ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((v) => `${v.name}=${v.value}|${v.sensitive ?? false}`)
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export function agentEnvToConfigMap(
  agent: Pick<Agent, "id" | "userId" | "archived">,
  data: Record<string, string>
): k8s.V1ConfigMap {
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: agentEnvResourceName(agent.id),
      namespace: config.kubernetesNamespace,
      labels: {
        [HermeumLabel.ManagedBy]: HermeumLabelValue.ManagedBy,
        [HermeumLabel.Resource]: HermeumLabelValue.AgentEnv,
        [HermeumLabel.UserId]: agent.userId,
        [HermeumLabel.Archived]: String(agent.archived ?? false),
      },
    },
    data,
  };
}

export function agentEnvToSecret(
  agent: Pick<Agent, "id" | "userId" | "archived">,
  stringData: Record<string, string>
): k8s.V1Secret {
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: {
      name: agentEnvResourceName(agent.id),
      namespace: config.kubernetesNamespace,
      labels: {
        [HermeumLabel.ManagedBy]: HermeumLabelValue.ManagedBy,
        [HermeumLabel.Resource]: HermeumLabelValue.AgentEnv,
        [HermeumLabel.UserId]: agent.userId,
        [HermeumLabel.Archived]: String(agent.archived ?? false),
      },
    },
    stringData,
  };
}

export function agentToHermesAgent(agent: Agent): HermesAgent {
  const labels: Record<string, string> = {
    [HermeumLabel.ManagedBy]: HermeumLabelValue.ManagedBy,
    [HermeumLabel.UserId]: agent.userId,
    [HermeumLabel.Archived]: String(agent.archived ?? false),
  };

  const annotations: Record<string, string> = {};
  if (agent.name !== undefined) {
    annotations[HermeumAnnotation.Name] = agent.name;
  }
  if (agent.description !== undefined) {
    annotations[HermeumAnnotation.Description] = agent.description;
  }
  if (agent.type !== undefined) {
    annotations[HermeumAnnotation.Type] = agent.type;
  }

  const hermes: Partial<HermesAgentSpec["hermes"]> = {};
  // Enable the SearXNG sidecar when the agent asks for the searxng backend.
  let searxngEnabled = false;
  if (agent.config !== undefined) {
    searxngEnabled =
      agent.config.web?.search_backend === "searxng" ||
      agent.config.web?.backend === "searxng";
    // The Hermes agent has no api_server section in config.yaml — it belongs to
    // the CR's dedicated config.apiServer field, so keep it out of raw.
    const { api_server: apiServer, ...rawConfig } = agent.config;
    hermes.config = { raw: rawConfig };
    if (apiServer !== undefined) {
      hermes.config.apiServer = {
        ...(apiServer.enabled !== undefined && { enabled: apiServer.enabled }),
        ...(apiServer.port !== undefined && { port: apiServer.port }),
        ...(apiServer.cors_origins !== undefined && { corsOrigins: apiServer.cors_origins }),
        ...(apiServer.enabled === true && {
          existingSecret: { name: agentEnvResourceName(agent.id), key: "API_SERVER_KEY" },
        }),
      };
    }
    const webhook = agent.config.platforms?.webhook;
    if (webhook !== undefined) {
      hermes.config.webhook = {
        ...(webhook.enabled !== undefined && { enabled: webhook.enabled }),
        ...(webhook.extra?.port !== undefined && { port: webhook.extra.port }),
        ...(webhook.enabled === true && {
          secretRef: { name: agentEnvResourceName(agent.id), key: "WEBHOOK_SECRET" },
        }),
      };
    }
  }
  if (agent.sharedEnvSets !== undefined) {
    hermes.envFrom = agent.sharedEnvSets.map((name) => ({ secretRef: { name } }));
  }
  const envResourceName = agentEnvResourceName(agent.id);
  hermes.workspace = {
    ...(agent.soul !== undefined && { files: { "SOUL.md": agent.soul } }),
    dotEnv: {
      configMapRef: { name: envResourceName },
      secretRef: { name: envResourceName },
    },
  };
  if (agent.skills !== undefined) {
    hermes.skills = agent.skills.map((identifier) => ({ identifier }));
  }
  if (agent.plugins !== undefined) {
    hermes.plugins = agent.plugins.map((identifier) => ({ identifier }));
  }
  if (agent.packages !== undefined) {
    hermes.packages = {
      ...(agent.packages.pip !== undefined && { pip: { install: agent.packages.pip } }),
      ...(agent.packages.npm !== undefined && { npm: { install: agent.packages.npm } }),
    };
  }
  if (agent.crons !== undefined) {
    hermes.crons = agent.crons;
  }
  hermes.image = { repository: config.hermesImageRepository, tag: config.hermesImageTag };

  const spec: HermesAgentSpec = {
    ...(agent.suspended !== undefined && { suspend: agent.suspended }),
    ...(Object.keys(hermes).length > 0 && { hermes: hermes as HermesAgentSpec["hermes"] }),
    ...(searxngEnabled && { searxng: { enabled: true } }),
    podAnnotations: { [HermeumPodAnnotation.EnvHash]: hashAgentEnv(agent.env) },
  };

  return {
    apiVersion: `${HermesGroup.Default}/${HermesVersion.V1Alpha1}`,
    kind: "HermesAgent",
    metadata: {
      name: agent.id,
      namespace: config.kubernetesNamespace,
      labels,
      annotations,
    },
    spec,
  };
}

// Rebuild the agent config from the CR: api_server lives in the dedicated
// config.apiServer field (not raw), so fold it back in for round-tripping.
// existingSecret is derived from the agent id at build time and is not mapped back.
export function mapHermesConfig(config: HermesConfig | undefined): Agent["config"] {
  const apiServer = config?.apiServer;
  if (apiServer === undefined) {
    return config?.raw;
  }
  return {
    ...config?.raw,
    api_server: {
      ...(apiServer.enabled !== undefined && { enabled: apiServer.enabled }),
      ...(apiServer.port !== undefined && { port: apiServer.port }),
      ...(apiServer.corsOrigins !== undefined && { cors_origins: apiServer.corsOrigins }),
    },
  };
}

export function mapHermesAgent(raw: HermesAgent): Agent {
  return {
    id: raw.metadata?.name ?? "",
    userId: raw.metadata?.labels?.[HermeumLabel.UserId] ?? "",
    name: raw.metadata?.annotations?.[HermeumAnnotation.Name],
    description: raw.metadata?.annotations?.[HermeumAnnotation.Description],
    type: raw.metadata?.annotations?.[HermeumAnnotation.Type],
    config: mapHermesConfig(raw.spec.hermes?.config),
    sharedEnvSets: raw.spec.hermes?.envFrom?.flatMap((e) =>
      e.secretRef?.name ? [e.secretRef.name] : []
    ),
    soul: raw.spec.hermes?.workspace?.files?.["SOUL.md"],
    skills: raw.spec.hermes?.skills?.map((s) => s.identifier),
    plugins: raw.spec.hermes?.plugins?.map((p) => p.identifier),
    packages: raw.spec.hermes?.packages && {
      ...(raw.spec.hermes.packages.pip?.install !== undefined && {
        pip: raw.spec.hermes.packages.pip.install,
      }),
      ...(raw.spec.hermes.packages.npm?.install !== undefined && {
        npm: raw.spec.hermes.packages.npm.install,
      }),
    },
    // prompt is required by AgentCronSchema; dashboard-authored crons always set it.
    crons: raw.spec.hermes?.crons?.map((c) => ({
      name: c.name,
      schedule: c.schedule,
      prompt: c.prompt as string,
      ...(c.deliver !== undefined && { deliver: c.deliver }),
      ...(c.repeat !== undefined && { repeat: c.repeat }),
      ...(c.skills !== undefined && { skills: c.skills }),
    })),
    suspended: raw.spec.suspend,
    archived: raw.metadata?.labels?.[HermeumLabel.Archived] === "true",
    phase: raw.status?.phase as AgentPhase | undefined,
    createdAt: raw.metadata?.creationTimestamp,
  };
}

export function sharedEnvSetToKubernetesSecret(
  envSet: SharedEnvSet,
  data?: Record<string, string>
): k8s.V1Secret {
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: {
      name: envSet.id,
      namespace: config.kubernetesNamespace,
      labels: {
        [HermeumLabel.ManagedBy]: HermeumLabelValue.ManagedBy,
        [HermeumLabel.Resource]: HermeumLabelValue.SharedEnvSet,
        [HermeumLabel.UserId]: envSet.userId,
        [HermeumLabel.Archived]: String(envSet.archived ?? false),
      },
      annotations: {
        [HermeumAnnotation.Name]: envSet.name,
        ...(envSet.description !== undefined && {
          [HermeumAnnotation.Description]: envSet.description,
        }),
      },
    },
    ...(data !== undefined && { data }),
  };
}

function decodeSecretData(data: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, b64Value] of Object.entries(data)) {
    result[key] = Buffer.from(b64Value, "base64").toString("utf-8");
  }
  return result;
}

function isSharedEnvSetSecret(raw: k8s.V1Secret): boolean {
  const labels = raw.metadata?.labels;
  return (
    labels?.[HermeumLabel.ManagedBy] === HermeumLabelValue.ManagedBy &&
    labels?.[HermeumLabel.Resource] === HermeumLabelValue.SharedEnvSet
  );
}

function mapKubernetesSecretToSharedEnvSet(raw: k8s.V1Secret): SharedEnvSet {
  const envVars: SharedEnvSetEnvVar[] = Object.keys(raw.data ?? {}).map((name) => ({ name }));
  return {
    id: raw.metadata?.name ?? "",
    userId: raw.metadata?.labels?.[HermeumLabel.UserId] ?? "",
    name: raw.metadata?.annotations?.[HermeumAnnotation.Name] ?? "",
    description: raw.metadata?.annotations?.[HermeumAnnotation.Description],
    envVars,
    archived: raw.metadata?.labels?.[HermeumLabel.Archived] === "true",
    createdAt: raw.metadata?.creationTimestamp,
  };
}

export class KubernetesClient implements Runtime {
  private readonly kc: k8s.KubeConfig;
  private readonly customObjectsApi: k8s.CustomObjectsApi;
  private readonly coreV1Api: k8s.CoreV1Api;

  constructor() {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  async listHermesAgents(params?: ListAgentsFilter): Promise<Agent[]> {
    const selector = [`${HermeumLabel.ManagedBy}=${HermeumLabelValue.ManagedBy}`];
    if (params?.archived !== undefined) {
      selector.push(`${HermeumLabel.Archived}=${String(params.archived)}`);
    }
    const body = await this.customObjectsApi.listNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: HermesGroup.Default,
      version: HermesVersion.V1Alpha1,
      plural: HermesPlural.Agents,
      labelSelector: selector.join(","),
    });
    return (body as HermesAgentList).items.map(mapHermesAgent);
  }

  // Real (unmasked) env — callers are responsible for masking before this
  // reaches an API response.
  private async getHermesAgentEnv(agentId: string): Promise<Env> {
    const name = agentEnvResourceName(agentId);
    const [configMap, secret] = await Promise.all([
      this.coreV1Api
        .readNamespacedConfigMap({ name, namespace: config.kubernetesNamespace })
        .catch(() => null),
      this.coreV1Api
        .readNamespacedSecret({ name, namespace: config.kubernetesNamespace })
        .catch(() => null),
    ]);
    const nonSensitive = Object.entries(configMap?.data ?? {}).map(([name, value]) => ({
      name,
      value,
    }));
    const sensitive = Object.entries(decodeSecretData(secret?.data ?? {})).map(([name, value]) => ({
      name,
      value,
      sensitive: true,
    }));
    return [...nonSensitive, ...sensitive];
  }

  private async createHermesAgentEnv(
    agent: Pick<Agent, "id" | "userId" | "archived">,
    env: Env
  ): Promise<void> {
    const { configMapData, secretData } = splitAgentEnv(env);
    await this.coreV1Api.createNamespacedConfigMap({
      namespace: config.kubernetesNamespace,
      body: agentEnvToConfigMap(agent, configMapData),
    });
    await this.coreV1Api.createNamespacedSecret({
      namespace: config.kubernetesNamespace,
      body: agentEnvToSecret(agent, secretData),
    });
  }

  // Sensitive values round-trip through the client as the ENV_SECRET_SENTINEL
  // placeholder (never the real value), so an unchanged sensitive var arrives
  // here still holding the sentinel — swap it back for the value already in
  // the Secret instead of overwriting it with the literal placeholder string.
  private async resolveMaskedEnv(agentId: string, env: Env): Promise<Env> {
    const name = agentEnvResourceName(agentId);
    const currentSecret = await this.coreV1Api.readNamespacedSecret({
      name,
      namespace: config.kubernetesNamespace,
    });
    const existingSecretData = decodeSecretData(currentSecret.data ?? {});

    return env?.map((v) => {
      if (v.sensitive && v.value === ENV_SECRET_SENTINEL) {
        const existingValue = existingSecretData[v.name];
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

  private async patchHermesAgentEnv(agentId: string, env: Env): Promise<Env> {
    const name = agentEnvResourceName(agentId);
    const currentConfigMap = await this.coreV1Api.readNamespacedConfigMap({
      name,
      namespace: config.kubernetesNamespace,
    });
    const currentSecret = await this.coreV1Api.readNamespacedSecret({
      name,
      namespace: config.kubernetesNamespace,
    });
    const { configMapData, secretData } = splitAgentEnv(env);

    await this.coreV1Api.replaceNamespacedConfigMap({
      name,
      namespace: config.kubernetesNamespace,
      body: { ...currentConfigMap, data: configMapData },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: _data, ...restSecret } = currentSecret;
    await this.coreV1Api.replaceNamespacedSecret({
      name,
      namespace: config.kubernetesNamespace,
      body: { ...restSecret, stringData: secretData },
    });

    return env;
  }

  async getHermesAgent(id: string): Promise<Agent | null> {
    try {
      const body = await this.customObjectsApi.getNamespacedCustomObject({
        namespace: config.kubernetesNamespace,
        group: HermesGroup.Default,
        version: HermesVersion.V1Alpha1,
        plural: HermesPlural.Agents,
        name: id,
      });
      const env = await this.getHermesAgentEnv(id);
      return { ...mapHermesAgent(body as HermesAgent), env: maskSensitiveEnv(env) };
    } catch {
      return null;
    }
  }

  async createHermesAgent(agentInput: CreateAgentInput): Promise<Agent> {
    const id = `agent-${Math.random().toString(36).slice(2, 8)}`;
    const agent = { id, ...agentInput };
    await this.createHermesAgentEnv(agent, agent.env);
    const body = agentToHermesAgent(agent);
    const resource = await this.customObjectsApi.createNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: HermesGroup.Default,
      version: HermesVersion.V1Alpha1,
      plural: HermesPlural.Agents,
      body,
    });
    return { ...mapHermesAgent(resource as HermesAgent), env: maskSensitiveEnv(agent.env) };
  }

  async patchHermesAgent({ id, patch }: PatchAgentInput): Promise<Agent> {
    const raw = (await this.customObjectsApi.getNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: HermesGroup.Default,
      version: HermesVersion.V1Alpha1,
      plural: HermesPlural.Agents,
      name: id,
    })) as HermesAgent;
    if (!raw) {
      throw new Error(`Agent with id ${id} not found`);
    }

    // Resolve the real (unmasked) env before building the CR body, so the
    // hash agentToHermesAgent stamps into podAnnotations reflects the actual
    // stored content — and stays stable across patches that don't touch env.
    const env =
      patch.env !== undefined
        ? await this.patchHermesAgentEnv(id, await this.resolveMaskedEnv(id, patch.env))
        : await this.getHermesAgentEnv(id);

    const merged = {
      ...mapHermesAgent(raw),
      ...patch,
      env,
    };
    const body = agentToHermesAgent(merged);
    if (body.metadata && raw.metadata?.resourceVersion) {
      body.metadata.resourceVersion = raw.metadata.resourceVersion;
    }
    const resource = await this.customObjectsApi.replaceNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: HermesGroup.Default,
      version: HermesVersion.V1Alpha1,
      plural: HermesPlural.Agents,
      name: id,
      body,
    });

    return { ...mapHermesAgent(resource as HermesAgent), env: maskSensitiveEnv(env) };
  }

  async archiveHermesAgent(id: string): Promise<Agent> {
    return this.patchHermesAgent({ id, patch: { suspended: true, archived: true } });
  }

  async listSharedEnvSets(params?: ListSharedEnvSetsFilter): Promise<SharedEnvSet[]> {
    const selector = [
      `${HermeumLabel.ManagedBy}=${HermeumLabelValue.ManagedBy}`,
      `${HermeumLabel.Resource}=${HermeumLabelValue.SharedEnvSet}`,
    ];
    if (params?.archived !== undefined) {
      selector.push(`${HermeumLabel.Archived}=${String(params.archived)}`);
    }
    const body = await this.coreV1Api.listNamespacedSecret({
      namespace: config.kubernetesNamespace,
      labelSelector: selector.join(","),
    });
    return (body.items ?? []).map(mapKubernetesSecretToSharedEnvSet);
  }

  async getSharedEnvSet(id: string): Promise<SharedEnvSet | null> {
    try {
      const body = await this.coreV1Api.readNamespacedSecret({
        name: id,
        namespace: config.kubernetesNamespace,
      });
      if (!isSharedEnvSetSecret(body)) {
        return null;
      }
      return mapKubernetesSecretToSharedEnvSet(body);
    } catch {
      return null;
    }
  }

  async getGatewayToken(agentId: string): Promise<string | null> {
    let raw: HermesAgent | null = null;
    try {
      raw = (await this.customObjectsApi.getNamespacedCustomObject({
        namespace: config.kubernetesNamespace,
        group: HermesGroup.Default,
        version: HermesVersion.V1Alpha1,
        plural: HermesPlural.Agents,
        name: agentId,
      })) as HermesAgent;
    } catch {
      return null;
    }

    const secretName = raw?.status?.managedResources?.hermesSecret;
    if (!secretName) {
      return null;
    }

    try {
      const secret = await this.coreV1Api.readNamespacedSecret({
        name: secretName,
        namespace: config.kubernetesNamespace,
      });
      const encoded = secret?.data?.["token"];
      if (!encoded) {
        return null;
      }

      return Buffer.from(encoded, "base64").toString("utf-8");
    } catch {
      return null;
    }
  }

  async createSharedEnvSet(input: CreateSharedEnvSetInput): Promise<SharedEnvSet> {
    const id = `envset-${Math.random().toString(36).slice(2, 8)}`;
    const body = sharedEnvSetToKubernetesSecret({
      id,
      envVars: [],
      ...input,
    });
    const resource = await this.coreV1Api.createNamespacedSecret({
      namespace: config.kubernetesNamespace,
      body,
    });
    return mapKubernetesSecretToSharedEnvSet(resource);
  }

  async archiveSharedEnvSet(id: string): Promise<SharedEnvSet> {
    return this.patchSharedEnvSet(id, { archived: true });
  }

  async patchSharedEnvSet(id: string, patch: SharedEnvSetPatch): Promise<SharedEnvSet> {
    const raw = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
    });
    if (!raw) {
      throw new Error(`Shared env set with id ${id} not found`);
    }
    const { data } = raw;
    const body = sharedEnvSetToKubernetesSecret(
      {
        ...mapKubernetesSecretToSharedEnvSet(raw),
        ...patch,
      },
      data
    );
    if (body.metadata && raw.metadata?.resourceVersion) {
      body.metadata.resourceVersion = raw.metadata.resourceVersion;
    }
    const resource = await this.coreV1Api.replaceNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
      body,
    });
    return mapKubernetesSecretToSharedEnvSet(resource);
  }

  async addEnvVar(id: string, envVar: EnvVar): Promise<SharedEnvSet> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
    });
    const stringData = decodeSecretData(current.data ?? {});
    stringData[envVar.name] = envVar.value;
    return this._applyStringData(id, current, stringData);
  }

  async updateEnvVar(id: string, envVar: EnvVar): Promise<SharedEnvSet> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
    });
    const stringData = decodeSecretData(current.data ?? {});
    stringData[envVar.name] = envVar.value;
    return this._applyStringData(id, current, stringData);
  }

  async removeEnvVar(id: string, name: string): Promise<SharedEnvSet> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
    });
    const stringData = decodeSecretData(current.data ?? {});
    delete stringData[name];
    return this._applyStringData(id, current, stringData);
  }

  private async _applyStringData(
    id: string,
    current: k8s.V1Secret,
    stringData: Record<string, string>
  ): Promise<SharedEnvSet> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: _data, ...rest } = current;
    const body = await this.coreV1Api.replaceNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
      body: {
        ...rest,
        metadata: {
          ...current.metadata,
          ...(current.metadata?.resourceVersion !== undefined && {
            resourceVersion: current.metadata.resourceVersion,
          }),
        },
        stringData,
      },
    });
    return mapKubernetesSecretToSharedEnvSet(body);
  }
}
