import * as k8s from "@kubernetes/client-node";

import { EnvVar, Instance, InstanceInput, InstancePhase, Secret, SecretEnvVar } from "@/entities";
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

const enum KubeClawLabel {
  // https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/#labels
  ManagedBy = "app.kubernetes.io/managed-by",
}
const enum KubeClawLabelValue {
  ManagedBy = "kubeclaw",
}
const enum KubeClawAnnotation {
  Name = "kubeclaw.xyz/agent-name",
  Description = "kubeclaw.xyz/agent-description",
  SecretName = "kubeclaw.xyz/secret-name",
  SecretDescription = "kubeclaw.xyz/secret-description",
  SecretArchived = "kubeclaw.xyz/secret-archived",
}

function mapOpenClawInstance(raw: OpenClawInstance): Instance {
  return {
    id: raw.metadata?.name ?? "",
    agentName: raw.metadata?.annotations?.[KubeClawAnnotation.Name],
    agentDescription: raw.metadata?.annotations?.[KubeClawAnnotation.Description],
    openClawJson: raw.spec.config?.raw,
    envVars: raw.spec.env?.map((e) => ({ name: e.name, value: e.value ?? "" })),
    secrets: raw.spec.envFrom?.flatMap((e) => (e.secretRef?.name ? [e.secretRef.name] : [])),
    workspaceFiles: raw.spec.workspace?.initialFiles,
    skills: raw.spec.skills,
    plugins: raw.spec.plugins,
    suspended: raw.spec.suspended,
    phase: raw.status?.phase as InstancePhase | undefined,
    createdAt: raw.metadata?.creationTimestamp,
  };
}

function instanceInputToSpec(instanceInput: InstanceInput): Partial<OpenClawInstanceSpec> {
  const spec: Partial<OpenClawInstanceSpec> = {};

  if (instanceInput.workspaceFiles !== undefined) {
    spec.workspace = { initialFiles: instanceInput.workspaceFiles };
  }
  if (instanceInput.skills !== undefined) {
    spec.skills = instanceInput.skills;
  }
  if (instanceInput.plugins !== undefined) {
    spec.plugins = instanceInput.plugins;
  }
  if (instanceInput.envVars !== undefined) {
    spec.env = instanceInput.envVars.map((e) => ({ name: e.name, value: e.value }));
  }
  if (instanceInput.secrets !== undefined) {
    spec.envFrom = instanceInput.secrets.map((name) => ({ secretRef: { name } }));
  }
  if (instanceInput.openClawJson !== undefined) {
    spec.config = { raw: instanceInput.openClawJson };
  }
  spec.selfConfigure = {
    enabled: true,
    allowedActions: ["skills", "config", "workspaceFiles", "envVars"],
  };

  return spec;
}

function instanceToSpec(instance: Partial<Omit<Instance, "name">>): Partial<OpenClawInstanceSpec> {
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
  return spec;
}

function decodeSecretData(data: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, b64Value] of Object.entries(data)) {
    result[key] = Buffer.from(b64Value, "base64").toString("utf-8");
  }
  return result;
}

function mapSecret(raw: k8s.V1Secret): Secret {
  const envVars: SecretEnvVar[] = Object.keys(raw.data ?? {}).map((name) => ({ name }));
  return {
    id: raw.metadata?.name ?? "",
    name: raw.metadata?.annotations?.[KubeClawAnnotation.SecretName] ?? "",
    description: raw.metadata?.annotations?.[KubeClawAnnotation.SecretDescription],
    envVars,
    archived: raw.metadata?.annotations?.[KubeClawAnnotation.SecretArchived] === "true",
    createdAt: raw.metadata?.creationTimestamp,
  };
}

export class KubernetesClient implements Runtime {
  private readonly kc: k8s.KubeConfig;
  private readonly customObjectsApi: k8s.CustomObjectsApi;
  private readonly coreV1Api: k8s.CoreV1Api;

