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
import { HermesAgent, HermesAgentList, HermesAgentSpec } from "./types/hermes-agent";

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
  if (agent.config !== undefined) {
    hermes.config = { raw: agent.config };
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
  hermes.image = { repository: config.hermesImageRepository, tag: config.hermesImageTag };

  const spec: HermesAgentSpec = {
    ...(agent.suspended !== undefined && { suspend: agent.suspended }),
    ...(Object.keys(hermes).length > 0 && { hermes: hermes as HermesAgentSpec["hermes"] }),
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

export function mapHermesAgent(raw: HermesAgent): Agent {
  return {
    id: raw.metadata?.name ?? "",
    userId: raw.metadata?.labels?.[HermeumLabel.UserId] ?? "",
    name: raw.metadata?.annotations?.[HermeumAnnotation.Name],
    description: raw.metadata?.annotations?.[HermeumAnnotation.Description],
    type: raw.metadata?.annotations?.[HermeumAnnotation.Type],
    config: raw.spec.hermes?.config?.raw,
    sharedEnvSets: raw.spec.hermes?.envFrom?.flatMap((e) =>
      e.secretRef?.name ? [e.secretRef.name] : []
    ),
    soul: raw.spec.hermes?.workspace?.files?.["SOUL.md"],
    skills: raw.spec.hermes?.skills?.map((s) => s.identifier),
    plugins: raw.spec.hermes?.plugins?.map((p) => p.identifier),
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
    const sensitive = Object.keys(secret?.data ?? {}).map((name) => ({
      name,
      value: ENV_SECRET_SENTINEL,
      sensitive: true,
    }));
    return [...nonSensitive, ...sensitive];
  }

  private async createHermesAgentEnv(
    agent: Pick<Agent, "id" | "userId" | "archived">,
    env: Env
  ): Promise<Env> {
    const { configMapData, secretData } = splitAgentEnv(env);
    await this.coreV1Api.createNamespacedConfigMap({
      namespace: config.kubernetesNamespace,
      body: agentEnvToConfigMap(agent, configMapData),
    });
    await this.coreV1Api.createNamespacedSecret({
      namespace: config.kubernetesNamespace,
      body: agentEnvToSecret(agent, secretData),
    });
    return maskSensitiveEnv(env);
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
    const existingSecretData = decodeSecretData(currentSecret.data ?? {});

    const resolvedEnv = env?.map((v) => {
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
    const { configMapData, secretData } = splitAgentEnv(resolvedEnv);

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

    return maskSensitiveEnv(resolvedEnv);
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
      return { ...mapHermesAgent(body as HermesAgent), env: await this.getHermesAgentEnv(id) };
    } catch {
      return null;
    }
  }

  async createHermesAgent(agentInput: CreateAgentInput): Promise<Agent> {
    const id = `agent-${Math.random().toString(36).slice(2, 8)}`;
    const agent = { id, ...agentInput };
    const env = await this.createHermesAgentEnv(agent, agent.env);
    const body = agentToHermesAgent(agent);
    const resource = await this.customObjectsApi.createNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: HermesGroup.Default,
      version: HermesVersion.V1Alpha1,
      plural: HermesPlural.Agents,
      body,
    });
    return { ...mapHermesAgent(resource as HermesAgent), env };
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

    const merged = {
      ...mapHermesAgent(raw),
      ...patch,
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

    const env =
      patch.env !== undefined
        ? await this.patchHermesAgentEnv(id, patch.env)
        : await this.getHermesAgentEnv(id);

    return { ...mapHermesAgent(resource as HermesAgent), env };
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
