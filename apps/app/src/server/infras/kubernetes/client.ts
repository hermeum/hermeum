import * as k8s from "@kubernetes/client-node";

import { Agent, ENV_SECRET_SENTINEL, Env, EnvVar, SharedEnvSet } from "@/entities";
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
import {
  agentEnvResourceName,
  agentEnvToConfigMap,
  agentEnvToSecret,
  agentToHermesAgent,
  decodeSecretData,
  isSharedEnvSetSecret,
  mapHermesAgent,
  mapKubernetesSecretToSharedEnvSet,
  maskSensitiveEnv,
  sharedEnvSetToKubernetesSecret,
  splitAgentEnv,
} from "./mapper";
import { HermesAgent, HermesAgentList } from "./types/hermes-agent";

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