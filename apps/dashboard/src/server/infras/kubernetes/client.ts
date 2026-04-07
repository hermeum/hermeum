import * as k8s from "@kubernetes/client-node";

import { Instance, Template } from "@kubeclaw/entities";
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

function mapOpenClawInstance(raw: OpenClawInstance): Instance {
  const secretRef = raw.spec.envFrom?.find((e) => e.secretRef?.name)?.secretRef?.name;
  return {
    name: raw.metadata?.name ?? "",
    selfConfigure: raw.spec.selfConfigure,
    config: raw.spec.config
      ? {
          configMapRef: raw.spec.config.configMapRef,
          raw: raw.spec.config.raw,
          mergeMode: raw.spec.config.mergeMode,
          format: raw.spec.config.format,
        }
      : undefined,
    envFromSecret: secretRef,
    initialFiles: raw.spec.workspace?.initialFiles,
    skills: raw.spec.skills,
    plugins: raw.spec.plugins,
    storage: {
      enabled: raw.spec.storage?.persistence?.enabled ?? true,
      size: raw.spec.storage?.persistence?.size ?? "",
      storageClass: raw.spec.storage?.persistence?.storageClass,
    },
  };
}

function templateToSpec(template: Template): Partial<OpenClawInstanceSpec> {
  const spec: Partial<OpenClawInstanceSpec> = {};

  if (template.locked.selfConfigure !== undefined) {
    spec.selfConfigure = template.locked.selfConfigure;
  }
  if (template.locked.initialFiles !== undefined) {
    spec.workspace = { initialFiles: template.locked.initialFiles };
  }
  if (template.locked.skills !== undefined) {
    spec.skills = template.locked.skills;
  }
  if (template.locked.plugins !== undefined) {
    spec.plugins = template.locked.plugins;
  }
  if (template.locked.config !== undefined) {
    spec.config = template.locked.config;
  }
  if (template.defaults.storage !== undefined) {
    const { storage } = template.defaults;
    spec.storage = {
      persistence: {
        enabled: storage.enabled,
        size: storage.size,
        ...(storage.storageClass !== undefined && { storageClass: storage.storageClass }),
      },
    };
  }

  return spec;
}

function instanceToSpec(instance: Partial<Omit<Instance, "name">>): Partial<OpenClawInstanceSpec> {
  const spec: Partial<OpenClawInstanceSpec> = {};

  if (instance.selfConfigure !== undefined) {
    spec.selfConfigure = instance.selfConfigure;
  }
  if (instance.config !== undefined) {
    spec.config = instance.config;
  }
  if (instance.envFromSecret !== undefined) {
    spec.envFrom = [{ secretRef: { name: instance.envFromSecret } }];
  }
  if (instance.initialFiles !== undefined) {
    spec.workspace = { initialFiles: instance.initialFiles };
  }
  if (instance.skills !== undefined) {
    spec.skills = instance.skills;
  }
  if (instance.plugins !== undefined) {
    spec.plugins = instance.plugins;
  }
  if (instance.storage !== undefined) {
    spec.storage = {
      persistence: {
        enabled: instance.storage.enabled,
        size: instance.storage.size,
        ...(instance.storage.storageClass !== undefined && {
          storageClass: instance.storage.storageClass,
        }),
      },
    };
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

  async getOpenClawInstance(name: string): Promise<Instance | null> {
    try {
      const body = await this.customObjectsApi.getNamespacedCustomObject({
        namespace: this.namespace,
        group: OpenClawGroup.Default,
        version: OpenClawVersion.V1Alpha1,
        plural: OpenClawPlural.Instances,
        name,
      });
      return mapOpenClawInstance(body as OpenClawInstance);
    } catch {
      return null;
    }
  }

  async createOpenClawInstanceByTemplate({
    name,
    template,
  }: CreateOpenClawInstanceInput): Promise<Instance> {
    const body = await this.customObjectsApi.createNamespacedCustomObject({
      namespace: this.namespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      body: {
        apiVersion: `${OpenClawGroup.Default}/${OpenClawVersion.V1Alpha1}`,
        kind: "OpenClawInstance",
        metadata: {
          name,
          namespace: this.namespace,
          labels: { [KubeClawLabel.ManagedBy]: KubeClawLabelValue.ManagedBy },
        },
        spec: templateToSpec(template),
      },
    });
    return mapOpenClawInstance(body as OpenClawInstance);
  }

  async patchOpenClawInstance({ name, patch }: PatchOpenClawInstanceInput): Promise<Instance> {
    const body = await this.customObjectsApi.patchNamespacedCustomObject(
      {
        namespace: this.namespace,
        group: OpenClawGroup.Default,
        version: OpenClawVersion.V1Alpha1,
        plural: OpenClawPlural.Instances,
        name,
        body: { spec: instanceToSpec(patch) },
      },
      k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch)
    );
    return mapOpenClawInstance(body as OpenClawInstance);
  }

  async deleteOpenClawInstance(name: string): Promise<void> {
    await this.customObjectsApi.deleteNamespacedCustomObject({
      namespace: this.namespace,
      group: OpenClawGroup.Default,
      version: OpenClawVersion.V1Alpha1,
      plural: OpenClawPlural.Instances,
      name,
    });
  }
}
