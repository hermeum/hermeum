import type { Agent, AgentInput } from "./schema";

// API server settings can be configured via config.yaml
// (config.gateway.api_server.enabled / port) or via env vars
// (API_SERVER_ENABLED / API_SERVER_PORT). Environment variables take
// precedence over the config values when both are set (upstream behavior);
// the config block acts as a fallback when the env var is absent. The
// bearer token (API_SERVER_KEY) is env-only — Hermeum does not surface it
// in config.yaml.
// See docs/hermes-config/api-server.md.
const API_SERVER_DEFAULT_PORT = 8642;

export function isApiServerEnabled(input: AgentInput): boolean {
  const envRaw = input.env?.find((v) => v.name === "API_SERVER_ENABLED")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    return envRaw.toLowerCase() === "true";
  }
  return input.config?.gateway?.api_server?.enabled ?? false;
}

export function getApiServerPort(input: AgentInput): number {
  const envRaw = input.env?.find((v) => v.name === "API_SERVER_PORT")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    const n = Number(envRaw);
    return Number.isInteger(n) && n > 0 ? n : API_SERVER_DEFAULT_PORT;
  }
  const configPort = input.config?.gateway?.api_server?.port;
  if (configPort !== undefined && configPort > 0) return configPort;
  return API_SERVER_DEFAULT_PORT;
}

// Webhook settings can be configured via config.yaml
// (config.platforms.webhook.enabled / extra.port) or via env vars
// (WEBHOOK_ENABLED / WEBHOOK_PORT). config.yaml is preferred and takes
// precedence over the env vars; the env vars act as a fallback when the
// corresponding config field is absent.
const WEBHOOK_DEFAULT_PORT = 8644;

export function isWebhookEnabled(input: AgentInput): boolean {
  const configEnabled = input.config?.platforms?.webhook?.enabled;
  if (configEnabled !== undefined) return configEnabled;
  return (
    input.env?.some(
      (v) => v.name === "WEBHOOK_ENABLED" && v.value.toLowerCase() === "true",
    ) ?? false
  );
}

export function getWebhookPort(input: AgentInput): number {
  const configPort = input.config?.platforms?.webhook?.extra?.port;
  if (configPort !== undefined) return configPort;
  const envRaw = input.env?.find((v) => v.name === "WEBHOOK_PORT")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    const n = Number(envRaw);
    return Number.isInteger(n) && n > 0 ? n : WEBHOOK_DEFAULT_PORT;
  }
  return WEBHOOK_DEFAULT_PORT;
}

// Teams is an HTTP webhook platform (like webhook / api-server). Credentials
// (client_id, client_secret, tenant_id) are env-only (TEAMS_*) — they must not
// be written into config.yaml. An explicit `enabled` flag overrides the
// credentials-presence detection (set false to disable while keeping creds);
// when `enabled` is absent, Teams is on when all three TEAMS_* env vars are set.
const TEAMS_DEFAULT_PORT = 3978;
const TEAMS_REQUIRED_ENV_VARS = ["TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET", "TEAMS_TENANT_ID"];

function hasAllTeamsCredentials(input: AgentInput): boolean {
  return TEAMS_REQUIRED_ENV_VARS.every(
    (name) => input.env?.some((v) => v.name === name && v.value.trim() !== "") ?? false,
  );
}

export function isTeamsEnabled(input: AgentInput): boolean {
  const enabledFlag = input.config?.platforms?.teams?.enabled;
  if (enabledFlag !== undefined) return enabledFlag;
  return hasAllTeamsCredentials(input);
}

export function getTeamsPort(input: AgentInput): number {
  const configPort = input.config?.platforms?.teams?.extra?.port;
  if (configPort !== undefined) return configPort;
  const envRaw = input.env?.find((v) => v.name === "TEAMS_PORT")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    const n = Number(envRaw);
    return Number.isInteger(n) && n > 0 ? n : TEAMS_DEFAULT_PORT;
  }
  return TEAMS_DEFAULT_PORT;
}

// Message-platform availability — a derived, read-only view of which inbound
// message platforms are wired up for an agent, computed from its config + env.
// Not persisted.
// https://hermes-agent.nousresearch.com/docs/user-guide/messaging

export enum PlatformId {
  ApiServer = "api-server",
  Webhook = "webhook",
  Slack = "slack",
  Discord = "discord",
  Teams = "teams",
}

export interface PlatformAvailability {
  status: "available" | "unavailable";
  /** Short explanation shown when status is not "available". */
  reason?: string;
  /** Listening port for HTTP platforms (api-server, webhook). */
  port?: number;
  /** Home channel for chat platforms (slack only), if configured. */
  home?: string;
  /**
   * Fully-qualified endpoint URLs for this platform (base + subpath).
   * For ingress endpoints the base carries no port (routing is by path).
   * For internal (`*.svc.cluster.local`) endpoints the per-platform port is
   * inserted before the subpath. Absent when the platform has no inbound HTTP
   * surface (e.g. Slack Socket Mode) or when `agent.endpoint` is null.
   */
  endpoints?: string[];
}

/**
 * Ingress subpaths per platform, ordered by display priority.
 * `/health` is intentionally excluded — it is an infra health probe, not a
 * messaging endpoint users interact with. Single source of truth for both
 * the UI (`derivePlatformAvailability`) and the ingress builder
 * (`server/infras/kubernetes/client.ts`).
 */
export const PLATFORM_INGRESS_SUBPATHS: Partial<Record<PlatformId, string[]>> = {
  // /v1 is the main OpenAI-compatible path; /api is the generic alias.
  [PlatformId.ApiServer]: ["/v1", "/api"],
  [PlatformId.Webhook]: ["/webhooks"],
  // Teams Bot Framework posts inbound messages to /api/messages.
  // Must be emitted before the api-server /api prefix in the ingress so
  // the longest-prefix match routes to the Teams port (3978), not 8642.
  [PlatformId.Teams]: ["/api/messages"],
  // Slack uses Socket Mode — no inbound HTTP subpath.
};

