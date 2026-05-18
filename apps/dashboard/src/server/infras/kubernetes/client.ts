import * as k8s from "@kubernetes/client-node";

import { EnvVar, Instance, InstanceInput, InstancePhase, Secret, SecretEnvVar } from "@/entities";
import { config } from "@/server/libs/config";
import {
  CreateOpenClawInstanceInput,
  CreateSecretInput,
  PatchOpenClawInstanceInput,
  Runtime,
  SecretPatch,
} from "../../usecases/adaptors/runtime";
import {
  OpenClawInstance,
  OpenClawInstanceList,
  OpenClawInstanceSpec,
} from "./types/openclaw-instance";

const enum OpenClawGroup {
  Default = "openclaw.rocks",
}
const enum OpenClawVersion {
  V1Alpha1 = "v1alpha1",
}
const enum OpenClawPlural {
  Instances = "openclawinstances",
}

const enum ClawAgentLabel {
  // https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/#labels
  ManagedBy = "app.kubernetes.io/managed-by",
  UserId = "clawagent.ai/user-id",
}
const enum ClawAgentLabelValue {
  ManagedBy = "clawagent",
}
const enum ClawAgentAnnotation {
  Name = "clawagent.ai/agent-name",
  Description = "clawagent.ai/agent-description",
  AgentType = "clawagent.ai/agent-type",
  SecretName = "clawagent.ai/secret-name",
  SecretDescription = "clawagent.ai/secret-description",
  SecretArchived = "clawagent.ai/secret-archived",
}

export function instanceToOpenClawInstance(instance: Instance): OpenClawInstance {
  const labels: Record<string, string> = {
    [ClawAgentLabel.ManagedBy]: ClawAgentLabelValue.ManagedBy,
    [ClawAgentLabel.UserId]: instance.userId,
  };

  const annotations: Record<string, string> = {};
  if (instance.agentName !== undefined) {
    annotations[ClawAgentAnnotation.Name] = instance.agentName;
  }
  if (instance.agentDescription !== undefined) {
    annotations[ClawAgentAnnotation.Description] = instance.agentDescription;
  }
  if (instance.agentType !== undefined) {
    annotations[ClawAgentAnnotation.AgentType] = instance.agentType;
  }

  const spec: Partial<OpenClawInstanceSpec> = {};
  if (instance.openClawJson !== undefined) {
    spec.config = { raw: instance.openClawJson };
  }
  if (instance.envVars !== undefined) {
    spec.env = instance.envVars.map((e) => ({ name: e.name, value: e.value }));
  }
  if (instance.secrets !== undefined) {
    spec.envFrom = instance.secrets.map((name) => ({ secretRef: { name } }));
  }
  if (instance.workspaceFiles !== undefined) {
    spec.workspace = { initialFiles: instance.workspaceFiles };
  }
  if (instance.skills !== undefined) {
    spec.skills = instance.skills;
  }
  if (instance.plugins !== undefined) {
    spec.plugins = instance.plugins;
  }
  if (instance.suspended !== undefined) {
    spec.suspended = instance.suspended;
  }
  if (instance.openClawVersion !== undefined) {
    spec.image = { tag: instance.openClawVersion };
  }

  return {
    apiVersion: `${OpenClawGroup.Default}/${OpenClawVersion.V1Alpha1}`,
    kind: "OpenClawInstance",
    metadata: {
      name: instance.id,
      namespace: config.kubernetesNamespace,
      labels,
      annotations,
    },
    spec,
  };
}

