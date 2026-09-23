import type { Agent, AgentInput } from "./schema";

// API server settings can be configured via config.yaml
// (config.gateway.api_server.enabled / port) or via env vars
// (API_SERVER_ENABLED / API_SERVER_PORT). Environment variables take
// precedence over the config values when both are set (upstream behavior);
// the config block acts as a fallback when the env var is absent. The
// bearer token is env-only (API_SERVER_KEY, sensitive) — hermes-agent does
// not expand ${VAR} references on the gateway config-load path (upstream
// issue #119733). See docs/official/api-server.md.
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

// Webhook enablement is env-only (WEBHOOK_ENABLED=true): hermes-agent
// drops WEBHOOK_SECRET/WEBHOOK_PORT unless WEBHOOK_ENABLED is also truthy,
// even when the platform is enabled via config.yaml
// (platforms.webhook.enabled) — upstream issue #119763. Until that is
// fixed, config.platforms.webhook carries only routes and other
// non-secret settings; enabling the platform (and the reserved
// WEBHOOK_SECRET env entry) stays on the env-var path.
const WEBHOOK_DEFAULT_PORT = 8644;

export function isWebhookEnabled(input: AgentInput): boolean {
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

// Teams is an HTTP webhook platform (like webhook / api-server). The
// client secret is env-only (the sensitive TEAMS_CLIENT_SECRET env entry)
// — hermes-agent does not expand ${VAR} references under platforms: on the
// gateway config-load path (upstream issue #119733). client_id and
// tenant_id are non-secret and accepted from either source: config
// (platforms.teams.extra) or their TEAMS_* env vars (Teams reads
// env-first, so literal config values work). An explicit `enabled` flag
// overrides the credentials-presence detection (set false to disable
// while keeping creds); when `enabled` is absent, Teams is on when all
// three credentials are set.
const TEAMS_DEFAULT_PORT = 3978;

function hasAllTeamsCredentials(input: AgentInput): boolean {
  const extra = input.config?.platforms?.teams?.extra;
  const hasEnv = (name: string) =>
    input.env?.some((v) => v.name === name && v.value.trim() !== "") ?? false;
  return (
    ((extra?.client_id !== undefined && extra.client_id.trim() !== "") || hasEnv("TEAMS_CLIENT_ID")) &&
    hasEnv("TEAMS_CLIENT_SECRET") &&
    ((extra?.tenant_id !== undefined && extra.tenant_id.trim() !== "") || hasEnv("TEAMS_TENANT_ID"))
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
  /** Home channel for chat platforms (slack only), if configured. */
  home?: string;
  /**
   * Base endpoint URL for this platform, when available.
   * For ingress endpoints the URL carries no port — each HTTP platform gets
   * its own host (`<agent-id>.<platform-label>.<base hostname>`, or
   * `<agent-id>-<platform-label>.<base hostname>` when hosts are flattened).
   * For internal (`*.svc.cluster.local`) endpoints the platform's Service
   * port is embedded. Absent when the platform has no inbound HTTP surface
   * (e.g. Slack Socket Mode) or when the platform's entry in
   * `agent.endpoints` is null.
   */
  endpoint?: string;
}

/**
 * Ingress host labels per HTTP platform.
 * Each platform is exposed on its own host
 * `<agent-id>.<label>.<base hostname>` — or, when hosts are flattened,
 * `<agent-id>-<label>.<base hostname>` — mapped wholesale to the platform's
 * Service port (routing is host-based; the whole host is the backend's
 * root). Slack/Discord are gateway-relayed and have no inbound HTTP surface.
 */
export const PLATFORM_INGRESS_LABELS: Partial<Record<PlatformId, string>> = {
  [PlatformId.ApiServer]: "api",
  [PlatformId.Webhook]: "hooks",
  [PlatformId.Teams]: "teams",
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
  // Full-qualified endpoint URL per platform, authored by buildAgentEndpoints
  // — null when the platform has no inbound HTTP surface. Only the HTTP
  // platforms (api-server / webhook / teams) carry keys in the map.
  const endpoint: string | undefined =
    id === PlatformId.ApiServer ||
    id === PlatformId.Webhook ||
    id === PlatformId.Teams
      ? (agent.endpoints?.[id] ?? undefined)
      : undefined;

  switch (id) {
    case PlatformId.ApiServer: {
      if (!isApiServerEnabled(agent)) {
        return {
          status: "unavailable",
          reason: "Set API_SERVER_ENABLED=true (or config.gateway.api_server.enabled).",
        };
      }
      return { status: "available", ...(endpoint && { endpoint }) };
    }
    case PlatformId.Webhook: {
      if (!isWebhookEnabled(agent)) {
        return {
          status: "unavailable",
          reason: "Set WEBHOOK_ENABLED=true (and the WEBHOOK_SECRET env entry).",
        };
      }
      return { status: "available", ...(endpoint && { endpoint }) };
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
        const extra = agent.config?.platforms?.teams?.extra;
        const missing: string[] = [];
        if (!(extra?.client_id?.trim() || env.some((v) => v.name === "TEAMS_CLIENT_ID" && v.value.trim() !== ""))) {
          missing.push("client_id");
        }
        if (!env.some((v) => v.name === "TEAMS_CLIENT_SECRET" && v.value.trim() !== "")) {
          missing.push("client_secret");
        }
        if (!(extra?.tenant_id?.trim() || env.some((v) => v.name === "TEAMS_TENANT_ID" && v.value.trim() !== ""))) {
          missing.push("tenant_id");
        }
        return {
          status: "unavailable",
          reason:
            `Missing credential${missing.length > 1 ? "s" : ""}: ${missing.join(", ")} ` +
            "(client_id/tenant_id via config.platforms.teams.extra or the matching " +
            "TEAMS_* env var; client_secret via the TEAMS_CLIENT_SECRET env var).",
        };
      }
      return { status: "available", ...(endpoint && { endpoint }) };
    }
  }
}