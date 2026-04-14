import * as k8s from "@kubernetes/client-node";

import { Instance, InstanceInput, InstancePhase } from "@/entities";
import {
  CreateOpenClawInstanceInput,
  PatchOpenClawInstanceInput,
  Runtime,
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
}

function mapOpenClawInstance(raw: OpenClawInstance): Instance {
  return {
    id: raw.metadata?.name ?? "",
    agentName: raw.metadata?.annotations?.[KubeClawAnnotation.Name],
    openClawJson: raw.spec.config?.raw,
    env: raw.spec.env?.map((e) => ({ name: e.name, value: e.value ?? "" })),
    workspaceFiles: raw.spec.workspace?.initialFiles,
    skills: raw.spec.skills,
    plugins: raw.spec.plugins,
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
  if (instanceInput.env !== undefined) {
    spec.env = instanceInput.env.map((e) => ({ name: e.name, value: e.value }));
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
  if (instance.env !== undefined) {
    spec.env = instance.env.map((e) => ({ name: e.name, value: e.value }));
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
  return spec;
}

export class KubernetesClient implements Runtime {
  private readonly kc: k8s.KubeConfig;
  private readonly customObjectsApi: k8s.CustomObjectsApi;
  constructor(private readonly namespace: string) {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
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

  async createOpenClawInstance({
    id,
    instanceInput,
  }: CreateOpenClawInstanceInput): Promise<Instance> {
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
          annotations: { [KubeClawAnnotation.Name]: instanceInput.agentName },
        },
        spec,
      },
    });
    return mapOpenClawInstance(body as OpenClawInstance);
  }

  async patchOpenClawInstance({ id, patch }: PatchOpenClawInstanceInput): Promise<Instance> {
    const patchBody: Record<string, unknown> = { spec: instanceToSpec(patch) };
    if (patch.agentName !== undefined) {
      patchBody.metadata = { annotations: { [KubeClawAnnotation.Name]: patch.agentName } };
    }
    const body = await this.customObjectsApi.patchNamespacedCustomObject(
      {
        namespace: this.namespace,
        group: OpenClawGroup.Default,
        version: OpenClawVersion.V1Alpha1,
        plural: OpenClawPlural.Instances,
        name: id,
        body: patchBody,
      },
      k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch)
    );
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
}
