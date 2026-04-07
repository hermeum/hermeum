import { PassThrough } from "node:stream";

import * as k8s from "@kubernetes/client-node";

import {
  CreateSandboxInput,
  Instance,
  RunCommandInput,
  Sandbox,
  Status,
  Template,
} from "@kubeclaw/entities";
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
import { Sandbox as K8sSandbox, SandboxList } from "./types/sandbox";
import { SandboxClaim as K8sSandboxClaim } from "./types/sandboxclaim";

const enum OpenClawGroup {
  Default = "openclaw.rocks",
}
const enum OpenClawVersion {
  V1Alpha1 = "v1alpha1",
}
const enum OpenClawPlural {
  Instances = "openclawinstances",
}

const enum AgentSandboxGroup {
  Default = "agents.x-k8s.io",
  // This group is used for extension CRDs, which is part of the agent-sandbox controller.
  Extensions = "extensions.agents.x-k8s.io",
}
const enum AgentSandboxVersion {
  V1Alpha1 = "v1alpha1",
}
const enum AgentSandboxPlural {
  Sandboxes = "sandboxes",
  SandboxClaims = "sandboxclaims",
}
const enum KubeClawLabel {
  // https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/#labels
  ManagedBy = "app.kubernetes.io/managed-by",
}
const enum KubeClawLabelValue {
  ManagedBy = "kubeclaw",
}

function mapStatus(conditions: k8s.V1Condition[] | undefined): Status {
  const get = (type: string) => conditions?.find((c) => c.type === type)?.status;

  if (get("Ready") === "True") return "success";
  if (get("DisruptionTarget") === "True") return "failed";
  if (get("Initialized") === "False" || get("ContainersReady") === "False") return "failed";
  return "pending";
}

function mapSandbox(sandbox: K8sSandbox): Sandbox | null {
  const name = sandbox.metadata?.name;
  const shutdownTime = sandbox.spec.shutdownTime ?? new Date(0).toISOString();

  if (!name) {
    return null;
  }

  return { name, shutdownTime, paused: false, status: mapStatus(sandbox.status?.conditions) };
}