export function mapOpenClawInstance(raw: OpenClawInstance): Instance {
  return {
    id: raw.metadata?.name ?? "",
    userId: raw.metadata?.labels?.[ClawAgentLabel.UserId] ?? "",
    agentName: raw.metadata?.annotations?.[ClawAgentAnnotation.Name],
    agentDescription: raw.metadata?.annotations?.[ClawAgentAnnotation.Description],
    agentType: raw.metadata?.annotations?.[ClawAgentAnnotation.AgentType],
    openClawVersion: raw.spec.image?.tag,
    openClawJson: raw.spec.config?.raw,
    envVars: raw.spec.env?.map((e) => ({ name: e.name, value: e.value ?? "" })),
    secrets: raw.spec.envFrom?.flatMap((e) => (e.secretRef?.name ? [e.secretRef.name] : [])),
    workspaceFiles: raw.spec.workspace?.initialFiles,
    skills: raw.spec.skills,
    plugins: raw.spec.plugins,
    suspended: raw.spec.suspended,
    phase: raw.status?.phase as InstancePhase | undefined,
    createdAt: raw.metadata?.creationTimestamp,
    gatewayEndpoint: raw.status?.gatewayEndpoint,
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
        [ClawAgentLabel.ManagedBy]: ClawAgentLabelValue.ManagedBy,
        [ClawAgentLabel.UserId]: secret.userId,
      },
      annotations: {
        [ClawAgentAnnotation.SecretName]: secret.name,
        ...(secret.description !== undefined && {
          [ClawAgentAnnotation.SecretDescription]: secret.description,
        }),
        ...(secret.archived !== undefined && {
          [ClawAgentAnnotation.SecretArchived]: String(secret.archived),
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
    userId: raw.metadata?.labels?.[ClawAgentLabel.UserId] ?? "",
    name: raw.metadata?.annotations?.[ClawAgentAnnotation.SecretName] ?? "",
    description: raw.metadata?.annotations?.[ClawAgentAnnotation.SecretDescription],
    envVars,
    archived: raw.metadata?.annotations?.[ClawAgentAnnotation.SecretArchived] === "true",
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

  async listOpenClawInstances(): Promise<Instance[]> {
    const body = await this.customObjectsApi.listNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      labelSelector: `${ClawAgentLabel.ManagedBy}=${ClawAgentLabelValue.ManagedBy}`,
    });
    return (body as OpenClawInstanceList).items.map(mapOpenClawInstance);
  }

  async getOpenClawInstance(id: string): Promise<Instance | null> {
    try {
      const body = await this.customObjectsApi.getNamespacedCustomObject({
        namespace: config.kubernetesNamespace,
        group: OpenClawGroup.Default,
        version: OpenClawVersion.V1Alpha1,
        plural: OpenClawPlural.Instances,
        name: id,
      });
      return mapOpenClawInstance(body as OpenClawInstance);
    } catch {
      return null;
    }
  }

  async createOpenClawInstance(instanceInput: CreateOpenClawInstanceInput): Promise<Instance> {
    const id = `instance-${Math.random().toString(36).slice(2, 8)}`;
    const body = instanceToOpenClawInstance({
      id,
      ...instanceInput,
    });
    const resource = await this.customObjectsApi.createNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      body,
    });
    return mapOpenClawInstance(resource as OpenClawInstance);
  }

  async patchOpenClawInstance({ id, patch }: PatchOpenClawInstanceInput): Promise<Instance> {
    const raw = (await this.customObjectsApi.getNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      name: id,
    })) as OpenClawInstance;
    if (!raw) {
      throw new Error(`Instance with id ${id} not found`);
    }

    const body = instanceToOpenClawInstance({
      ...mapOpenClawInstance(raw),
      ...patch,
    });
    if (body.metadata && raw.metadata?.resourceVersion) {
      body.metadata.resourceVersion = raw.metadata.resourceVersion;
    }
    const resource = await this.customObjectsApi.replaceNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      name: id,
      body,
    });
    return mapOpenClawInstance(resource as OpenClawInstance);
  }

  async deleteOpenClawInstance(id: string): Promise<void> {
    await this.customObjectsApi.deleteNamespacedCustomObject({
      namespace: config.kubernetesNamespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      name: id,
    });
  }

  async listSecrets(): Promise<Secret[]> {
    const body = await this.coreV1Api.listNamespacedSecret({
      namespace: config.kubernetesNamespace,
      labelSelector: `${ClawAgentLabel.ManagedBy}=${ClawAgentLabelValue.ManagedBy}`,
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

  async getGatewayToken(instanceId: string): Promise<string | null> {
    let raw: OpenClawInstance | null = null;
    try {
      raw = (await this.customObjectsApi.getNamespacedCustomObject({
        namespace: config.kubernetesNamespace,
        group: OpenClawGroup.Default,
        version: OpenClawVersion.V1Alpha1,
        plural: OpenClawPlural.Instances,
        name: instanceId,
      })) as OpenClawInstance;
    } catch {
      return null;
    }

    const secretName = raw?.status?.managedResources?.gatewayTokenSecret;
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