interface PlatformMeta {
  label: string;
  description: string;
}

const PLATFORM_META: Record<PlatformId, PlatformMeta> = {
  [PlatformId.ApiServer]: {
    label: "API Server",
    description: "OpenAI-compatible HTTP endpoint for frontends like Open WebUI.",
  },
  [PlatformId.Webhook]: {
    label: "Webhook",
    description: "HTTP server that accepts signed webhooks and routes them to the agent.",
  },
  [PlatformId.Slack]: {
    label: "Slack",
    description: "Slack bot relayed through the gateway (Socket Mode).",
  },
  [PlatformId.Discord]: {
    label: "Discord",
    description: "Discord bot relayed through the gateway (WebSocket).",
  },
  [PlatformId.Teams]: {
    label: "Teams",
    description: "Microsoft Teams bot relayed through the gateway (HTTPS webhook).",
  },
};

export function getPlatformLabel(id: PlatformId): string {
  return PLATFORM_META[id].label;
}

export function getPlatformDescription(id: PlatformId): string {
  return PLATFORM_META[id].description;
}

/** Ordered platform list for UI rendering. */
export const PLATFORM_IDS: readonly PlatformId[] = [
  PlatformId.ApiServer,
  PlatformId.Webhook,
  PlatformId.Slack,
  PlatformId.Discord,
  PlatformId.Teams,
];

const SLACK_REQUIRED_ENV_VARS = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_ALLOWED_USERS"];

export function derivePlatformAvailability(id: PlatformId, agent: Agent): PlatformAvailability {
  const env = agent.env ?? [];
  const subpaths = PLATFORM_INGRESS_SUBPATHS[id];

  switch (id) {
    case PlatformId.ApiServer: {
      if (!isApiServerEnabled(agent)) {
        return {
          status: "unavailable",
          reason: "Set API_SERVER_ENABLED=true (or config.gateway.api_server.enabled).",
        };
      }
      const port = getApiServerPort(agent);
      return {
        status: "available",
        port,
        ...endpointsFor(agent.endpoint, subpaths, port),
      };
    }
    case PlatformId.Webhook: {
      if (!isWebhookEnabled(agent)) {
        return {
          status: "unavailable",
          reason: "Set WEBHOOK_ENABLED=true (or config.platforms.webhook.enabled).",
        };
      }
      const port = getWebhookPort(agent);
      return {
        status: "available",
        port,
        ...endpointsFor(agent.endpoint, subpaths, port),
      };
    }
    case PlatformId.Slack: {
      const isSet = (name: string) =>
        env.some((v) => v.name === name && v.value.trim() !== "");
      const missing = SLACK_REQUIRED_ENV_VARS.filter((name) => !isSet(name));
      if (missing.length > 0) {
        return {
          status: "unavailable",
          reason: `Missing env var${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
        };
      }
      const home = env.find((v) => v.name === "SLACK_HOME_CHANNEL")?.value;
      const homeName = env.find((v) => v.name === "SLACK_HOME_CHANNEL_NAME")?.value;
      if (home) {
        return { status: "available", home: homeName ? `${home} (${homeName})` : home };
      }
      return { status: "available" };
    }
    case PlatformId.Discord: {
      const hasToken = env.some(
        (v) => v.name === "DISCORD_BOT_TOKEN" && v.value.trim() !== "",
      );
      if (!hasToken) {
        return { status: "unavailable", reason: "Missing env var: DISCORD_BOT_TOKEN." };
      }
      const home = env.find((v) => v.name === "DISCORD_HOME_CHANNEL")?.value;
      const homeName = env.find((v) => v.name === "DISCORD_HOME_CHANNEL_NAME")?.value;
      if (home) {
        return { status: "available", home: homeName ? `${home} (${homeName})` : home };
      }
      return { status: "available" };
    }
    case PlatformId.Teams: {
      // An explicit `enabled: false` short-circuits to unavailable even when
      // credentials are present.
      if (!isTeamsEnabled(agent)) {
        const enabledFlag = agent.config?.platforms?.teams?.enabled;
        if (enabledFlag === false) {
          return { status: "unavailable", reason: "Disabled by config.platforms.teams.enabled." };
        }
        const missing = TEAMS_REQUIRED_ENV_VARS.filter(
          (name) => !env.some((v) => v.name === name && v.value.trim() !== ""),
        );
        return {
          status: "unavailable",
          reason: `Missing env var${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
        };
      }
      const port = getTeamsPort(agent);
      return {
        status: "available",
        port,
        ...endpointsFor(agent.endpoint, subpaths, port),
      };
    }
  }
}

/**
 * Spread helper: returns `{ endpoints }` when both a base endpoint and at
 * least one subpath are present, otherwise `{}` (so the field stays absent).
 *
 * Internal endpoints (base containing `.svc.cluster.local`) need the
 * per-platform port inserted before the subpath, since each platform listens
 * on its own port. Ingress endpoints route by path on a single host, so no
 * port is inserted.
 */
function endpointsFor(
  endpoint: string | null | undefined,
  subpaths: readonly string[] | undefined,
  port: number | undefined,
): { endpoints?: string[] } {
  if (!endpoint || !subpaths || subpaths.length === 0) return {};
  if (endpoint.includes(".svc.cluster.local")) {
    if (port === undefined) return {};
    return { endpoints: subpaths.map((p) => `${endpoint}:${port}${p}`) };
  }
  return { endpoints: subpaths.map((p) => `${endpoint}${p}`) };
}