function mapOpenClawInstance(raw: OpenClawInstance): Instance {
  const secretRef = raw.spec.envFrom?.find((e) => e.secretRef?.name)?.secretRef?.name;
  return {
    name: raw.metadata?.name ?? "",
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

  if (template.locked.initialFiles !== undefined) {
    spec.workspace = { initialFiles: template.locked.initialFiles };
  }
  if (template.locked.skills !== undefined) {
    spec.skills = template.locked.skills;
  }
  if (template.locked.plugins !== undefined) {
    spec.plugins = template.locked.plugins;
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

  async listSandboxes(): Promise<Sandbox[]> {
    const body = await this.customObjectsApi.listNamespacedCustomObject({
      namespace: this.namespace,
      group: AgentSandboxGroup.Default,
      version: AgentSandboxVersion.V1Alpha1,
      plural: AgentSandboxPlural.Sandboxes,
      labelSelector: `${KubeClawLabel.ManagedBy}=${KubeClawLabelValue.ManagedBy}`,
    });

    const sandboxes = body as SandboxList;
    return sandboxes.items.flatMap((sandbox) => {
      const mapped = mapSandbox(sandbox);
      return mapped ? [mapped] : [];
    });
  }

  async getSandbox(name: string): Promise<Sandbox | null> {
    const body = await this.customObjectsApi.getNamespacedCustomObject({
      namespace: this.namespace,
      group: AgentSandboxGroup.Default,
      version: AgentSandboxVersion.V1Alpha1,
      plural: AgentSandboxPlural.Sandboxes,
      name,
    });
    return mapSandbox(body as K8sSandbox);
  }

  async deleteSandbox({ name }: Sandbox): Promise<void> {
    // Step 1: Get the Sandbox and find the owning SandboxClaim via ownerReferences
    const sandboxBody = await this.customObjectsApi.getNamespacedCustomObject({
      namespace: this.namespace,
      group: AgentSandboxGroup.Default,
      version: AgentSandboxVersion.V1Alpha1,
      plural: AgentSandboxPlural.Sandboxes,
      name,
    });
    const sandbox = sandboxBody as K8sSandbox;
    const ownerRef = sandbox.metadata?.ownerReferences?.find((r) => r.kind === "SandboxClaim");
    if (!ownerRef) {
      throw new Error(`Sandbox ${name} has no SandboxClaim owner`);
    }

    // Step 2: Get the SandboxClaim and verify it has the kubeclaw managed-by label
    const claimBody = await this.customObjectsApi.getNamespacedCustomObject({
      namespace: this.namespace,
      group: AgentSandboxGroup.Extensions,
      version: AgentSandboxVersion.V1Alpha1,
      plural: AgentSandboxPlural.SandboxClaims,
      name: ownerRef.name,
    });
    const claim = claimBody as K8sSandboxClaim;
    if (claim.metadata?.labels?.[KubeClawLabel.ManagedBy] !== KubeClawLabelValue.ManagedBy) {
      throw new Error(`SandboxClaim ${ownerRef.name} is not managed by kubeclaw`);
    }

    // Step 3: Delete the SandboxClaim — controller cascades deletion to the Sandbox
    await this.customObjectsApi.deleteNamespacedCustomObject({
      namespace: this.namespace,
      group: AgentSandboxGroup.Extensions,
      version: AgentSandboxVersion.V1Alpha1,
      plural: AgentSandboxPlural.SandboxClaims,
      name: ownerRef.name,
    });
  }

  async createSandbox(input: CreateSandboxInput): Promise<Sandbox> {
    // Step 1: Create a SandboxClaim to leverage the agent-sandbox controller
    await this.customObjectsApi.createNamespacedCustomObject({
      namespace: this.namespace,
      group: AgentSandboxGroup.Extensions,
      version: AgentSandboxVersion.V1Alpha1,
      plural: AgentSandboxPlural.SandboxClaims,
      body: {
        apiVersion: `${AgentSandboxGroup.Extensions}/${AgentSandboxVersion.V1Alpha1}`,
        kind: "SandboxClaim",
        metadata: {
          name: input.name,
          labels: { [KubeClawLabel.ManagedBy]: KubeClawLabelValue.ManagedBy },
        },
        spec: { sandboxTemplateRef: { name: input.sandboxTemplate } },
      },
    });

    // Step 2: Watch SandboxClaim until status.sandbox.Name is populated
    const claim = await this.watchUntil<K8sSandboxClaim>(
      `/apis/${AgentSandboxGroup.Extensions}/${AgentSandboxVersion.V1Alpha1}/namespaces/${this.namespace}/${AgentSandboxPlural.SandboxClaims}`,
      `metadata.name=${input.name}`,
      (c) => !!c.status?.sandbox?.Name,
      10_000
    );
    const sandboxName = claim.status!.sandbox!.Name!;

    // Step 3: Label the sandbox to mark it as managed by kubeclaw
    await this.customObjectsApi.patchNamespacedCustomObject(
      {
        namespace: this.namespace,
        group: AgentSandboxGroup.Default,
        version: AgentSandboxVersion.V1Alpha1,
        plural: AgentSandboxPlural.Sandboxes,
        name: sandboxName,
        body: { metadata: { labels: { [KubeClawLabel.ManagedBy]: KubeClawLabelValue.ManagedBy } } },
      },
      k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch)
    );

    // Step 4: Watch the Sandbox until Ready; return failed status on timeout
    try {
      const sandbox = await this.watchUntil<K8sSandbox>(
        `/apis/${AgentSandboxGroup.Default}/${AgentSandboxVersion.V1Alpha1}/namespaces/${this.namespace}/${AgentSandboxPlural.Sandboxes}`,
        `metadata.name=${sandboxName}`,
        (s) =>
          s.status?.conditions?.some((c) => c.type === "Ready" && c.status === "True") ?? false,
        300_000
      );
      return (
        mapSandbox(sandbox) ?? {
          name: sandboxName,
          paused: false,
          status: "failed",
        }
      );
    } catch {
      return {
        name: sandboxName,
        paused: false,
        status: "failed",
      };
    }
  }

  private async watchUntil<T>(
    path: string,
    fieldSelector: string,
    predicate: (obj: T) => boolean,
    timeoutMs: number
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      let settled = false;

      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          fn();
        }
      };

      const timer = setTimeout(() => {
        settle(() => {
          req?.abort();
          reject(
            new Error(
              `Watch timed out after ${timeoutMs}ms: ${path}?fieldSelector=${fieldSelector}`
            )
          );
        });
      }, timeoutMs);

      const watch = new k8s.Watch(this.kc);
      let req: { abort: () => void };
      try {
        req = await watch.watch(
          path,
          { fieldSelector },
          (type: string, obj: T) => {
            if (type === "ADDED" || type === "MODIFIED") {
              if (predicate(obj)) {
                settle(() => {
                  req.abort();
                  resolve(obj);
                });
              }
            }
          },
          (err?: Error) => {
            settle(() => reject(err ?? new Error(`Watch ended unexpectedly: ${path}`)));
          }
        );
      } catch (err) {
        settle(() => reject(err));
      }
    });
  }

  async runCommand(
    input: RunCommandInput,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    onExit: (exitCode: number) => void
  ): Promise<void> {
    const sandbox = (await this.customObjectsApi.getNamespacedCustomObject({
      namespace: this.namespace,
      group: AgentSandboxGroup.Default,
      version: AgentSandboxVersion.V1Alpha1,
      plural: AgentSandboxPlural.Sandboxes,
      name: input.sandboxName,
    })) as K8sSandbox;

    const containerName = sandbox.spec.podTemplate.spec.containers[0]?.name;
    if (!containerName) {
      throw new Error(`Sandbox ${input.sandboxName} has no containers`);
    }

    await this.execInPod(
      input.sandboxName,
      containerName,
      input.command,
      onStdout,
      onStderr,
      onExit
    );
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

  private execInPod(
    podName: string,
    containerName: string,
    command: string[],
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    onExit: (exitCode: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      stdout.on("data", (c: Buffer) => onStdout(c.toString()));
      stderr.on("data", (c: Buffer) => onStderr(c.toString()));

      const exec = new k8s.Exec(this.kc);
      exec
        .exec(
          this.namespace,
          podName,
          containerName,
          command,
          stdout,
          stderr,
          null,
          false,
          (status) => {
            const causeCode = status.details?.causes?.find((c) => c.reason === "ExitCode")?.message;
            const exitCode =
              causeCode != null ? parseInt(causeCode, 10) : status.status === "Success" ? 0 : 1;
            onExit(exitCode);
            resolve();
          }
        )
        .catch(reject);
    });
  }
}
