import * as k8s from "@kubernetes/client-node";

import { CreateSandboxInput, Sandbox, Status } from "@kubebox/entities";
import { Runtime } from "../../usecases/adaptors/runtime";
import { Sandbox as K8sSandbox, SandboxList } from "./types/sandbox";
import { SandboxClaim as K8sSandboxClaim } from "./types/sandboxclaim";

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
const enum KubeBoxLabel {
  // https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/#labels
  ManagedBy = "app.kubernetes.io/managed-by",
}
const enum KubeBoxLabelValue {
  ManagedBy = "kubebox",
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
      labelSelector: `${KubeBoxLabel.ManagedBy}=${KubeBoxLabelValue.ManagedBy}`,
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

    // Step 2: Get the SandboxClaim and verify it has the kubebox managed-by label
    const claimBody = await this.customObjectsApi.getNamespacedCustomObject({
      namespace: this.namespace,
      group: AgentSandboxGroup.Extensions,
      version: AgentSandboxVersion.V1Alpha1,
      plural: AgentSandboxPlural.SandboxClaims,
      name: ownerRef.name,
    });
    const claim = claimBody as K8sSandboxClaim;
    if (claim.metadata?.labels?.[KubeBoxLabel.ManagedBy] !== KubeBoxLabelValue.ManagedBy) {
      throw new Error(`SandboxClaim ${ownerRef.name} is not managed by kubebox`);
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
          labels: { [KubeBoxLabel.ManagedBy]: KubeBoxLabelValue.ManagedBy },
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

    // Step 3: Label the sandbox to mark it as managed by kubebox
    await this.customObjectsApi.patchNamespacedCustomObject(
      {
        namespace: this.namespace,
        group: AgentSandboxGroup.Default,
        version: AgentSandboxVersion.V1Alpha1,
        plural: AgentSandboxPlural.Sandboxes,
        name: sandboxName,
        body: { metadata: { labels: { [KubeBoxLabel.ManagedBy]: KubeBoxLabelValue.ManagedBy } } },
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
}