  constructor(private readonly namespace: string) {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  async listOpenClawInstances(): Promise<Instance[]> {
    const body = await this.customObjectsApi.listNamespacedCustomObject({
      namespace: this.namespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      labelSelector: `${KubeClawLabel.ManagedBy}=${KubeClawLabelValue.ManagedBy}`,
    });
    return (body as OpenClawInstanceList).items.map(mapOpenClawInstance);
  }

  async getOpenClawInstance(id: string): Promise<Instance | null> {
    try {
      const body = await this.customObjectsApi.getNamespacedCustomObject({
        namespace: this.namespace,
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
    const spec = instanceInputToSpec(instanceInput);

    const body = await this.customObjectsApi.createNamespacedCustomObject({
      namespace: this.namespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      body: {
        apiVersion: `${OpenClawGroup.Default}/${OpenClawVersion.V1Alpha1}`,
        kind: "OpenClawInstance",
        metadata: {
          name: id,
          namespace: this.namespace,
          labels: { [KubeClawLabel.ManagedBy]: KubeClawLabelValue.ManagedBy },
          annotations: {
            [KubeClawAnnotation.Name]: instanceInput.agentName,
            [KubeClawAnnotation.Description]: instanceInput.agentDescription,
          },
        },
        spec,
      },
    });
    return mapOpenClawInstance(body as OpenClawInstance);
  }

  async patchOpenClawInstance({ id, patch }: PatchOpenClawInstanceInput): Promise<Instance> {
    const current = (await this.customObjectsApi.getNamespacedCustomObject({
      namespace: this.namespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      name: id,
    })) as OpenClawInstance;

    const specPatch = instanceToSpec(patch);
    const replaceBody: OpenClawInstance = {
      ...current,
      metadata: {
        ...current.metadata,
        annotations: {
          ...current.metadata?.annotations,
          ...(patch.agentName !== undefined && { [KubeClawAnnotation.Name]: patch.agentName }),
          ...(patch.agentDescription !== undefined && {
            [KubeClawAnnotation.Description]: patch.agentDescription,
          }),
        },
      },
      spec: { ...specPatch },
    };

    const body = await this.customObjectsApi.replaceNamespacedCustomObject({
      namespace: this.namespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      name: id,
      body: replaceBody,
    });
    return mapOpenClawInstance(body as OpenClawInstance);
  }

  async deleteOpenClawInstance(id: string): Promise<void> {
    await this.customObjectsApi.deleteNamespacedCustomObject({
      namespace: this.namespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      name: id,
    });
  }

  async listSecrets(): Promise<Secret[]> {
    const body = await this.coreV1Api.listNamespacedSecret({
      namespace: this.namespace,
      labelSelector: `${KubeClawLabel.ManagedBy}=${KubeClawLabelValue.ManagedBy}`,
    });
    return (body.items ?? []).map(mapSecret);
  }

  async getSecret(id: string): Promise<Secret | null> {
    try {
      const body = await this.coreV1Api.readNamespacedSecret({
        name: id,
        namespace: this.namespace,
      });
      return mapSecret(body);
    } catch {
      return null;
    }
  }

  async createSecret({ name, description }: CreateSecretInput): Promise<Secret> {
    const id = `secret-${Math.random().toString(36).slice(2, 8)}`;
    const annotations: Record<string, string> = {
      [KubeClawAnnotation.SecretName]: name,
    };
    if (description !== undefined) {
      annotations[KubeClawAnnotation.SecretDescription] = description;
    }
    const body = await this.coreV1Api.createNamespacedSecret({
      namespace: this.namespace,
      body: {
        apiVersion: "v1",
        kind: "Secret",
        type: "Opaque",
        metadata: {
          name: id,
          namespace: this.namespace,
          labels: { [KubeClawLabel.ManagedBy]: KubeClawLabelValue.ManagedBy },
          annotations,
        },
      },
    });
    return mapSecret(body);
  }

  async archiveSecret(id: string): Promise<Secret> {
    return this.patchSecret(id, { archived: true });
  }

  async patchSecret(id: string, patch: SecretPatch): Promise<Secret> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: this.namespace,
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: _data, stringData: _stringData, ...rest } = current;
    const body = await this.coreV1Api.replaceNamespacedSecret({
      name: id,
      namespace: this.namespace,
      body: {
        ...rest,
        metadata: {
          ...current.metadata,
          ...(current.metadata?.resourceVersion !== undefined && {
            resourceVersion: current.metadata.resourceVersion,
          }),
          annotations: {
            ...current.metadata?.annotations,
            ...(patch.name !== undefined && { [KubeClawAnnotation.SecretName]: patch.name }),
            ...(patch.description !== undefined && {
              [KubeClawAnnotation.SecretDescription]: patch.description,
            }),
            ...(patch.archived !== undefined && {
              [KubeClawAnnotation.SecretArchived]: String(patch.archived),
            }),
          },
        },
        ...(current.data !== undefined && { data: current.data }),
      },
    });
    return mapSecret(body);
  }

  async addEnvVar(id: string, envVar: EnvVar): Promise<Secret> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: this.namespace,
    });
    const stringData = decodeSecretData(current.data ?? {});
    stringData[envVar.name] = envVar.value;
    return this._applyStringData(id, current, stringData);
  }

  async updateEnvVar(id: string, envVar: EnvVar): Promise<Secret> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: this.namespace,
    });
    const stringData = decodeSecretData(current.data ?? {});
    stringData[envVar.name] = envVar.value;
    return this._applyStringData(id, current, stringData);
  }

  async removeEnvVar(id: string, name: string): Promise<Secret> {
    const current = await this.coreV1Api.readNamespacedSecret({
      name: id,
      namespace: this.namespace,
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
      namespace: this.namespace,
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
    return mapSecret(body);
  }
}
