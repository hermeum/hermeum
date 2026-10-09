import { createHash } from "node:crypto";

import * as k8s from "@kubernetes/client-node";

import {
  Agent,
  AgentEndpoints,
  AgentPhase,
  ENV_SECRET_SENTINEL,
  Env,
  PLATFORM_INGRESS_LABELS,
  PlatformId,
  SharedEnvSet,
  SharedEnvSetEnvVar,
  getApiServerPort,
  getTeamsPort,
  getWebhookPort,
  isApiServerEnabled,
  isTeamsEnabled,
  isWebhookEnabled,
} from "@/entities";
import { config } from "@/server/libs/config";
import { HermesAgent, HermesAgentSpec, HermesConfig, Ingress, IngressHost, ServicePort } from "./types/hermes-agent";

const enum HermesGroup {
  Default = "agents.hermeum.app",
}
const enum HermesVersion {
  V1Alpha1 = "v1alpha1",
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

// Build the ingress host for one platform:
// <agent-id>.<platform-label>.<base-hostname>, or with flattenHosts enabled,
// <agent-id>-<platform-label>.<base-hostname> (single DNS level).
function ingressHostFor(agentId: string, platform: PlatformId): string {
  const label = PLATFORM_INGRESS_LABELS[platform];
  if (label === undefined) {
    throw new Error(`No ingress subdomain label configured for platform "${platform}"`);
  }
  const agentLabel = config.agentIngressFlattenHosts ? `${agentId}-${label}` : `${agentId}.${label}`;
  return `${agentLabel}.${config.agentIngressBaseHostname ?? ""}`;
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
  // Enable self-hosted sidecars when the agent asks for them.
  // SearXNG: web search backend; Camofox: browser automation cloud provider.
  let searxngEnabled = false;
  let camofoxEnabled = false;
  if (agent.config !== undefined) {
    searxngEnabled =
      agent.config.web?.search_backend === "searxng" ||
      agent.config.web?.backend === "searxng";
    camofoxEnabled = agent.config.browser?.cloud_provider === "camofox";
    hermes.config = { raw: agent.config };
  }
  // Expose the API server container + service ports when the agent opts in via
  // the API_SERVER_ENABLED env var OR config.gateway.api_server.enabled
  // (env takes precedence over config).
  const apiServerPort = isApiServerEnabled(agent) ? getApiServerPort(agent) : null;
  // Expose the webhook container + service ports when the agent opts in via
  // the WEBHOOK_ENABLED env var OR config.platforms.webhook.enabled.
  const webhookPort = isWebhookEnabled(agent) ? getWebhookPort(agent) : null;
  // Expose the Teams bot container + service ports when the agent is enabled
  // via config.platforms.teams.enabled OR the TEAMS_* credentials being
  // present (env or config). Teams listens on /api/messages (default 3978).
  const teamsPort = isTeamsEnabled(agent) ? getTeamsPort(agent) : null;
  const servicePorts: ServicePort[] = [];
  if (apiServerPort !== null) {
    hermes.ports = [
      ...(hermes.ports ?? []),
      { name: "api-server", containerPort: apiServerPort, protocol: "TCP" },
    ];
    servicePorts.push({
      name: "api-server",
      port: apiServerPort,
      targetPort: apiServerPort,
      protocol: "TCP",
    });
  }
  if (webhookPort !== null) {
    hermes.ports = [
      ...(hermes.ports ?? []),
      { name: "webhook", containerPort: webhookPort, protocol: "TCP" },
    ];
    servicePorts.push({
      name: "webhook",
      port: webhookPort,
      targetPort: webhookPort,
      protocol: "TCP",
    });
  }
  if (teamsPort !== null) {
    hermes.ports = [
      ...(hermes.ports ?? []),
      { name: "teams", containerPort: teamsPort, protocol: "TCP" },
    ];
    servicePorts.push({
      name: "teams",
      port: teamsPort,
      targetPort: teamsPort,
      protocol: "TCP",
    });
  }
  // Ingress is generated only when the operator configures a base hostname —
  // routing inbound traffic from message platforms (api-server, webhook,
  // teams) to the agent's Service. Each HTTP platform gets its own host
  // <agent-id>.<platform-label>.<base-hostname> (or, with flattenHosts,
  // <agent-id>-<platform-label>.<base-hostname>) mapped to the platform's
  // Service port. Routing is entirely host-based: the whole host maps to
  // the platform's Service port, so no subpath rules are needed.
  let ingress: Ingress | undefined;
  if (servicePorts.length > 0 && config.agentIngressBaseHostname !== undefined) {
    const ingressHosts: IngressHost[] = [];
    if (webhookPort !== null) {
      ingressHosts.push({
        host: ingressHostFor(agent.id, PlatformId.Webhook),
        paths: [{ path: "/", pathType: "Prefix", port: webhookPort }],
      });
    }
    if (teamsPort !== null) {
      ingressHosts.push({
        host: ingressHostFor(agent.id, PlatformId.Teams),
        paths: [{ path: "/", pathType: "Prefix", port: teamsPort }],
      });
    }
    if (apiServerPort !== null) {
      ingressHosts.push({
        host: ingressHostFor(agent.id, PlatformId.ApiServer),
        paths: [{ path: "/", pathType: "Prefix", port: apiServerPort }],
      });
    }
    const hosts = ingressHosts.map((h) => h.host);
    ingress = {
      enabled: true,
      ...(config.agentIngressClassName !== undefined && { className: config.agentIngressClassName }),
      annotations: {},
      hosts: ingressHosts,
      // TLS is emitted only when a TLS secret name is configured — i.e. TLS is
      // terminated at the ingress controller. When unset, no tls block is
      // emitted, which covers both plain HTTP and load-balancer-terminated TLS
      // (the LB handles the cert; the ingress receives plain HTTP). The secret
      // must cover every emitted host (e.g. a wildcard cert per platform
      // label, *.hooks.<base> / *.api.<base> / *.teams.<base>, or — with
      // flattenHosts — a single wildcard *.<base>).
      ...(config.agentIngressTlsSecretName !== undefined && {
        tls: [
          {
            hosts,
            secretName: config.agentIngressTlsSecretName,
          },
        ],
      }),
    };
  }
  const networking =
    servicePorts.length > 0
      ? {
          service: { ports: servicePorts },
          ...(ingress !== undefined && { ingress }),
        }
      : undefined;
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
  // Pure CR translation of the plugin list — which plugins are installed is
  // use-case policy (AgentUseCase managed-aspect pipeline). The hermeum
  // plugin's CR entry carries enable: true — a CR-shape concern: the entity
  // Plugins type is plain identifier strings and can't express the flag.
  if (agent.plugins !== undefined) {
    hermes.plugins = agent.plugins.map((identifier) => ({
      identifier,
      ...(identifier === config.hermesPluginIdentifier && { enable: true as const }),
    }));
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
  // Container-level env the agent can't reach through its workspace .env —
  // the config.yaml write guard. (The hermeum plugin's endpoint env var is
  // agent-managed .env, injected by the AgentUseCase managed-aspect pipeline.)
  hermes.env = [{ name: "HERMES_WRITE_SAFE_ROOT", value: "/opt/data:/tmp" }];

  const spec: HermesAgentSpec = {
    ...(agent.suspended !== undefined && { suspend: agent.suspended }),
    ...(Object.keys(hermes).length > 0 && { hermes: hermes as HermesAgentSpec["hermes"] }),
    ...(searxngEnabled && { searxng: { enabled: true } }),
    ...(camofoxEnabled && { camofox: { enabled: true } }),
    ...(networking !== undefined && { networking }),
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

// Rebuild the agent config from the CR. API server settings are configured
// via env vars, so all typed config fields pass through `raw` unchanged.
export function mapHermesConfig(config: HermesConfig | undefined): Agent["config"] {
  return config?.raw;
}

// Derive the agent's per-platform base endpoint URLs — one entry per HTTP
// platform (PlatformId), always fully populated: an endpoint is set only when
// the platform is available (its Service port exists), null otherwise.
//
// When the operator configures agentIngressBaseHostname, ingress hosts are
// deterministic — <agent-id>.<platform-label>.<base> (or, with flattenHosts,
// <agent-id>-<platform-label>.<base>) per enabled platform, authored by
// agentToHermesAgent — so URLs are constructed directly from config + the
// CR's Service ports. Host-routed, so no port appears in the URL.
//
// When no base hostname is configured, platforms fall back to the in-cluster
// Service DNS at
// `http://${agent.id}.${kubernetesNamespace}.svc.cluster.local` with the
// platform's Service port embedded — different platforms listen on different
// ports.
export function buildAgentEndpoints(raw: HermesAgent): AgentEndpoints {
  const id = raw.metadata?.name ?? "";
  const servicePorts = raw.spec.networking?.service?.ports ?? [];
  const endpoint = (platform: keyof AgentEndpoints): string | null => {
    const port = servicePorts.find((p) => p.name === platform)?.port;
    if (port === undefined) return null;
    if (config.agentIngressBaseHostname !== undefined) {
      return `${config.agentIngressScheme}://${ingressHostFor(id, platform)}`;
    }
    return `http://${id}.${config.kubernetesNamespace}.svc.cluster.local:${port}`;
  };
  return {
    [PlatformId.ApiServer]: endpoint(PlatformId.ApiServer),
    [PlatformId.Webhook]: endpoint(PlatformId.Webhook),
    [PlatformId.Teams]: endpoint(PlatformId.Teams),
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
    endpoints: buildAgentEndpoints(raw),
    sharedEnvSets: raw.spec.hermes?.envFrom?.flatMap((e) =>
      e.secretRef?.name ? [e.secretRef.name] : []
    ),
    soul: raw.spec.hermes?.workspace?.files?.["SOUL.md"],
    skills: raw.spec.hermes?.skills?.map((s) => s.identifier),
    // Pure CR translation — the use case filters the auto-installed hermeum
    // plugin out of the user-facing list on read.
    plugins: raw.spec.hermes?.plugins?.map((p) => p.identifier),
    packages: raw.spec.hermes?.packages && {
      ...(raw.spec.hermes.packages.pip?.install !== undefined && {
        pip: raw.spec.hermes.packages.pip.install,
      }),
      ...(raw.spec.hermes.packages.npm?.install !== undefined && {
        npm: raw.spec.hermes.packages.npm.install,
      }),
    },
    // prompt is required by AgentCronSchema; app-authored crons always set it.
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
    reason: raw.status?.reason,
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

export function decodeSecretData(data: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, b64Value] of Object.entries(data)) {
    result[key] = Buffer.from(b64Value, "base64").toString("utf-8");
  }
  return result;
}

export function isSharedEnvSetSecret(raw: k8s.V1Secret): boolean {
  const labels = raw.metadata?.labels;
  return (
    labels?.[HermeumLabel.ManagedBy] === HermeumLabelValue.ManagedBy &&
    labels?.[HermeumLabel.Resource] === HermeumLabelValue.SharedEnvSet
  );
}

export function mapKubernetesSecretToSharedEnvSet(raw: k8s.V1Secret): SharedEnvSet {
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