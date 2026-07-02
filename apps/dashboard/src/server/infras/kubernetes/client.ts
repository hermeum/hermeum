import * as k8s from "@kubernetes/client-node";

import { Agent, AgentInput, AgentPhase, EnvVar, Secret, SecretEnvVar } from "@/entities";
import { config } from "@/server/libs/config";
import {
  CreateAgentInput,
  CreateSecretInput,
  ListSecretsFilter,
  PatchAgentInput,
  Runtime,
  SecretPatch,
} from "../../usecases/adaptors/runtime";
import {
  HermesAgent,
  HermesAgentList,
  HermesAgentSpec,
} from "./types/hermes-agent";

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
  Shared = "hermeum.app/shared",
}
const enum HermeumLabelValue {
  ManagedBy = "hermeum",
}
const enum HermeumAnnotation {
  Name = "hermeum.app/name",
  Description = "hermeum.app/description",
  Type = "hermeum.app/type",
}

export function agentToHermesAgent(agent: Agent): HermesAgent {
  const labels: Record<string, string> = {
    [HermeumLabel.ManagedBy]: HermeumLabelValue.ManagedBy,
    [HermeumLabel.UserId]: agent.userId,
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
  if (agent.secrets !== undefined) {
    hermes.envFrom = agent.secrets.map((name) => ({ secretRef: { name } }));
  }
  if (agent.soul !== undefined) {
    hermes.workspace = { files: { "SOUL.md": agent.soul } };
  }
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
    secrets: raw.spec.hermes?.envFrom?.flatMap((e) =>
      e.secretRef?.name ? [e.secretRef.name] : []
    ),
    soul: raw.spec.hermes?.workspace?.files?.["SOUL.md"],
    skills: raw.spec.hermes?.skills?.map((s) => s.identifier),
    plugins: raw.spec.hermes?.plugins?.map((p) => p.identifier),
    suspended: raw.spec.suspend,
    phase: raw.status?.phase as AgentPhase | undefined,
    createdAt: raw.metadata?.creationTimestamp,
  };
}

export function secretToKubernetesSecret(
  secret: Secret,
  data?: Record<string, string>
): k8s.V1Secret {
  return {
    apiVersion: "v1",
    kind: "Secret",
    type: "Opaque",
    metadata: {
      name: secret.id,
      namespace: config.kubernetesNamespace,
      labels: {
        [HermeumLabel.ManagedBy]: HermeumLabelValue.ManagedBy,
        [HermeumLabel.UserId]: secret.userId,
        [HermeumLabel.Archived]: String(secret.archived ?? false),
        [HermeumLabel.Shared]: String(secret.shared ?? false),
      },
      annotations: {
        [HermeumAnnotation.Name]: secret.name,
        ...(secret.description !== undefined && {
          [HermeumAnnotation.Description]: secret.description,
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

function mapKubernetesSecret(raw: k8s.V1Secret): Secret {
  const envVars: SecretEnvVar[] = Object.keys(raw.data ?? {}).map((name) => ({ name }));
  return {
    id: raw.metadata?.name ?? "",
    userId: raw.metadata?.labels?.[HermeumLabel.UserId] ?? "",
    name: raw.metadata?.annotations?.[HermeumAnnotation.Name] ?? "",
    description: raw.metadata?.annotations?.[HermeumAnnotation.Description],
    envVars,
    archived: raw.metadata?.labels?.[HermeumLabel.Archived] === "true",
    shared: raw.metadata?.labels?.[HermeumLabel.Shared] === "true",
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

  async listHermesAgents(): Promise<Agent[]> {
    const body = await this.customObjectsApi.listNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: HermesGroup.Default,
      version: HermesVersion.V1Alpha1,
      plural: HermesPlural.Agents,
      labelSelector: `${HermeumLabel.ManagedBy}=${HermeumLabelValue.ManagedBy}`,
    });
    return (body as HermesAgentList).items.map(mapHermesAgent);
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
      return mapHermesAgent(body as HermesAgent);
    } catch {
      return null;
    }
  }

  async createHermesAgent(agentInput: CreateAgentInput): Promise<Agent> {
    const id = `agent-${Math.random().toString(36).slice(2, 8)}`;
    const body = agentToHermesAgent({
      id,
      ...agentInput,
    });
    const resource = await this.customObjectsApi.createNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: HermesGroup.Default,
      version: HermesVersion.V1Alpha1,
      plural: HermesPlural.Agents,
      body,
    });
    return mapHermesAgent(resource as HermesAgent);
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

    const body = agentToHermesAgent({
      ...mapHermesAgent(raw),
      ...patch,
    });
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
    return mapHermesAgent(resource as HermesAgent);
  }

  async deleteHermesAgent(id: string): Promise<void> {
    await this.customObjectsApi.deleteNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: HermesGroup.Default,
      version: HermesVersion.V1Alpha1,
      plural: HermesPlural.Agents,
      name: id,
    });
  }

  async listSecrets(params?: ListSecretsFilter): Promise<Secret[]> {
    const selector = [`${HermeumLabel.ManagedBy}=${HermeumLabelValue.ManagedBy}`];
    if (params?.archived !== undefined) {
      selector.push(`${HermeumLabel.Archived}=${String(params.archived)}`);
    }
    const body = await this.coreV1Api.listNamespacedSecret({
      namespace: config.kubernetesNamespace,
      labelSelector: selector.join(","),
    });
    return (body.items ?? []).map(mapKubernetesSecret);
  }

  async getSecret(id: string): Promise<Secret | null> {
    try {
      const body = await this.coreV1Api.readNamespacedSecret({
        name: id,
        namespace: config.kubernetesNamespace,
      });
      return mapKubernetesSecret(body);
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

  async createSecret(input: CreateSecretInput): Promise<Secret> {
    const id = `secret-${Math.random().toString(36).slice(2, 8)}`;
    const body = secretToKubernetesSecret({
      id,
      envVars: [],
      ...input,
    });
    const resource = await this.coreV1Api.createNamespacedSecret({
      namespace: config.kubernetesNamespace,
      body,
    });
    return mapKubernetesSecret(resource);
  }

  async archiveSecret(id: string): Promise<Secret> {
    return this.patchSecret(id, { archived: true });
  }

  async patchSecret(id: string, patch: SecretPatch): Promise<Secret> {
    const raw = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
    });
    if (!raw) {
      throw new Error(`Secret with id ${id} not found`);
    }
    const { data } = raw;
    const body = secretToKubernetesSecret(
      {
        ...mapKubernetesSecret(raw),
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
    return mapKubernetesSecret(resource);
  }

  async addEnvVar(id: string, envVar: EnvVar): Promise<Secret> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
    });
    const stringData = decodeSecretData(current.data ?? {});
    stringData[envVar.name] = envVar.value;
    return this._applyStringData(id, current, stringData);
  }

  async updateEnvVar(id: string, envVar: EnvVar): Promise<Secret> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: config.kubernetesNamespace,
    });
    const stringData = decodeSecretData(current.data ?? {});
    stringData[envVar.name] = envVar.value;
    return this._applyStringData(id, current, stringData);
  }

  async removeEnvVar(id: string, name: string): Promise<Secret> {
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
  ): Promise<Secret> {
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
    return mapKubernetesSecret(body);
  }
}
